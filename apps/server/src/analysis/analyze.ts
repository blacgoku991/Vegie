import type { CheckKey, CheckStatus } from "@vigie/shared";
import { findBrandIn, isOfficialDomain, officialBrandForDomain, registrableDomain } from "./brands.ts";
import { aiAnalyze, aiEnabled } from "./ai.ts";
import { extractLinks, reputationFindings, staticLinkFindings } from "./links.ts";
import { domainAgeDays, scanSite, urlhaus, webRiskCheck } from "./reputation.ts";
import { analyzeSender } from "./sender.ts";
import { textFindings } from "./text-rules.ts";
import { adviceFor, aiFindings, buildChecks, INCOMPLETE_ADVICE, INCOMPLETE_EXPLANATION, mergeWithAi, scoreFindings } from "./verdict.ts";
import type { AnalysisResult, Finding, LinkInfo, MessageInput, SiteScan } from "./types.ts";

export interface AnalyzeOptions {
  /** Visite des sites + IA. Désactivé pour les réponses quasi instantanées (filtre SMS iOS). */
  deep: boolean;
  /** Budget maximal pour les vérifications réseau (ms). */
  budgetMs?: number;
}

const withTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export async function analyze(input: MessageInput, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const budget = opts.budgetMs ?? 15_000;
  const links = extractLinks(input.text, input.html);
  const sender = analyzeSender(input, { hasLinks: links.length > 0 });
  const brand = sender.claimedBrand;

  // 1. Constats immédiats (hors réseau).
  const findings: Finding[] = [...sender.findings, ...staticLinkFindings(links, brand)];
  const text = textFindings(input.subject, input.text);
  // Un expéditeur officiel authentifié : on relâche les signaux de ton (promotions, relances…).
  findings.push(...(sender.verifiedOfficial ? text.map((f) => ({ ...f, weight: Math.round(f.weight / 3), level: "warning" as const })) : text));

  // 2. Réputation des domaines non officiels (âge, listes noires), en parallèle.
  const candidates = pickCandidates(links);
  const reputation = await withTimeout(
    Promise.all(
      candidates.map(async (l) => {
        const [ageDays, risk, haus] = await Promise.all([domainAgeDays(l.host), webRiskCheck(l.url), urlhaus(l.url)]);
        return { ...l, ageDays, blacklisted: risk.hit ?? haus, webRiskChecked: risk.checked };
      }),
    ),
    Math.min(budget, 6000),
    [],
  );

  // 3. Visite des sites dans le navigateur isolé (capture, redirections, formulaires).
  const sites: SiteScan[] = opts.deep
    ? ((await withTimeout(Promise.all(candidates.slice(0, 2).map((l) => scanSite(l.url))), budget, [])).filter((s) => s?.reachable) as SiteScan[])
    : [];

  const linkInfos: LinkInfo[] = links.map((l) => {
    const rep = reputation.find((r) => r.url === l.url);
    const site = sites.find((s) => s.url === l.url);
    const finalHost = site ? safeHost(site.finalUrl) : null;
    return { url: l.url, host: l.host, label: l.label, finalUrl: site?.finalUrl ?? null, finalHost, domainAgeDays: rep?.ageDays ?? null };
  });

  findings.push(
    ...reputationFindings(
      reputation.map((r) => {
        const info = linkInfos.find((li) => li.url === r.url);
        const site = sites.find((s) => s.url === r.url);
        return { host: r.host, finalHost: info?.finalHost ?? null, ageDays: r.ageDays, blacklisted: r.blacklisted, chain: site?.chain ?? [] };
      }),
      brand,
    ),
  );
  for (const site of sites) {
    const host = safeHost(site.finalUrl) ?? "";
    const official = officialBrandForDomain(host);
    if (site.hasCardField && !official) findings.push({ check: "site", level: "danger", weight: 50, reason: "Le site demande votre numéro de carte bancaire." });
    else if (site.hasPasswordField && brand && !isOfficialDomain(brand, host)) {
      findings.push({ check: "site", level: "warning", weight: 30, reason: `Le site demande un mot de passe alors que ce n'est pas le site de ${brand.name}.` });
    }
  }

  // 4. IA : texte + captures, ancrée sur les faits vérifiés ci-dessus.
  const facts = buildFacts(sender.domain, brand?.name ?? null, sender.findings, linkInfos, reputation);
  const ai = opts.deep && aiEnabled() ? await aiAnalyze(input, facts, sites) : null;
  if (ai && ai.confidence !== "low") {
    findings.push(
      ...aiFindings(ai, (name) => {
        const b = findBrandIn(name);
        return !!b && sites.some((s) => isOfficialDomain(b, safeHost(s.finalUrl) ?? ""));
      }),
    );
  }

  // Contrôles importants qui n'ont pas pu avoir lieu : on ne conclura jamais « sûr » en vert.
  const missingChecks: string[] = [];
  if (candidates.length) {
    if (reputation.length < candidates.length) missingChecks.push("reputation");
    else {
      if (reputation.some((r) => !r.webRiskChecked)) missingChecks.push("web_risk");
      if (reputation.some((r) => r.ageDays == null)) missingChecks.push("domain_age");
    }
    if (sites.length < Math.min(candidates.length, 2)) missingChecks.push("site_visit");
  }
  if (opts.deep && aiEnabled() && !ai) missingChecks.push("ai");

  // 5. Verdict et explication.
  const { verdict: ruleVerdict } = scoreFindings(findings);
  const verdict = mergeWithAi(ruleVerdict, ai);
  const risky = findings.filter((f) => f.level !== "ok").sort((a, b) => b.weight - a.weight);
  let explanation: string;
  const incomplete = missingChecks.length > 0;
  if (verdict === "safe" && incomplete) {
    explanation = INCOMPLETE_EXPLANATION;
  } else if (verdict === "safe") {
    explanation = sender.verifiedOfficial && brand ? `Rien d'anormal : le message vient bien de ${brand.name}.` : "Aucun signe d'arnaque détecté dans ce message.";
  } else if (ai && ai.verdict === verdict && ai.explanation_fr) {
    explanation = ai.explanation_fr;
  } else {
    explanation = risky[0]?.reason ?? "Ce message présente des signes inhabituels.";
  }

  const imitated = verdict !== "safe" ? (ai?.impersonated_brand ?? brand?.name ?? null) : null;

  return {
    verdict,
    explanation,
    advice: verdict === "safe" && incomplete ? INCOMPLETE_ADVICE : adviceFor(verdict, input.source),
    title: titleFor(input),
    findings,
    links: linkInfos,
    brand: imitated,
    aiUsed: !!ai,
    incomplete,
    missingChecks,
  };
}

export function checksFor(result: AnalysisResult, input: { hasSender: boolean; deep: boolean }) {
  const hasLinks = result.links.length > 0;
  const visited = result.links.some((l) => l.finalUrl);
  const defaults: Record<CheckKey, { status: CheckStatus; detail: string }> = {
    sender: input.hasSender ? { status: "ok", detail: "Rien d'anormal sur l'expéditeur." } : { status: "unknown", detail: "L'expéditeur n'est pas connu." },
    links: !hasLinks
      ? { status: "ok", detail: "Aucun lien dans ce message." }
      : result.missingChecks.some((m) => m === "reputation" || m === "web_risk" || m === "domain_age")
        ? { status: "unknown", detail: "Les liens n'ont pas pu être tous vérifiés. Restez prudent." }
        : { status: "ok", detail: "Les liens ne sont pas connus comme dangereux." },
    site: !hasLinks
      ? { status: "ok", detail: "Aucun site à vérifier." }
      : visited
        ? { status: "ok", detail: "Le site visité n'imite aucune marque connue." }
        : { status: "unknown", detail: "Le site n'a pas été visité." },
    text: { status: "ok", detail: "Le ton du message est normal." },
  };
  return buildChecks(result.findings, defaults);
}

function pickCandidates(links: Array<{ url: string; host: string }>) {
  const seen = new Set<string>();
  const out: Array<{ url: string; host: string }> = [];
  for (const l of links) {
    const reg = registrableDomain(l.host);
    if (seen.has(reg) || officialBrandForDomain(l.host)) continue;
    seen.add(reg);
    out.push(l);
    if (out.length >= 3) break;
  }
  return out;
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function buildFacts(
  domain: string | null,
  brand: string | null,
  senderFindings: Finding[],
  links: LinkInfo[],
  reputation: Array<{ url: string; ageDays: number | null; blacklisted: string | null }>,
): string[] {
  const facts: string[] = [];
  if (domain) facts.push(`Sender email domain: ${domain}`);
  if (brand) facts.push(`Organisation claimed or mentioned: ${brand}`);
  for (const f of senderFindings) facts.push(`Sender check: ${f.reason}`);
  for (const l of links.slice(0, 6)) {
    const rep = reputation.find((r) => r.url === l.url);
    const parts = [`Link to ${l.host}`];
    if (l.finalHost && l.finalHost !== l.host) parts.push(`redirects to ${l.finalHost}`);
    if (rep?.ageDays != null) parts.push(`domain registered ${rep.ageDays} days ago`);
    if (rep?.blacklisted) parts.push(`listed as dangerous (${rep.blacklisted})`);
    if (officialBrandForDomain(l.host)) parts.push(`official domain of ${officialBrandForDomain(l.host)!.name}`);
    facts.push(parts.join(", "));
  }
  return facts;
}

function titleFor(input: MessageInput): string {
  const base = (input.subject || input.text).replace(/\s+/g, " ").trim();
  return base.length > 70 ? base.slice(0, 67).trimEnd() + "…" : base || "Message sans objet";
}
