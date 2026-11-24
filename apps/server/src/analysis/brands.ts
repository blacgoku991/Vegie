/**
 * Marques et organismes les plus imités dans les arnaques visant les Français.
 * `domains` : domaines officiels (les sous-domaines sont acceptés).
 * `keywords` : façons dont la marque apparaît dans un nom d'expéditeur ou un texte (minuscules, sans accents).
 * `domainHints` : morceaux qui, présents dans un domaine NON officiel, signalent une imitation.
 *
 * Les numéros de téléphone officiels ne sont pas ici : ils viennent des banques partenaires
 * (table `banks`), car un faux numéro « officiel » serait dangereux.
 */
export interface Brand {
  id: string;
  name: string;
  kind: "bank" | "public" | "delivery" | "telecom" | "energy" | "commerce" | "tech";
  domains: string[];
  /** Domaines officiels décrits par motif (ex. caisses régionales du Crédit Agricole). */
  domainPatterns?: RegExp[];
  keywords: string[];
  domainHints: string[];
}

export const brands: Brand[] = [
  // Banques
  { id: "credit-agricole", name: "Crédit Agricole", kind: "bank", domains: ["credit-agricole.fr", "credit-agricole.com", "ca-assurances.com"], domainPatterns: [/^ca-[a-z0-9-]+\.fr$/], keywords: ["credit agricole", "credit-agricole"], domainHints: ["creditagricole", "credit-agricole", "credit-agricol"] },
  { id: "bnp-paribas", name: "BNP Paribas", kind: "bank", domains: ["bnpparibas.fr", "bnpparibas.com", "bnpparibas", "mabanque.bnpparibas"], keywords: ["bnp paribas", "bnp"], domainHints: ["bnpparibas", "bnp-paribas", "bnp"] },
  { id: "societe-generale", name: "Société Générale", kind: "bank", domains: ["societegenerale.fr", "societegenerale.com", "sg.fr"], keywords: ["societe generale"], domainHints: ["societegenerale", "societe-generale", "sogen"] },
  { id: "lcl", name: "LCL", kind: "bank", domains: ["lcl.fr", "lcl.com"], keywords: ["lcl", "le credit lyonnais"], domainHints: ["lcl-", "-lcl", "creditlyonnais"] },
  { id: "banque-postale", name: "La Banque Postale", kind: "bank", domains: ["labanquepostale.fr", "labanquepostale.com"], keywords: ["banque postale"], domainHints: ["banquepostale", "banque-postale", "labanquepostal"] },
  { id: "caisse-epargne", name: "Caisse d'Épargne", kind: "bank", domains: ["caisse-epargne.fr", "caisse-epargne.com"], keywords: ["caisse d'epargne", "caisse d epargne", "caisse epargne"], domainHints: ["caisse-epargne", "caisseepargne", "caisse-depargne"] },
  { id: "banque-populaire", name: "Banque Populaire", kind: "bank", domains: ["banquepopulaire.fr", "banquepopulaire.com"], keywords: ["banque populaire"], domainHints: ["banquepopulaire", "banque-populaire"] },
  { id: "credit-mutuel", name: "Crédit Mutuel", kind: "bank", domains: ["creditmutuel.fr", "creditmutuel.com", "cmne.fr", "cmso.com", "arkea.com"], keywords: ["credit mutuel"], domainHints: ["creditmutuel", "credit-mutuel"] },
  { id: "cic", name: "CIC", kind: "bank", domains: ["cic.fr", "cic.com"], keywords: ["cic"], domainHints: ["cic-", "-cic"] },
  { id: "boursobank", name: "BoursoBank", kind: "bank", domains: ["boursobank.com", "boursorama.com", "boursorama-banque.com", "boursorama.fr"], keywords: ["boursobank", "boursorama"], domainHints: ["boursobank", "boursorama", "bourso"] },
  { id: "hello-bank", name: "Hello bank!", kind: "bank", domains: ["hellobank.fr"], keywords: ["hello bank"], domainHints: ["hellobank", "hello-bank"] },
  { id: "fortuneo", name: "Fortuneo", kind: "bank", domains: ["fortuneo.fr", "fortuneo.com"], keywords: ["fortuneo"], domainHints: ["fortuneo"] },
  { id: "paypal", name: "PayPal", kind: "bank", domains: ["paypal.com", "paypal.fr", "paypal.me"], keywords: ["paypal"], domainHints: ["paypal", "paypa1", "pay-pal"] },

  // Services publics
  { id: "ameli", name: "l'Assurance Maladie (Ameli)", kind: "public", domains: ["ameli.fr", "assurance-maladie.fr"], keywords: ["ameli", "assurance maladie", "carte vitale", "cpam"], domainHints: ["ameli", "vitale", "cpam", "assurance-maladie"] },
  { id: "impots", name: "les impôts (DGFiP)", kind: "public", domains: ["impots.gouv.fr", "dgfip.finances.gouv.fr"], keywords: ["impots", "impot", "dgfip", "tresor public", "finances publiques"], domainHints: ["impot", "dgfip", "tresor-public", "finances-publiques"] },
  { id: "caf", name: "la CAF", kind: "public", domains: ["caf.fr"], keywords: ["caf", "allocations familiales"], domainHints: ["caf-", "allocations-familiales", "allocationsfamiliales"] },
  { id: "antai", name: "l'ANTAI (amendes)", kind: "public", domains: ["antai.gouv.fr", "amendes.gouv.fr"], keywords: ["antai", "amende", "avis de contravention"], domainHints: ["antai", "amende", "contravention"] },
  { id: "ants", name: "l'ANTS", kind: "public", domains: ["ants.gouv.fr"], keywords: ["ants", "carte grise", "permis de conduire"], domainHints: ["ants-gouv", "ants-titres", "cartegrise", "carte-grise"] },
  { id: "cpf", name: "Mon Compte Formation", kind: "public", domains: ["moncompteformation.gouv.fr"], keywords: ["compte formation", "cpf"], domainHints: ["cpf", "compteformation", "compte-formation"] },
  { id: "critair", name: "le certificat Crit'Air", kind: "public", domains: ["certificat-air.gouv.fr"], keywords: ["crit'air", "critair", "vignette crit"], domainHints: ["critair", "crit-air", "certificat-air"] },
  { id: "france-travail", name: "France Travail", kind: "public", domains: ["francetravail.fr", "pole-emploi.fr"], keywords: ["france travail", "pole emploi"], domainHints: ["francetravail", "france-travail", "pole-emploi"] },
  { id: "service-public", name: "Service Public", kind: "public", domains: ["service-public.fr", "service-public.gouv.fr", "franceconnect.gouv.fr"], keywords: ["service public", "franceconnect"], domainHints: ["service-public", "franceconnect"] },

  // Livraison
  { id: "la-poste", name: "La Poste", kind: "delivery", domains: ["laposte.fr", "laposte.net", "laposte.com"], keywords: ["la poste", "laposte"], domainHints: ["laposte", "la-poste"] },
  { id: "colissimo", name: "Colissimo", kind: "delivery", domains: ["colissimo.fr", "laposte.fr"], keywords: ["colissimo"], domainHints: ["colissimo", "colisimo"] },
  { id: "chronopost", name: "Chronopost", kind: "delivery", domains: ["chronopost.fr", "chronopost.com"], keywords: ["chronopost"], domainHints: ["chronopost", "chrono-post"] },
  { id: "mondial-relay", name: "Mondial Relay", kind: "delivery", domains: ["mondialrelay.fr", "mondialrelay.com"], keywords: ["mondial relay"], domainHints: ["mondialrelay", "mondial-relay"] },
  { id: "dhl", name: "DHL", kind: "delivery", domains: ["dhl.com", "dhl.fr", "dhl.de"], keywords: ["dhl"], domainHints: ["dhl"] },

  // Télécoms, énergie
  { id: "orange", name: "Orange", kind: "telecom", domains: ["orange.fr", "orange.com", "sosh.fr"], keywords: ["orange"], domainHints: ["orange-", "-orange", "orangefr"] },
  { id: "sfr", name: "SFR", kind: "telecom", domains: ["sfr.fr", "sfr.com", "red-by-sfr.fr"], keywords: ["sfr"], domainHints: ["sfr-", "-sfr"] },
  { id: "free", name: "Free", kind: "telecom", domains: ["free.fr", "free.com", "iliad.fr"], keywords: ["free mobile", "freebox"], domainHints: ["freemobile", "free-mobile", "freebox"] },
  { id: "bouygues", name: "Bouygues Telecom", kind: "telecom", domains: ["bouyguestelecom.fr", "b-and-you.fr"], keywords: ["bouygues"], domainHints: ["bouygues"] },
  { id: "edf", name: "EDF", kind: "energy", domains: ["edf.fr", "edf.com"], keywords: ["edf"], domainHints: ["edf-", "-edf"] },
  { id: "engie", name: "Engie", kind: "energy", domains: ["engie.fr", "engie.com"], keywords: ["engie"], domainHints: ["engie"] },

  // Commerce, tech
  { id: "amazon", name: "Amazon", kind: "commerce", domains: ["amazon.fr", "amazon.com", "amazon.de"], keywords: ["amazon"], domainHints: ["amazon", "amaz0n", "amzn-"] },
  { id: "netflix", name: "Netflix", kind: "commerce", domains: ["netflix.com"], keywords: ["netflix"], domainHints: ["netflix", "netfIix"] },
  { id: "vinted", name: "Vinted", kind: "commerce", domains: ["vinted.fr", "vinted.com"], keywords: ["vinted"], domainHints: ["vinted"] },
  { id: "leboncoin", name: "leboncoin", kind: "commerce", domains: ["leboncoin.fr"], keywords: ["leboncoin", "le bon coin"], domainHints: ["leboncoin", "le-bon-coin", "lebon-coin"] },
  { id: "apple", name: "Apple", kind: "tech", domains: ["apple.com", "icloud.com"], keywords: ["apple", "icloud"], domainHints: ["apple-id", "appleid", "apple-support", "icloud-"] },
  { id: "microsoft", name: "Microsoft", kind: "tech", domains: ["microsoft.com", "outlook.com", "live.com", "office.com", "microsoftonline.com"], keywords: ["microsoft", "outlook", "office 365"], domainHints: ["microsoft", "micros0ft", "office365"] },
];

/** Fournisseurs de mail grand public : une banque ou une administration n'écrit jamais depuis ces adresses. */
export const freeMailDomains = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.fr", "hotmail.com", "hotmail.fr", "live.com", "live.fr", "msn.com",
  "yahoo.com", "yahoo.fr", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "laposte.net", "gmx.fr", "gmx.com",
  "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me",
]);

/** Raccourcisseurs d'URL : ils cachent la vraie destination. */
export const urlShorteners = new Set([
  "bit.ly", "tinyurl.com", "t.co", "cutt.ly", "rebrand.ly", "is.gd", "shorturl.at", "s.id", "ow.ly", "rb.gy", "t.ly",
  "tiny.cc", "lnkd.in", "buff.ly", "bl.ink", "short.io", "urlz.fr", "goo.su", "v.gd",
]);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'");
}

/** Marque revendiquée dans un texte (nom d'expéditeur, objet…). Mots entiers uniquement. */
export function findBrandIn(text: string | null | undefined): Brand | null {
  if (!text) return null;
  const t = ` ${normalizeText(text).replace(/[^a-z0-9']+/g, " ")} `;
  let best: { brand: Brand; len: number } | null = null;
  for (const brand of brands) {
    for (const kw of brand.keywords) {
      if (t.includes(` ${kw} `) && (!best || kw.length > best.len)) best = { brand, len: kw.length };
    }
  }
  return best?.brand ?? null;
}

export function isOfficialDomain(brand: Brand, host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (brand.domains.some((d) => h === d || h.endsWith("." + d))) return true;
  const reg = registrableDomain(h);
  return (brand.domainPatterns ?? []).some((p) => p.test(reg));
}

export function officialBrandForDomain(host: string): Brand | null {
  return brands.find((b) => isOfficialDomain(b, host)) ?? null;
}

const multiPartSuffixes = new Set([
  "gouv.fr", "asso.fr", "com.fr", "nom.fr", "co.uk", "org.uk", "com.au", "co.jp", "com.br", "co.nz", "com.tr", "com.cn", "co.za",
]);

/** Domaine « enregistrable » approximatif : impots.gouv.fr, exemple.co.uk, exemple.com. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return multiPartSuffixes.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

const homoglyphs: Record<string, string> = { "0": "o", "1": "l", "3": "e", "5": "s", "4": "a", "7": "t", "rn": "m", "vv": "w" };

function deHomoglyph(s: string): string {
  let out = s;
  for (const [k, v] of Object.entries(homoglyphs)) out = out.split(k).join(v);
  return out;
}

/** Les indices courts (« ameli », « bnp ») doivent être des mots entiers, pour ne pas viser « amelie.fr ». */
function hintMatches(host: string, hint: string): boolean {
  if (hint.length >= 6 || hint.includes("-")) return host.includes(hint);
  return new RegExp(`(^|[^a-z])${hint}s?([^a-z]|$)`).test(host);
}

/**
 * Le domaine imite-t-il une marque ? Renvoie la marque imitée, ou null.
 * Ex. « credit-agricole-securite.com », « arneli.fr », « labanquepostale-info.net », « xn--… ».
 */
export function lookalikeBrand(host: string): Brand | null {
  const h = host.toLowerCase();
  if (officialBrandForDomain(h)) return null;
  const reg = registrableDomain(h);
  const label = reg.split(".")[0] ?? "";
  const full = deHomoglyph(h);
  for (const brand of brands) {
    // 1) Un morceau caractéristique de la marque dans un domaine qui n'est pas le sien.
    if (brand.domainHints.some((hint) => hintMatches(full, hint.toLowerCase()))) return brand;
    for (const d of brand.domains) {
      const officialLabel = d.split(".")[0] ?? "";
      if (!officialLabel || label === officialLabel) continue;
      const normalized = deHomoglyph(label);
      // 2) Caractères trompeurs : « arneli » (rn → m), « paypa1 » (1 → l).
      if (normalized === officialLabel) return brand;
      // 3) Faute de frappe volontaire (distance ≤ 1, ou ≤ 2 pour les noms longs).
      if (officialLabel.length >= 6) {
        const dist = levenshtein(normalized, officialLabel);
        if (dist > 0 && dist <= (officialLabel.length >= 9 ? 2 : 1)) return brand;
      }
    }
  }
  return null;
}
