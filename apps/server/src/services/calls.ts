import type { CallStatus, CertifiedCall, ConsoleCall } from "@vigie/shared";
import { formatPhone } from "@vigie/shared";
import { many, one } from "../db/pool.ts";
import { pushToUser } from "../lib/push.ts";
import { HttpError, notFound, type AdvisorCtx } from "../http/context.ts";

/** Durée pendant laquelle un appel annoncé reste « certifié » (il peut durer). */
const CALL_WINDOW_MIN = 30;

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
  select c.id, c.user_id, b.name as bank_name, a.name as advisor_name, a.agency, c.reason, c.caller_number,
         c.status, c.created_at, c.expires_at, c.seen_at, c.confirmed_at, c.ended_at
  from certified_calls c join banks b on b.id = c.bank_id join advisors a on a.id = c.advisor_id`;

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

/** Appel certifié en cours pour ce client (le plus récent), s'il existe. */
export async function activeCallFor(userId: string): Promise<CertifiedCall | null> {
  const row = await one<CallRow>(
    `${callSelect} where c.user_id = $1 and c.status in ('announced', 'seen', 'confirmed') and c.expires_at > now()
     order by c.created_at desc limit 1`,
    [userId],
  );
  return row ? toCall(row) : null;
}

export async function markSeen(userId: string, callId: string) {
  await one(`update certified_calls set status = 'seen', seen_at = now() where id = $1 and user_id = $2 and status = 'announced'`, [callId, userId]);
}

export async function confirmCall(userId: string, callId: string, confirmed: boolean) {
  const row = await one<{ id: string }>(
    confirmed
      ? `update certified_calls set status = 'confirmed', confirmed_at = now(), seen_at = coalesce(seen_at, now())
         where id = $1 and user_id = $2 and status in ('announced', 'seen') returning id`
      : `update certified_calls set status = 'rejected', ended_at = now() where id = $1 and user_id = $2 and status in ('announced', 'seen', 'confirmed') returning id`,
    [callId, userId],
  );
  if (!row) throw notFound("Appel introuvable ou terminé");
}

export async function startCall(advisor: AdvisorCtx, input: { userId: string; reason: string; callerNumber: string | null }): Promise<ConsoleCall> {
  const link = await one<{ status: string }>("select status from user_banks where user_id = $1 and bank_id = $2", [input.userId, advisor.bankId]);
  if (!link) throw notFound("Ce client n'a pas ajouté votre banque dans Vigie");
  if (link.status !== "certified") throw new HttpError(409, "not_linked", "Confirmez d'abord l'identité du client (lien en attente).");

  const callerNumber = input.callerNumber ?? advisor.outboundNumber;
  const created = await one<{ id: string }>(
    `insert into certified_calls (bank_id, advisor_id, user_id, reason, caller_number, expires_at)
     values ($1, $2, $3, $4, $5, now() + ($6 || ' minutes')::interval) returning id`,
    [advisor.bankId, advisor.id, input.userId, input.reason, callerNumber, String(CALL_WINDOW_MIN)],
  );
  const call = await consoleCall(created!.id, advisor.bankId);

  // Notification immédiate : elle arrive avant la sonnerie.
  // Le motif n'est pas dans la notification (il peut être personnel) : il s'affiche dans l'app.
  await pushToUser(input.userId, {
    title: `Appel certifié · ${advisor.bankName}`,
    body: `${advisor.name} (${advisor.agency}) va vous appeler. Vous pouvez décrocher en confiance.`,
    data: {
      type: "certified_call",
      callId: call.id,
      callerNumber,
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
  const timeline: ConsoleCall["timeline"] = [{ at: r.created_at.toISOString(), status: "announced", label: "Annonce envoyée sur le téléphone du client" }];
  if (r.seen_at) timeline.push({ at: r.seen_at.toISOString(), status: "seen", label: "Le client a vu l'annonce" });
  if (r.confirmed_at) timeline.push({ at: r.confirmed_at.toISOString(), status: "confirmed", label: "Le client a confirmé que c'est bien vous" });
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
