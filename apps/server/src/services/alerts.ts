import type { AlertDetail, AlertSource, AlertSummary, Verdict } from "@vigie/shared";
import { formatPhone } from "@vigie/shared";
import { analyze, checksFor } from "../analysis/analyze.ts";
import type { AnalysisResult, MessageInput } from "../analysis/types.ts";
import { many, one, pool } from "../db/pool.ts";
import { log } from "../lib/log.ts";
import { pushToUser } from "../lib/push.ts";
import { sendSms } from "../lib/sms.ts";
import { config } from "../config.ts";

interface AlertRow {
  id: string;
  source: AlertSource;
  verdict: Verdict;
  title: string;
  explanation: string;
  advice: string;
  sender: string | null;
  origin: string | null;
  checks: AlertDetail["checks"];
  links: AlertDetail["links"];
  received_at: Date;
  read_at: Date | null;
  incomplete: boolean;
}

export const alertColumns = "id, source, verdict, title, explanation, advice, sender, origin, checks, links, received_at, read_at, incomplete";

export function toSummary(r: AlertRow): AlertSummary {
  return {
    id: r.id,
    source: r.source,
    verdict: r.verdict,
    title: r.title,
    explanation: r.explanation,
    sender: r.sender,
    receivedAt: r.received_at.toISOString(),
    read: !!r.read_at,
    incomplete: !!r.incomplete,
  };
}

export function toDetail(r: AlertRow): AlertDetail {
  return { ...toSummary(r), checks: r.checks, origin: r.origin, advice: r.advice, links: r.links.map(l => ({ url: l.domain, finalUrl: null, domain: l.domain, domainAgeDays: l.domainAgeDays })) };
}

export interface ProcessOptions {
  userId: string;
  input: MessageInput;
  /** Boîte mail ou appli d'origine, affichée dans le détail. */
  origin: string | null;
  /** Identifiant de dédoublonnage (Message-ID, UID…). */
  fingerprint: string | null;
  deep: boolean;
  /** Notifier l'utilisateur en cas de danger (désactivé quand l'appareil notifie lui-même). */
  notify: boolean;
}

/** Analyse un message, enregistre l'alerte, notifie si besoin. Renvoie null si déjà traité. */
export async function processMessage(opts: ProcessOptions): Promise<{ alert: AlertDetail; result: AnalysisResult } | null> {
  if (opts.fingerprint) {
    const dup = await one("select 1 from alerts where user_id = $1 and fingerprint = $2", [opts.userId, opts.fingerprint]);
    if (dup) return null;
  }
  const result = await analyze(opts.input, { deep: opts.deep });
  const hasSender = !!(opts.input.fromAddress || opts.input.senderId);
  const checks = checksFor(result, { hasSender, deep: opts.deep });
  const sender = opts.input.fromName || opts.input.fromAddress || (opts.input.senderId ? displaySender(opts.input.senderId) : null);

  const row = await one<AlertRow>(
    `insert into alerts (user_id, source, verdict, title, explanation, advice, sender, origin, checks, links, fingerprint, received_at, incomplete)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (user_id, fingerprint) do nothing
     returning ${alertColumns}`,
    [
      opts.userId,
      opts.input.source,
      result.verdict,
      result.title,
      result.explanation,
      result.advice,
      sender,
      opts.origin,
      JSON.stringify(checks),
      JSON.stringify(result.links.map((l) => ({ url: l.host, finalUrl: null, domain: l.host, domainAgeDays: l.domainAgeDays }))),
      opts.fingerprint,
      opts.input.receivedAt,
      result.incomplete,
    ],
  );
  if (!row) return null;

  if (result.verdict === "scam") await pool.query("update users set blocked_count = blocked_count + 1 where id = $1", [opts.userId]);
  if (opts.notify && (result.verdict !== "safe" || result.incomplete)) await notifyUser(opts.userId, row.id, result, opts.input.source);
  if (result.verdict === "scam") await maybeWarnContact(opts.userId, opts.input.source);

  log.info("alert.created", { userId: opts.userId, verdict: result.verdict, source: opts.input.source, ai: result.aiUsed });
  return { alert: toDetail(row), result };
}

const sourceWord: Record<AlertSource, string> = {
  mail: "un mail",
  sms: "un SMS",
  whatsapp: "un message WhatsApp",
  messaging: "un message",
  call: "un appel",
  share: "le message partagé",
};

async function notifyUser(userId: string, alertId: string, result: AnalysisResult, source: AlertSource) {
  // Aucun contenu du message dans la notification : seulement le verdict. Le détail est chargé dans l'app.
  const scam = result.verdict === "scam";
  const unchecked = result.verdict === "safe";
  await pushToUser(userId, {
    title: scam ? "Arnaque détectée" : unchecked ? "Vérification incomplète" : "Message douteux",
    body: scam
      ? `SmartSecure a repéré ${sourceWord[source]} dangereux. Ne cliquez sur aucun lien. Touchez pour voir.`
      : unchecked
        ? `Vérification incomplète : restez prudent avec ${sourceWord[source]}. Touchez pour voir.`
        : `SmartSecure a un doute sur ${sourceWord[source]}. Touchez pour voir pourquoi.`,
    data: { type: "alert", alertId, verdict: result.verdict },
    channelId: "alerts",
    interruptionLevel: scam ? "time-sensitive" : "active",
  });
}

/** Prévient le proche par SMS (au plus une fois par jour) si l'utilisateur l'a activé. */
async function maybeWarnContact(userId: string, source: AlertSource) {
  const user = await one<{ first_name: string | null; notify: boolean }>(
    `update users set last_contact_alert_at = now()
     where id = $1 and coalesce((settings->>'notifyContactOnScam')::boolean, false)
       and (last_contact_alert_at is null or last_contact_alert_at < now() - interval '1 day')
     returning first_name, true as notify`,
    [userId],
  );
  if (!user?.notify || config.SMS_PROVIDER === "console") return;
  const contacts = await many<{ phone: string }>("select phone from trusted_contacts where user_id = $1", [userId]);
  for (const c of contacts) {
    await sendSms(
      c.phone,
      `SmartSecure : ${user.first_name ?? "votre proche"} vient de recevoir ${sourceWord[source]} frauduleux. Appelez votre proche pour vérifier ensemble ce qui s’est passé.`,
    ).catch((err) => log.warn("contact.sms_failed", { error: (err as Error).message }));
  }
}

function displaySender(id: string): string {
  return id.startsWith("+") ? formatPhone(id) : id;
}
