import { isOfficialDomain, lookalikeBrand, officialBrandForDomain, registrableDomain, urlShorteners, type Brand } from "./brands.ts";
import type { Finding } from "./types.ts";

export interface ExtractedLink {
  url: string;
  host: string;
  label: string | null;
}

const TLDS = "fr|com|net|org|info|xyz|top|online|site|shop|live|app|io|co|me|eu|cc|icu|vip|club|support|help|link|click|store|pro|biz|ru|cn|tk";
const URL_RE = /\bhttps?:\/\/[^\s<>"'()\]]+/gi;
// SMS : liens souvent écrits sans « https:// » (ex. « ameli-remb.com/dossier »).
const BARE_RE = new RegExp(`\\b(?:www\\.)?(?:[a-z0-9-]+\\.)+(?:${TLDS})(?:\\/[^\\s<>"']*)?`, "gi");
const ANCHOR_RE = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

function toUrl(raw: string): URL | null {
  const cleaned = raw.replace(/[.,;:!?)»]+$/, "");
  try {
    const u = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
    if (!u.hostname.includes(".")) return null;
    return u;
  } catch {
    return null;
  }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** Extrait les liens d'un message (HTML et texte brut), dédoublonnés. Adresses mail ignorées. */
export function extractLinks(text: string, html?: string | null): ExtractedLink[] {
  const found = new Map<string, ExtractedLink>();
  const push = (raw: string, label: string | null) => {
    const u = toUrl(raw);
    if (!u || !/^https?:$/.test(u.protocol)) return;
    const key = u.toString();
    if (!found.has(key)) found.set(key, { url: key, host: u.hostname.toLowerCase(), label });
  };
  if (html) {
    for (const m of html.matchAll(ANCHOR_RE)) {
      if (/^https?:/i.test(m[1]!)) push(m[1]!, stripTags(m[2]!) || null);
    }
  }
  const plain = text.replace(/\S+@\S+\.\S+/g, " ");
  for (const m of plain.matchAll(URL_RE)) push(m[0], null);
  for (const m of plain.matchAll(BARE_RE)) {
    if (!/^https?:\/\//i.test(m[0]) && !plain.includes(`://${m[0]}`)) push(m[0], null);
  }
  return [...found.values()].slice(0, 20);
}

const isIp = (host: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");

/** Constats sans réseau : imitation, raccourcisseur, lien maquillé, adresse IP. */
export function staticLinkFindings(links: ExtractedLink[], claimedBrand: Brand | null): Finding[] {
  const out: Finding[] = [];
  const add = (level: Finding["level"], weight: number, reason: string) => out.push({ check: "links", level, weight, reason });
  if (!links.length) return out;

  let allOfficial = true;
  for (const link of links) {
    const official = officialBrandForDomain(link.host);
    if (!official) allOfficial = false;
    const imitated = lookalikeBrand(link.host);
    if (imitated) {
      add("danger", 85, `Un lien mène vers ${registrableDomain(link.host)}, un faux site qui imite ${imitated.name}.`);
      continue;
    }
    if (isIp(link.host)) add("danger", 60, "Un lien mène vers une adresse technique cachée, pas vers un vrai site.");
    if (urlShorteners.has(registrableDomain(link.host)) || urlShorteners.has(link.host)) {
      add("warning", 25, "Un lien est raccourci pour cacher sa vraie destination.");
    }
    // Lien « maquillé » : le texte affiche un site, le lien en ouvre un autre.
    const shown = link.label?.match(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})\b/i)?.[1]?.toLowerCase();
    if (shown && registrableDomain(shown) !== registrableDomain(link.host) && !urlShorteners.has(registrableDomain(link.host))) {
      const tracking = official && claimedBrand && isOfficialDomain(claimedBrand, link.host);
      if (!tracking) add("danger", 60, `Le lien affiche « ${shown} » mais ouvre en réalité ${registrableDomain(link.host)}.`);
    }
    if (claimedBrand && !official && !imitated) {
      add("warning", 30, `Un lien mène vers ${registrableDomain(link.host)}, qui n'est pas le site de ${claimedBrand.name}.`);
    }
  }
  if (allOfficial && claimedBrand) {
    out.push({ check: "links", level: "ok", weight: 0, reason: `Les liens mènent bien au site officiel de ${claimedBrand.name}.` });
  }
  return dedupe(out);
}

/** Constats après visite et vérification de réputation. */
export function reputationFindings(
  info: Array<{ host: string; finalHost: string | null; ageDays: number | null; blacklisted: string | null; chain: string[] }>,
  claimedBrand: Brand | null,
): Finding[] {
  const out: Finding[] = [];
  const add = (level: Finding["level"], weight: number, reason: string) => out.push({ check: "links", level, weight, reason });
  for (const l of info) {
    if (l.blacklisted) add("danger", 100, `Ce lien est déjà connu comme dangereux (${l.blacklisted}).`);
    if (l.ageDays !== null && l.ageDays < 30) {
      add("danger", 50, `Le site ${registrableDomain(l.finalHost ?? l.host)} a été créé il y a seulement ${l.ageDays} jour${l.ageDays > 1 ? "s" : ""}.`);
    } else if (l.ageDays !== null && l.ageDays < 180) {
      add("warning", 20, `Le site ${registrableDomain(l.finalHost ?? l.host)} est très récent (${Math.round(l.ageDays / 30)} mois).`);
    }
    if (l.finalHost && registrableDomain(l.finalHost) !== registrableDomain(l.host)) {
      const imitated = lookalikeBrand(l.finalHost);
      if (imitated) add("danger", 85, `Le lien redirige vers ${registrableDomain(l.finalHost)}, un faux site qui imite ${imitated.name}.`);
      else if (claimedBrand && !isOfficialDomain(claimedBrand, l.finalHost)) {
        add("warning", 30, `Le lien vous redirige vers ${registrableDomain(l.finalHost)}, qui n'est pas le site de ${claimedBrand.name}.`);
      }
    }
    if (l.chain.length > 3) add("warning", 15, "Le lien passe par plusieurs redirections avant d'arriver sur le site.");
  }
  return dedupe(out);
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => (seen.has(f.reason) ? false : (seen.add(f.reason), true)));
}
