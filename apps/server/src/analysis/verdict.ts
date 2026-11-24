import { verdicts, type AlertCheck, type CheckKey, type CheckStatus, type Verdict } from "@vigie/shared";
import type { AiAnalysis } from "./ai.ts";
import type { Finding } from "./types.ts";

/**
 * Combine les constats en un verdict.
 * - Un constat très grave (poids ≥ 80) suffit pour « Arnaque ».
 * - Sinon on additionne : ≥ 90 → Arnaque, ≥ 35 → Douteux.
 * - L'IA peut aggraver un verdict, jamais l'adoucir : un faux négatif coûte bien plus cher
 *   qu'une fausse alerte pour une personne âgée.
 */
export function scoreFindings(findings: Finding[]): { verdict: Verdict; score: number } {
  const risky = findings.filter((f) => f.level !== "ok");
  const perCheck = new Map<CheckKey, number>();
  for (const f of risky) perCheck.set(f.check, Math.min(100, (perCheck.get(f.check) ?? 0) + f.weight));
  const score = [...perCheck.values()].reduce((a, b) => a + b, 0);
  if (risky.some((f) => f.weight >= 80) || score >= 90) return { verdict: "scam", score };
  if (score >= 35) return { verdict: "suspicious", score };
  return { verdict: "safe", score };
}

export function mergeWithAi(rules: Verdict, ai: AiAnalysis | null): Verdict {
  if (!ai) return rules;
  let aiVerdict: Verdict = ai.verdict;
  // Une IA peu sûre d'elle ne peut que signaler un doute.
  if (ai.confidence === "low") {
    if (aiVerdict === "scam") aiVerdict = "suspicious";
    else if (aiVerdict === "suspicious" && rules === "safe") aiVerdict = "safe";
  }
  return verdicts[aiVerdict].severity > verdicts[rules].severity ? aiVerdict : rules;
}

const aiSignalText: Record<AiAnalysis["text_signals"][number], { weight: number; reason: string }> = {
  urgency: { weight: 10, reason: "Le message vous presse d'agir vite." },
  small_fee: { weight: 30, reason: "Le message réclame de petits frais, une technique d'arnaque classique." },
  card_or_bank_details: { weight: 40, reason: "Le message cherche à obtenir vos informations bancaires." },
  security_code: { weight: 40, reason: "Le message cherche à obtenir un code de confirmation. Ne le donnez jamais." },
  credentials: { weight: 30, reason: "Le message cherche à obtenir vos identifiants." },
  threat: { weight: 20, reason: "Le message vous menace pour vous faire agir sans réfléchir." },
  too_good_to_be_true: { weight: 20, reason: "Le message promet de l'argent ou un cadeau trop beau pour être vrai." },
  impersonation: { weight: 30, reason: "L'expéditeur se fait passer pour quelqu'un d'autre." },
  payment_request: { weight: 35, reason: "Le message vous demande de payer ou de faire un virement." },
  fake_relative: { weight: 45, reason: "Quelqu'un se fait passer pour un proche : appelez-le sur son numéro habituel." },
};

/** Traduit l'avis de l'IA en constats lisibles (texte et site). */
export function aiFindings(ai: AiAnalysis | null, officialDomainForImitated: (brand: string) => boolean): Finding[] {
  if (!ai || ai.verdict === "safe") return [];
  const out: Finding[] = [];
  for (const s of ai.text_signals) {
    const m = aiSignalText[s];
    out.push({ check: "text", level: m.weight >= 30 ? "danger" : "warning", weight: m.weight, reason: m.reason });
  }
  if (ai.site?.imitates_brand && !officialDomainForImitated(ai.site.imitates_brand)) {
    out.push({ check: "site", level: "danger", weight: 90, reason: `Le site imite celui de ${ai.site.imitates_brand}, mais ce n'est pas le vrai.` });
  }
  if (ai.site?.asks_for.includes("card")) {
    out.push({ check: "site", level: "danger", weight: 50, reason: "Le site demande votre numéro de carte bancaire." });
  } else if (ai.site?.asks_for.length) {
    out.push({ check: "site", level: "warning", weight: 25, reason: "Le site demande des informations personnelles." });
  }
  return out;
}

const checkTitles: Record<CheckKey, string> = {
  sender: "L'expéditeur",
  links: "Les liens",
  site: "Le site",
  text: "Le message",
};

/** Les 4 vérifications affichées dans le détail d'une alerte. */
export function buildChecks(findings: Finding[], defaults: Record<CheckKey, { status: CheckStatus; detail: string }>): AlertCheck[] {
  return (["sender", "links", "site", "text"] as CheckKey[]).map((key) => {
    const own = findings.filter((f) => f.check === key).sort((a, b) => b.weight - a.weight);
    if (!own.length) return { key, title: checkTitles[key], ...defaults[key] };
    const top = own[0]!;
    const status: CheckStatus = own.some((f) => f.level === "danger") ? "danger" : own.some((f) => f.level === "warning") ? "warning" : "ok";
    const second = own[1] && own[1].level !== "ok" && status !== "ok" ? ` ${own[1].reason}` : "";
    return { key, title: checkTitles[key], status, detail: top.reason + second };
  });
}

export function adviceFor(verdict: Verdict, source: string): string {
  if (verdict === "scam") {
    const report = source === "sms" ? " Vous pouvez le signaler gratuitement en le transférant au 33700." : "";
    return `Ne cliquez sur aucun lien, ne répondez pas et ne donnez aucune information. Vous pouvez supprimer ce message.${report}`;
  }
  if (verdict === "suspicious") {
    return "Dans le doute, ne cliquez pas. Allez vous-même sur le site officiel ou appelez le numéro habituel de l'organisme.";
  }
  return "Rien d'inquiétant : vous pouvez le lire normalement.";
}
