import type { CallStatus, CertifiedCall, ConsoleCall } from "@vigie/shared";
import { formatPhone, normalizePhone } from "@vigie/shared";
import { many, one, tx } from "../db/pool.ts";
import { outboundLine } from "./staff.ts";
import { audit, clientLabel } from "./audit.ts";
import { pushToUser } from "../lib/push.ts";
import { HttpError, notFound, type AdvisorCtx } from "../http/context.ts";

/**
 * Durée de validité d'une annonce. Courte : elle sert à reconnaître l'appel qui arrive juste après.
 * Elle est consommée dès que le client répond (confirmation ou refus) ou que le conseiller y met fin.
 */
export const CALL_WINDOW_MIN = 10;

interface CallRow {
  id: string;
  user_id: string;
  bank_name: string;
  advisor_name: string;
  agency: string;
  reason: string;
  caller_number: string | null;
  status: CallStatus;
  created_at: Date;
  expires_at: Date;
  seen_at: Date | null;
  confirmed_at: Date | null;
  ended_at: Date | null;
}

const callSelect = `
  select c.id, c.user_id, b.name as bank_name, a.name as advisor_name, coalesce(ag.name, a.agency, '') as agency, c.reason, c.caller_number,
         c.status, c.created_at, c.expires_at, c.seen_at, c.confirmed_at, c.ended_at
  from certified_calls c join banks b on b.id = c.bank_id join advisors a on a.id = c.advisor_id
  left join agencies ag on ag.id = a.agency_id`;

function effectiveStatus(r: CallRow): CallStatus {
  if (r.status === "ended" || r.status === "rejected") return r.status;
  return r.expires_at.getTime() < Date.now() ? "expired" : r.status;
}

export function toCall(r: CallRow): CertifiedCall {
  return {
    id: r.id,
    bankName: r.bank_name,
    advisorName: r.advisor_name,
    agency: r.agency,
    reason: r.reason,
    callerNumber: r.caller_number,
    status: effectiveStatus(r),
    createdAt: r.created_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
  };
}

/** Annonce encore valable pour ce client (la plus récente) : ni confirmée, ni refusée, ni terminée, ni expirée. */
export async function activeCallFor(userId: string): Promise<CertifiedCall | null> {
  const row = await one<CallRow>(
    `${callSelect} where c.user_id = $1 and c.status in ('announced', 'seen') and c.expires_at > now()
     order by c.created_at desc limit 1`,
    [userId],
  );
  return row ? toCall(row) : null;
}

/** Consomme l'annonce au premier appel concordant. Renvoie false si elle l'était déjà. */
export async function consumeMatch(userId: string, callId: string): Promise<boolean> {
  const row = await one<{ id: string }>(
    `update certified_calls set matched_at = now(), status = case when status = 'announced' then 'seen' else status end,
       seen_at = coalesce(seen_at, now())
     where id = $1 and user_id = $2 and matched_at is null and status in ('announced','seen') and expires_at > now() returning id`,
    [callId, userId],
  );
  return !!row;
}

export async function markSeen(userId: string, callId: string) {
  await one(`update certified_calls set status = 'seen', seen_at = now() where id = $1 and user_id = $2 and status = 'announced' and expires_at > now()`, [callId, userId]);
}

export async function confirmCall(userId: string, callId: string, confirmed: boolean) {
  const row = await one<{ id: string }>(
    confirmed
      ? `update certified_calls set status = 'confirmed', confirmed_at = now(), seen_at = coalesce(seen_at, now())
         where id = $1 and user_id = $2 and status in ('announced', 'seen') and expires_at > now() returning id`
      : `update certified_calls set status = 'rejected', ended_at = now() where id = $1 and user_id = $2 and status in ('announced', 'seen') and expires_at > now() returning id`,
    [callId, userId],
  );
  if (!row) throw notFound("Appel introuvable ou terminé");
}

export async function startCall(advisor: AdvisorCtx, input: { userId: string; reason: string; callerNumber: string | null }): Promise<ConsoleCall> {
  const { id } = await tx(async db => {
    const staff = await one<{ outbound_number: string | null }>(
      "select outbound_number from advisors where id = $1 and bank_id = $2 and active for share", [advisor.id, advisor.bankId], db,
    );
    if (!staff) throw new HttpError(403, "account_disabled", "Ce compte ne peut plus annoncer d’appel.");
    const callerNumber = await outboundLine(advisor.bankId, staff.outbound_number, db);
    if (!callerNumber) throw new HttpError(400, "caller_number_required", "Demandez au responsable de votre banque de déclarer votre ligne directe dans Équipe.");
    if (input.callerNumber && normalizePhone(input.callerNumber) !== callerNumber) {
      throw new HttpError(400, "caller_number_mismatch", "Appelez depuis la ligne directe déclarée par votre responsable.");
    }
    await db.query("select id from users where id = $1 for update", [input.userId]);
    const link = await one<{ status: string }>("select status from user_banks where user_id = $1 and bank_id = $2 for share", [input.userId, advisor.bankId], db);
    if (!link) throw notFound("Ce client n’a pas ajouté votre banque.");
    if (link.status !== "certified") throw new HttpError(409, "not_linked", "Reliez d’abord le compte du client à votre banque.");
    const active = await one("select 1 from certified_calls where user_id = $1 and status in ('announced','seen') and expires_at > now()", [input.userId], db);
    if (active) throw new HttpError(409, "active_call", "Une annonce est déjà en cours pour ce client. Terminez-la ou attendez son expiration.");
    const row = await one<{ id: string }>(
      `insert into certified_calls (bank_id, advisor_id, user_id, reason, caller_number, expires_at)
       values ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval) returning id`,
      [advisor.bankId, advisor.id, input.userId, input.reason, callerNumber, String(CALL_WINDOW_MIN)], db,
    );
    return row!;
  });
  const call = await consoleCall(id, advisor.bankId);
  await audit({ bankId: advisor.bankId, actor: advisor, action: "call.announced", target: { type: "client", id: input.userId, label: await clientLabel(advisor.bankId, input.userId) }, meta: { callId: id } });

  // Le conseiller peut composer le numéro une fois son annonce enregistrée.
  // Le motif n'est pas dans la notification (il peut être personnel) : il s'affiche dans l'app.
  await pushToUser(input.userId, {
    title: `Appel annoncé · ${advisor.bankName}`,
    body: `${advisor.name} (${advisor.agency}) a prévu de vous appeler. Ne donnez jamais de code ni de virement.`,
    data: {
      type: "certified_call",
      callId: call.id,
      callerNumber: call.callerNumber,
      bankName: advisor.bankName,
      advisorName: advisor.name,
      agency: advisor.agency,
      expiresAt: call.expiresAt,
    },
    channelId: "certified-calls",
    interruptionLevel: "time-sensitive",
    categoryId: "certified-call",
  });
  return call;
}

export async function endCall(callId: string, bankId: string) {
  const row = await one<{ id: string }>(
    `update certified_calls set status = 'ended', ended_at = now() where id = $1 and bank_id = $2 and status not in ('ended', 'rejected') returning id`,
    [callId, bankId],
  );
  if (!row) throw notFound("Appel introuvable ou déjà terminé");
}

export async function consoleCall(callId: string, bankId: string): Promise<ConsoleCall> {
  const r = await one<CallRow & { phone: string; first_name: string | null }>(
    `select x.*, u.phone, u.first_name from (${callSelect} where c.id = $1 and c.bank_id = $2) x join users u on u.id = x.user_id`,
    [callId, bankId],
  );
  if (!r) throw notFound("Appel introuvable");
  const timeline: ConsoleCall["timeline"] = [{ at: r.created_at.toISOString(), status: "announced", label: "Annonce disponible dans l’application" }];
  if (r.seen_at) timeline.push({ at: r.seen_at.toISOString(), status: "seen", label: "Annonce consultée" });
  if (r.confirmed_at) timeline.push({ at: r.confirmed_at.toISOString(), status: "confirmed", label: "Le client a accusé réception de l’annonce" });
  if (r.ended_at) {
    timeline.push({ at: r.ended_at.toISOString(), status: r.status, label: r.status === "rejected" ? "Le client a refusé l'appel" : "Appel terminé" });
  } else if (effectiveStatus(r) === "expired") {
    timeline.push({ at: r.expires_at.toISOString(), status: "expired", label: "Fenêtre de certification expirée" });
  }
  return { ...toCall(r), client: { userId: r.user_id, firstName: r.first_name, phone: formatPhone(r.phone) }, timeline };
}

export async function recentConsoleCalls(bankId: string, limit = 20): Promise<ConsoleCall[]> {
  const ids = await many<{ id: string }>("select id from certified_calls where bank_id = $1 order by created_at desc limit $2", [bankId, limit]);
  return Promise.all(ids.map((r) => consoleCall(r.id, bankId)));
}
