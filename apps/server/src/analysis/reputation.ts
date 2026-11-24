import { config } from "../config.ts";
import { one, pool } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { registrableDomain } from "./brands.ts";
import type { SiteScan } from "./types.ts";

// ───────────── Âge du domaine (RDAP) ─────────────
// On interroge directement le registre de chaque extension via le fichier d'amorçage
// de l'IANA (RFC 9224), mis en cache 24 h. rdap.org n'est qu'un secours (bénévole, limité).

let bootstrap: { at: number; services: Map<string, string> } | null = null;
const FALLBACK_RDAP: Record<string, string> = { fr: "https://rdap.nic.fr/" };

async function rdapBase(tld: string): Promise<string | null> {
  if (!bootstrap || Date.now() - bootstrap.at > 24 * 3600_000) {
    try {
      const res = await fetch("https://data.iana.org/rdap/dns.json", { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as { services: Array<[string[], string[]]> };
      const services = new Map<string, string>();
      for (const [tlds, urls] of json.services) for (const t of tlds) if (urls[0]) services.set(t, urls[0]);
      bootstrap = { at: Date.now(), services };
    } catch (err) {
      log.warn("rdap.bootstrap_failed", { error: (err as Error).message });
    }
  }
  return bootstrap?.services.get(tld) ?? FALLBACK_RDAP[tld] ?? null;
}

/** Nombre de jours depuis l'enregistrement du domaine, ou null si inconnu. Mis en cache 30 jours. */
export async function domainAgeDays(host: string): Promise<number | null> {
  const domain = registrableDomain(host);
  const cached = await one<{ registered_at: Date | null; fresh: boolean }>(
    "select registered_at, checked_at > now() - interval '30 days' as fresh from domain_intel where domain = $1",
    [domain],
  );
  let registered: Date | null = cached?.fresh ? cached.registered_at : null;
  if (!cached?.fresh) {
    registered = await fetchRegistration(domain);
    await pool.query(
      `insert into domain_intel (domain, registered_at, checked_at) values ($1, $2, now())
       on conflict (domain) do update set registered_at = excluded.registered_at, checked_at = now()`,
      [domain, registered],
    );
  }
  return registered ? Math.floor((Date.now() - registered.getTime()) / 86_400_000) : null;
}

async function fetchRegistration(domain: string): Promise<Date | null> {
  const tld = domain.split(".").pop() ?? "";
  const base = (await rdapBase(tld)) ?? "https://rdap.org/";
  try {
    const res = await fetch(new URL(`domain/${domain}`, base.endsWith("/") ? base : base + "/"), {
      headers: { accept: "application/rdap+json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { events?: Array<{ eventAction: string; eventDate: string }> };
    const ev = json.events?.find((e) => e.eventAction === "registration");
    return ev ? new Date(ev.eventDate) : null;
  } catch {
    return null;
  }
}

// ───────────── Listes noires ─────────────

/**
 * Google Web Risk (l'API Safe Browsing gratuite est réservée à l'usage non commercial).
 * Renvoie un libellé lisible si l'URL est connue comme dangereuse.
 */
export async function webRisk(url: string): Promise<string | null> {
  return (await webRiskCheck(url)).hit;
}

/** Comme `webRisk`, mais dit si le contrôle a réellement eu lieu (clé absente, réseau ou API en erreur → `checked: false`). */
export async function webRiskCheck(url: string): Promise<{ hit: string | null; checked: boolean }> {
  if (!config.WEB_RISK_API_KEY) return { hit: null, checked: false };
  const qs = new URLSearchParams({ uri: url, key: config.WEB_RISK_API_KEY });
  for (const t of ["SOCIAL_ENGINEERING", "MALWARE", "UNWANTED_SOFTWARE"]) qs.append("threatTypes", t);
  try {
    const res = await fetch(`https://webrisk.googleapis.com/v1/uris:search?${qs}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { hit: null, checked: false };
    const json = (await res.json()) as { threat?: { threatTypes?: string[] } };
    return { hit: json.threat?.threatTypes?.length ? "liste Google" : null, checked: true };
  } catch {
    return { hit: null, checked: false };
  }
}

/** URLhaus (abuse.ch) — clé obligatoire ; vérifier les conditions d'usage commercial avant activation. */
export async function urlhaus(url: string): Promise<string | null> {
  if (!config.URLHAUS_AUTH_KEY) return null;
  try {
    const res = await fetch("https://urlhaus-api.abuse.ch/v1/url/", {
      method: "POST",
      headers: { "Auth-Key": config.URLHAUS_AUTH_KEY, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ url }),
      signal: AbortSignal.timeout(3000),
    });
    const json = (await res.json()) as { query_status?: string };
    return json.query_status === "ok" ? "liste URLhaus" : null;
  } catch {
    return null;
  }
}

// ───────────── Visite dans le navigateur isolé ─────────────

/** Demande au service « scanner » (conteneur séparé, sans accès aux données) de visiter un lien. */
export async function scanSite(url: string): Promise<SiteScan | null> {
  if (!config.SCANNER_URL) return null;
  try {
    const res = await fetch(new URL("/scan", config.SCANNER_URL), {
      method: "POST",
      headers: { "content-type": "application/json", "x-scanner-secret": config.SCANNER_SECRET ?? "" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SiteScan;
  } catch (err) {
    log.warn("scanner.failed", { error: (err as Error).message });
    return null;
  }
}
