import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Protection SSRF : le navigateur ne doit jamais atteindre le réseau interne
 * (métadonnées cloud, base de données, services privés), même via une redirection.
 */
const blockedV4: Array<[number, number]> = [
  [ip4("0.0.0.0"), 8],
  [ip4("10.0.0.0"), 8],
  [ip4("100.64.0.0"), 10],
  [ip4("127.0.0.0"), 8],
  [ip4("169.254.0.0"), 16],
  [ip4("172.16.0.0"), 12],
  [ip4("192.0.0.0"), 24],
  [ip4("192.168.0.0"), 16],
  [ip4("198.18.0.0"), 15],
  [ip4("224.0.0.0"), 4],
  [ip4("240.0.0.0"), 4],
];

function ip4(a: string): number {
  return a.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const n = ip4(address);
    return blockedV4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (v === 6) {
    const a = address.toLowerCase();
    if (a === "::" || a === "::1") return true;
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a);
  }
  return true;
}

const cache = new Map<string, { ok: boolean; at: number }>();

/**
 * Vrai si l'hôte ne résout que vers des adresses publiques.
 * `resolve: false` (proxy de sortie) : seules les IP littérales et les noms locaux sont vérifiés ici.
 */
export async function isPublicHost(host: string, opts: { resolve: boolean } = { resolve: true }): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  const hit = opts.resolve ? cache.get(h) : undefined;
  if (hit && Date.now() - hit.at < 60_000) return hit.ok;
  let ok: boolean;
  if (isIP(h)) ok = !isPrivateAddress(h);
  else if (!opts.resolve) ok = h.includes(".");
  else {
    try {
      const addrs = await lookup(h, { all: true, verbatim: true });
      ok = addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
    } catch {
      ok = false;
    }
  }
  cache.set(h, { ok, at: Date.now() });
  return ok;
}

export function checkUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.port && u.port !== "80" && u.port !== "443") return null;
    if (u.username || u.password) return null;
    return u;
  } catch {
    return null;
  }
}
