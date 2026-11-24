import { normalizePhone } from "@vigie/shared";
import {
  findBrandIn,
  freeMailDomains,
  isOfficialDomain,
  lookalikeBrand,
  officialBrandForDomain,
  registrableDomain,
  type Brand,
} from "./brands.ts";
import type { Finding, MessageInput } from "./types.ts";

export interface SenderAnalysis {
  findings: Finding[];
  /** Marque revendiquée par le message (nom affiché, objet, texte). */
  claimedBrand: Brand | null;
  /** Le mail vient d'un domaine officiel ET l'authentification est valide. */
  verifiedOfficial: boolean;
  domain: string | null;
}

export interface AuthResults {
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
}

/** Lit les verdicts SPF/DKIM/DMARC posés par le fournisseur de mail (en-têtes Authentication-Results). */
export function parseAuthResults(headers: string[] | undefined): AuthResults {
  const out: AuthResults = { spf: null, dkim: null, dmarc: null };
  // Le premier en-tête est celui du fournisseur destinataire (le plus fiable).
  const h = (headers ?? [])[0]?.toLowerCase() ?? "";
  for (const key of ["spf", "dkim", "dmarc"] as const) {
    const m = h.match(new RegExp(`\\b${key}=([a-z]+)`));
    if (m) out[key] = m[1]!;
  }
  return out;
}

export function emailDomain(address: string | null | undefined): string | null {
  const m = address?.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/);
  return m ? m[1]! : null;
}

export function analyzeSender(input: MessageInput, ctx: { hasLinks: boolean }): SenderAnalysis {
  const findings: Finding[] = [];
  const add = (level: Finding["level"], weight: number, reason: string) =>
    findings.push({ check: "sender", level, weight, reason });

  const nameBrand = findBrandIn(input.fromName);
  // Marque mise en avant (nom affiché ou objet) : c'est ce que l'expéditeur prétend être.
  const headerBrand = nameBrand ?? findBrandIn(input.subject);
  // Marque simplement citée dans le texte : sert de contexte, jamais de preuve à elle seule.
  const contentBrand = headerBrand ?? findBrandIn(input.text.slice(0, 1500));
  const domain = emailDomain(input.fromAddress);
  let claimedBrand: Brand | null = contentBrand;
  let verifiedOfficial = false;

  if (domain) {
    const official = officialBrandForDomain(domain);
    const auth = parseAuthResults(input.headers?.authenticationResults);
    const authFailed = auth.dmarc === "fail" || (auth.spf === "fail" && auth.dkim !== "pass");

    if (official) {
      claimedBrand = official;
      if (authFailed) {
        add("danger", 85, `Le mail prétend venir de ${official.name}, mais l'adresse a été falsifiée.`);
      } else {
        verifiedOfficial = auth.dmarc === "pass" || auth.dkim === "pass";
        add("ok", 0, `Le mail vient bien de ${official.name} (${domain}).`);
      }
    } else {
      const imitated = lookalikeBrand(domain);
      if (imitated) {
        claimedBrand = imitated;
        add("danger", 85, `L'adresse imite celle de ${imitated.name} : ${domain} n'est pas un site officiel.`);
      } else if (headerBrand && freeMailDomains.has(registrableDomain(domain)) && headerBrand.kind !== "tech") {
        add("danger", 70, `Il se présente comme ${headerBrand.name}, mais écrit depuis une adresse ${registrableDomain(domain)}. ${headerBrand.name} ne fait jamais ça.`);
      } else if (nameBrand && !isOfficialDomain(nameBrand, domain)) {
        add("danger", 70, `Il se présente comme ${nameBrand.name}, mais le mail vient de ${domain}, qui n'appartient pas à ${nameBrand.name}.`);
      } else if (headerBrand) {
        add("warning", 20, `Le mail parle de ${headerBrand.name} mais ne vient pas de ${headerBrand.name}.`);
      }
      if (domain.startsWith("xn--") || domain.includes(".xn--")) {
        add("warning", 40, "L'adresse utilise des caractères trompeurs.");
      }
      if (authFailed) add("warning", 35, "L'adresse de l'expéditeur n'a pas pu être vérifiée.");
    }

    const replyDomain = emailDomain(input.headers?.replyTo);
    if (replyDomain && registrableDomain(replyDomain) !== registrableDomain(domain) && claimedBrand) {
      add("warning", 30, `Les réponses partiraient vers une autre adresse (${replyDomain}).`);
    }
  } else if (input.senderId) {
    // SMS / messageries : un numéro de portable qui se présente comme une entreprise.
    const phone = normalizePhone(input.senderId);
    const isMobile = !!phone && /^\+33[67]/.test(phone);
    if (contentBrand && isMobile && ctx.hasLinks) {
      add("danger", 55, `Le message parle au nom de ${contentBrand.name}, mais vient d'un numéro de portable. Les vrais messages de ${contentBrand.name} n'arrivent pas comme ça.`);
    } else if (phone && !phone.startsWith("+33") && phone.startsWith("+")) {
      add("warning", 25, "Le message vient d'un numéro étranger.");
    }
  }

  return { findings, claimedBrand, verifiedOfficial, domain };
}
