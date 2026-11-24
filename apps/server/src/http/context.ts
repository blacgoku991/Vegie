import type { FastifyReply, FastifyRequest } from "fastify";
import { one, pool, type Queryable } from "../db/pool.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { isProd } from "../config.ts";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = "Ressource introuvable") => new HttpError(404, "not_found", what);

export const CONSOLE_COOKIE = "vigie_console";

function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export async function createSession(kind: "user" | "advisor", id: string, days: number, db: Queryable = pool): Promise<string> {
  const token = randomToken();
  await one(
    `insert into sessions (token_hash, ${kind === "user" ? "user_id" : "advisor_id"}, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), id, String(days)], db,
  );
  return token;
}

export async function destroySession(token: string) {
  await one("delete from sessions where token_hash = $1", [sha256(token)]);
}

/** Utilisateur de l'app mobile (jeton Bearer stocké dans le trousseau du téléphone). */
export async function requireUser(req: FastifyRequest): Promise<string> {
  const token = bearer(req);
  if (token) {
    const row = await one<{ user_id: string | null }>(
      "select user_id from sessions where token_hash = $1 and expires_at > now()",
      [sha256(token)],
    );
    if (row?.user_id) return row.user_id;
  }
  throw new HttpError(401, "unauthorized", "Session expirée. Reconnectez-vous.");
}

export type StaffRole = "superadmin" | "bank_admin" | "advisor";

export interface StaffCtx {
  id: string;
  role: StaffRole;
  /** null pour le superadmin. */
  bankId: string | null;
  name: string;
  agency: string;
  agencyId: string | null;
  email: string;
  outboundNumber: string | null;
  bankName: string;
}

/** Membre d'une banque (conseiller ou responsable) : `bankId` est toujours défini. */
export interface AdvisorCtx extends StaffCtx {
  bankId: string;
}

export const staffSelect = `
  select a.id, a.role, a.bank_id as "bankId", a.name, coalesce(ag.name, a.agency, '') as agency, a.agency_id as "agencyId",
         a.email, a.outbound_number as "outboundNumber", coalesce(b.name, 'SmartSecure') as "bankName"`;

/** Session de console valide d'un compte ACTIF, quel que soit son rôle. */
export async function requireStaff(req: FastifyRequest): Promise<StaffCtx> {
  const token = readCookie(req, CONSOLE_COOKIE);
  if (token) {
    const row = await one<StaffCtx>(
      `${staffSelect}
       from sessions s join advisors a on a.id = s.advisor_id
       left join banks b on b.id = a.bank_id left join agencies ag on ag.id = a.agency_id
       where s.token_hash = $1 and s.expires_at > now() and a.active`,
      [sha256(token)],
    );
    if (row) return row;
  }
  throw new HttpError(401, "unauthorized", "Session expirée. Reconnectez-vous.");
}

const forbidden = (message = "Vous n'avez pas les droits pour cette action.") => new HttpError(403, "forbidden", message);

/** Conseiller ou responsable d'une banque : les routes « métier » sont limitées à SA banque (ctx.bankId). */
export async function requireAdvisor(req: FastifyRequest): Promise<AdvisorCtx> {
  const staff = await requireStaff(req);
  if (staff.role === "superadmin" || !staff.bankId) throw forbidden("Ce compte n'est rattaché à aucune banque.");
  return staff as AdvisorCtx;
}

/** Responsable d'une banque : gère les comptes, les agences et les réglages de SA banque. */
export async function requireBankAdmin(req: FastifyRequest): Promise<AdvisorCtx> {
  const staff = await requireAdvisor(req);
  if (staff.role !== "bank_admin") throw forbidden("Seul le responsable de la banque peut faire cela.");
  return staff;
}

/** Équipe SmartSecure : gère les banques. */
export async function requireSuperadmin(req: FastifyRequest): Promise<StaffCtx> {
  const staff = await requireStaff(req);
  if (staff.role !== "superadmin") throw forbidden();
  return staff;
}

export function consoleToken(req: FastifyRequest) {
  return readCookie(req, CONSOLE_COOKIE);
}

export function setConsoleCookie(reply: FastifyReply, token: string | null) {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Strict", isProd ? "Secure" : ""].filter(Boolean);
  const value = token
    ? `${CONSOLE_COOKIE}=${encodeURIComponent(token)}; Max-Age=${12 * 3600}; ${attrs.join("; ")}`
    : `${CONSOLE_COOKIE}=; Max-Age=0; ${attrs.join("; ")}`;
  reply.header("set-cookie", value);
}
