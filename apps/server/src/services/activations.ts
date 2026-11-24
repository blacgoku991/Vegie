import type { ActivationSent, ClientActivation } from "@vigie/shared";
import { config } from "../config.ts";
import { many, one, pool, tx } from "../db/pool.ts";
import type { Queryable } from "../db/pool.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { maskPhone, phoneFor } from "../lib/phone-mask.ts";
import { sendSms } from "../lib/sms.ts";
import { HttpError, createSession, notFound, type AdvisorCtx } from "../http/context.ts";
import { audit, clientLabel } from "./audit.ts";

export const ACTIVATION_HOURS = 72;
/** Créations + renvois de SMS par conseiller et par jour. */
export const MAX_ACTIVATIONS_PER_DAY = 30;
export const MAX_FAILED_PER_IP_HOUR = 20;
const RESEND_COOLDOWN_SECONDS = 60;

const UUID = /^[0-9a-f-]{36}$/i;
const tokenHash = (token: string) => sha256(`activation:${token}`);

const links = (token: string) => ({
  link: `${config.INVITE_SCHEME}://activate?token=${token}`,
  webLink: `${config.PUBLIC_APP_URL.replace(/\/$/, "")}/activate?token=${token}`,
});

interface Row {
  id: string;
  first_name: string;
  phone: string;
  customer_ref: string | null;
  advisor_name: string | null;
  created_at: Date;
  expires_at: Date;
}
const cols = `a.id, a.first_name, a.phone, a.customer_ref, s.name as advisor_name, a.created_at, a.expires_at`;
const from = `client_activations a left join advisors s on s.id = a.advisor_id`;
const dto = (r: Row, role: string): ClientActivation => ({
  id: r.id,
  status: r.expires_at.getTime() > Date.now() ? "pending" : "expired",
  firstName: r.first_name,
  phone: phoneFor(role, r.phone),
  customerRef: r.customer_ref,
  advisorName: r.advisor_name ?? "Ancien compte",
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
});

async function sendActivationSms(bankId: string, phone: string, token: string) {
  const name = (await one<{ name: string }>("select name from banks where id = $1", [bankId]))?.name ?? "Votre banque";
  await sendSms(phone, `${name} vous invite sur SmartSecure, l'app qui certifie les appels de votre conseiller. Activez votre compte : ${links(token).webLink}`);
}

/** Le lien n'est renvoyé que si EXPOSE_ACTIVATION_LINK est explicitement activé (poste de développement) ; interdit en production. */
function sent(row: Row, phone: string, token: string, role: string): ActivationSent {
  return { activation: dto(row, role), maskedPhone: maskPhone(phone), ...(config.EXPOSE_ACTIVATION_LINK ? links(token) : {}) };
}

const smsFailed = () => new HttpError(502, "sms_failed", "Le SMS n'a pas pu être envoyé. Réessayez dans un instant.");

/** Verrouille le conseiller et vérifie son plafond quotidien (créations + renvois). */
async function checkQuota(staff: AdvisorCtx, db: Queryable) {
  const active = await one("select 1 from advisors where id = $1 and active for update", [staff.id], db);
  if (!active) throw new HttpError(403, "account_disabled", "Ce compte est désactivé.");
  const n = await one<{ n: number }>(
    `select (select count(*) from client_activations where advisor_id = $1 and created_at > now() - interval '1 day')::int
          + (select count(*) from activation_sends where advisor_id = $1 and at > now() - interval '1 day')::int as n`,
    [staff.id], db,
  );
  if (n && n.n >= MAX_ACTIVATIONS_PER_DAY) throw new HttpError(429, "too_many_activations", "Limite de 30 SMS d'invitation par jour atteinte. Réessayez demain.");
}

export async function createActivation(staff: AdvisorCtx, input: { firstName: string; phone: string; customerRef: string | null }): Promise<ActivationSent> {
  const token = randomToken(32);
  const row = await tx(async (db) => {
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`activation:${staff.bankId}:${input.phone}`]);
    await checkQuota(staff, db);
    await db.query("update client_activations set cancelled_at = now() where bank_id = $1 and phone = $2 and used_at is null and cancelled_at is null", [staff.bankId, input.phone]);
    const created = await one<{ id: string }>(
      `insert into client_activations (bank_id, advisor_id, phone, first_name, customer_ref, token_hash, expires_at)
       values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' hours')::interval) returning id`,
      [staff.bankId, staff.id, input.phone, input.firstName, input.customerRef, tokenHash(token), String(ACTIVATION_HOURS)], db,
    );
    const label = [input.firstName, input.customerRef ? `(${input.customerRef})` : ""].filter(Boolean).join(" ");
    await audit({ bankId: staff.bankId, actor: staff, action: "invite.activation_created", target: { type: "invite", id: created!.id, label } }, db);
    return (await one<Row>(`select ${cols} from ${from} where a.id = $1`, [created!.id], db))!;
  }).catch((err) => {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "activation_conflict", "Une invitation est déjà en cours de création pour ce numéro. Réessayez.");
    throw err;
  });
  try {
    await sendActivationSms(staff.bankId, input.phone, token);
  } catch {
    await pool.query("update client_activations set cancelled_at = now() where id = $1", [row.id]);
    throw smsFailed();
  }
  return sent(row, input.phone, token, staff.role);
}

/** Le conseiller voit les siennes ; le responsable voit toutes celles de sa banque. Jamais de lien dans la liste. */
export async function listActivations(staff: AdvisorCtx): Promise<ClientActivation[]> {
  const rows = await many<Row>(
    `select ${cols} from ${from}
     where a.bank_id = $1 and ($2 or a.advisor_id = $3) and a.used_at is null and a.cancelled_at is null and a.created_at > now() - interval '30 days'
     order by a.created_at desc limit 100`,
    [staff.bankId, staff.role === "bank_admin", staff.id],
  );
  return rows.map((r) => dto(r, staff.role));
}

function checkId(id: string) {
  if (!UUID.test(id)) throw notFound("Invitation introuvable");
}

/** Nouveau jeton : l'ancien lien cesse de fonctionner. Compte dans le plafond quotidien du conseiller. */
export async function resendActivation(staff: AdvisorCtx, id: string): Promise<ActivationSent> {
  checkId(id);
  const token = randomToken(32);
  const phone = await tx(async (db) => {
    await checkQuota(staff, db);
    const cur = await one<{ phone: string; last_sent_at: Date }>(
      `select phone, last_sent_at from client_activations
       where id = $1 and bank_id = $2 and ($3 or advisor_id = $4) and used_at is null and cancelled_at is null for update`,
      [id, staff.bankId, staff.role === "bank_admin", staff.id], db,
    );
    if (!cur) throw notFound("Invitation introuvable");
    if (Date.now() - cur.last_sent_at.getTime() < RESEND_COOLDOWN_SECONDS * 1000) throw new HttpError(429, "too_soon", "Un SMS vient d'être envoyé. Patientez une minute.");
    await db.query("update client_activations set token_hash = $2, expires_at = now() + ($3 || ' hours')::interval, last_sent_at = now() where id = $1", [id, tokenHash(token), String(ACTIVATION_HOURS)]);
    await db.query("insert into activation_sends (advisor_id) values ($1)", [staff.id]);
    await audit({ bankId: staff.bankId, actor: staff, action: "invite.activation_resent", target: { type: "invite", id } }, db);
    return cur.phone;
  });
  await sendActivationSms(staff.bankId, phone, token).catch(() => {
    throw smsFailed();
  });
  const row = (await one<Row>(`select ${cols} from ${from} where a.id = $1`, [id]))!;
  return sent(row, phone, token, staff.role);
}

export async function cancelActivation(staff: AdvisorCtx, id: string): Promise<void> {
  checkId(id);
  await tx(async (db) => {
    const r = await one<{ id: string }>(
      `update client_activations set cancelled_at = now()
       where id = $1 and bank_id = $2 and ($3 or advisor_id = $4) and used_at is null and cancelled_at is null returning id`,
      [id, staff.bankId, staff.role === "bank_admin", staff.id], db,
    );
    if (!r) throw notFound("Invitation introuvable");
    await audit({ bankId: staff.bankId, actor: staff, action: "invite.activation_cancelled", target: { type: "invite", id } }, db);
  });
}

const invalid = () => new HttpError(400, "invalid_activation", "Ce lien n'est plus valable. Demandez à votre conseiller de vous en renvoyer un.");

async function checkIpBudget(ip: string) {
  const f = await one<{ n: number }>("select count(*)::int as n from activation_attempts where ip = $1 and at > now() - interval '1 hour'", [ip]);
  if (f && f.n >= MAX_FAILED_PER_IP_HOUR) throw new HttpError(429, "too_many_attempts", "Trop d'essais. Réessayez plus tard.");
}

async function recordFailure(ip: string): Promise<never> {
  await pool.query("insert into activation_attempts (ip) values ($1)", [ip]);
  await pool.query("delete from activation_attempts where at < now() - interval '1 day'");
  throw invalid();
}

interface Opened {
  id: string;
  bank_id: string;
  advisor_id: string | null;
  phone: string;
  first_name: string;
  customer_ref: string | null;
}

async function linkBank(a: Opened, userId: string, db: Queryable) {
  await db.query("update client_activations set user_id = $2 where id = $1", [a.id, userId]);
  const referent = a.advisor_id ? await one("select 1 from advisors where id = $1 and bank_id = $2", [a.advisor_id, a.bank_id], db) : null;
  await db.query(
    `insert into user_banks (user_id, bank_id, status, customer_ref, linked_at, referent_id) values ($1, $2, 'certified', $3, now(), $4)
     on conflict (user_id, bank_id) do update set status = 'certified', linked_at = now(),
       referent_id = coalesce(excluded.referent_id, user_banks.referent_id), customer_ref = coalesce(excluded.customer_ref, user_banks.customer_ref)`,
    [userId, a.bank_id, a.customer_ref, referent ? a.advisor_id : null],
  );
  await audit({ bankId: a.bank_id, actor: { id: null, name: "Le client" }, action: "invite.activation_used", target: { type: "client", id: userId, label: await clientLabel(a.bank_id, userId, db) } }, db);
}

export type ActivationOutcome = { userId: string; session: string } | { requiresLogin: true; phone: string };

/**
 * Lien reçu par SMS, ouvert sans session : crée le compte et ouvre la session UNIQUEMENT si aucun compte n'existe pour ce numéro.
 * Si le compte existe déjà, le jeton n'est pas consommé et aucune session n'est ouverte (la possession du lien ne suffit pas
 * à prendre un compte existant) : le client se connecte d'abord avec son code SMS.
 */
export async function consumeActivation(token: string, ip: string): Promise<ActivationOutcome> {
  await checkIpBudget(ip);
  const result = await tx(async (db): Promise<ActivationOutcome | null> => {
    const a = await one<Opened>(
      `select id, bank_id, advisor_id, phone, first_name, customer_ref from client_activations
       where token_hash = $1 and used_at is null and cancelled_at is null and expires_at > now() for update`,
      [tokenHash(token)], db,
    );
    if (!a) return null;
    const user = await one<{ id: string }>(
      `insert into users (phone, first_name, settings) values ($1, $2, '{"autoHangup":false,"notifyContactOnScam":false}')
       on conflict (phone) do nothing returning id`,
      [a.phone, a.first_name], db,
    );
    if (!user) return { requiresLogin: true, phone: maskPhone(a.phone) };
    await db.query("update client_activations set used_at = now() where id = $1", [a.id]);
    await linkBank(a, user.id, db);
    return { userId: user.id, session: await createSession("user", user.id, 365, db) };
  });
  if (!result) return recordFailure(ip);
  return result;
}

/** Utilisateur connecté : le jeton n'est consommé que si le numéro de son compte est exactement celui de l'activation. */
export async function linkActivation(userId: string, token: string, ip: string): Promise<string> {
  await checkIpBudget(ip);
  const bankId = await tx(async (db) => {
    const a = await one<Opened>(
      `update client_activations c set used_at = now()
       from users u
       where u.id = $2 and u.phone = c.phone and c.token_hash = $1 and c.used_at is null and c.cancelled_at is null and c.expires_at > now()
       returning c.id, c.bank_id, c.advisor_id, c.phone, c.first_name, c.customer_ref`,
      [tokenHash(token), userId], db,
    );
    if (!a) return null;
    await db.query("update users set first_name = coalesce(nullif(first_name, ''), $2) where id = $1", [userId, a.first_name]);
    await linkBank(a, userId, db);
    return a.bank_id;
  });
  if (!bankId) return recordFailure(ip);
  return bankId;
}
