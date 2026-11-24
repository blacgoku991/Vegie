import { formatPhone, normalizePhone } from "@vigie/shared";
import type { ActivationLink, Advisor, StaffMember } from "@vigie/shared";
import { config, isProd } from "../config.ts";
import { many, one, pool, tx, type Queryable } from "../db/pool.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { log } from "../lib/log.ts";
import { HttpError, notFound, staffSelect, type StaffCtx } from "../http/context.ts";

export const ACTIVATION_HOURS = 72;
export const MIN_PASSWORD = 12;

export function staffDto(a: StaffCtx): Advisor {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    agency: a.agency,
    agencyId: a.agencyId,
    bankId: a.bankId,
    bankName: a.bankName,
    outboundNumber: a.outboundNumber ? formatPhone(a.outboundNumber) : null,
  };
}

export async function loadStaff(id: string): Promise<StaffCtx> {
  const a = await one<StaffCtx>(
    `${staffSelect} from advisors a left join banks b on b.id = a.bank_id left join agencies ag on ag.id = a.agency_id where a.id = $1`,
    [id],
  );
  if (!a) throw notFound();
  return a;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: StaffMember["role"];
  agency_id: string | null;
  agency: string;
  outbound_number: string | null;
  active: boolean;
  activated: boolean;
  created_at: Date;
}

const memberSelect = `
  select a.id, a.name, a.email, a.role, a.agency_id, coalesce(ag.name, a.agency, '') as agency, a.outbound_number, a.active,
         (a.password_hash is not null) as activated, a.created_at
  from advisors a left join agencies ag on ag.id = a.agency_id`;

const toMember = (r: MemberRow): StaffMember => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  agencyId: r.agency_id,
  agency: r.agency,
  outboundNumber: r.outbound_number ? formatPhone(r.outbound_number) : null,
  active: r.active,
  activated: r.activated,
  createdAt: r.created_at.toISOString(),
});

export async function listTeam(bankId: string): Promise<StaffMember[]> {
  const rows = await many<MemberRow>(`${memberSelect} where a.bank_id = $1 order by a.active desc, a.role, a.name`, [bankId]);
  return rows.map(toMember);
}

export async function loadMember(id: string, db: Queryable = pool): Promise<StaffMember> {
  const r = await one<MemberRow>(`${memberSelect} where a.id = $1`, [id], db);
  if (!r) throw notFound("Compte introuvable");
  return toMember(r);
}

/**
 * Charge un compte à gérer par un responsable. 404 s'il n'existe pas ; 403 s'il appartient à une autre banque
 * (ou à l'équipe SmartSecure) : un responsable ne touche que sa banque.
 */
export async function ownedMember(bankId: string, id: string): Promise<{ id: string; role: string; active: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Compte introuvable");
  const row = await one<{ id: string; role: string; active: boolean; bank_id: string | null }>("select id, role, active, bank_id from advisors where id = $1", [id]);
  if (!row) throw notFound("Compte introuvable");
  if (row.bank_id !== bankId) throw new HttpError(403, "forbidden", "Ce compte n'appartient pas à votre banque.");
  return row;
}

/** Numéro saisi → E.164, ou erreur claire. */
export function parseNumber(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const n = normalizePhone(raw);
  if (!n) throw new HttpError(400, "bad_number", "Ce numéro de téléphone n'est pas valide.");
  return n;
}

export async function outboundLine(bankId: string, raw: string | null | undefined, db: Queryable = pool) {
  const number = parseNumber(raw);
  if (!number) return null;
  if (!number.startsWith("+")) throw new HttpError(400, "bad_number", "Indiquez la ligne directe complète, avec son indicatif.");
  const bank = await one<{ official_phone: string | null; official_numbers: string[] }>(
    "select official_phone, official_numbers from banks where id = $1", [bankId], db,
  );
  const publicNumbers = [...(bank?.official_numbers ?? []), bank?.official_phone];
  if (publicNumbers.some(n => n && normalizePhone(n) === number)) {
    throw new HttpError(400, "caller_number_required", "Une ligne directe doit être différente des numéros publics de la banque.");
  }
  return number;
}

/**
 * Crée un jeton d'activation (haché en base, 72 h, usage unique) et invalide les précédents.
 * Extension : en production, envoyer `link` par e-mail à `email` (aucun envoi réel pour l'instant) ;
 * le lien n'est alors plus renvoyé par l'API.
 */
export function issueActivation(advisorId: string, email: string) {
  return tx(db => newActivation(advisorId, email, db));
}

async function newActivation(advisorId: string, email: string, db: Queryable): Promise<ActivationLink> {
  const active = await one("select id from advisors where id = $1 and active for update", [advisorId], db);
  if (!active) throw new HttpError(409, "inactive", "Réactivez d’abord ce compte.");
  const token = randomToken(32);
  await db.query("delete from activation_tokens where advisor_id = $1 and used_at is null", [advisorId]);
  const row = await one<{ expires_at: Date }>(
    `insert into activation_tokens (token_hash, advisor_id, expires_at) values ($1, $2, now() + ($3 || ' hours')::interval) returning expires_at`,
    [sha256(token), advisorId, String(ACTIVATION_HOURS)], db,
  );
  const link = `${config.CONSOLE_URL.replace(/\/$/, "")}/activate?token=${token}`;
  // await sendActivationEmail(email, link);  // point d'extension : e-mail transactionnel
  if (!isProd) log.info("activation.link", { email, link });
  return { link: isProd ? null : link, expiresAt: row!.expires_at.toISOString() };
}

export async function checkAgency(bankId: string, agencyId: string | null | undefined, db: Queryable = pool): Promise<{ id: string; name: string } | null> {
  if (!agencyId) return null;
  const ag = await one<{ id: string; name: string }>("select id, name from agencies where id = $1 and bank_id = $2", [agencyId, bankId], db);
  if (!ag) throw new HttpError(400, "bad_agency", "Cette agence n'existe pas dans votre banque.");
  return ag;
}

export async function createStaff(
  bankId: string,
  input: { name: string; email: string; role: "advisor" | "bank_admin"; agencyId?: string | null; outboundNumber?: string | null },
): Promise<{ member: StaffMember; activation: ActivationLink }> {
  return tx(db => createStaffInBank(bankId, input, db));
}

export async function createStaffInBank(bankId: string, input: Parameters<typeof createStaff>[1], db: Queryable) {
  const agency = await checkAgency(bankId, input.agencyId, db);
  const outbound = await outboundLine(bankId, input.outboundNumber, db);
  const email = input.email.toLowerCase();
  const row = await one<{ id: string }>(
    `insert into advisors (bank_id, email, name, agency, agency_id, role, outbound_number) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (email) do nothing returning id`,
    [bankId, email, input.name, agency?.name ?? "", agency?.id ?? null, input.role, outbound], db,
  );
  if (!row) throw new HttpError(409, "email_taken", "Impossible de créer ce compte avec cet e-mail.");
  return { member: await loadMember(row.id, db), activation: await newActivation(row.id, email, db) };
}
