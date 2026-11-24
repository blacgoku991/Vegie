import PostalMime from "postal-mime";
import { one, pool } from "../db/pool.ts";
import { processMessage } from "../services/alerts.ts";
import { log } from "../lib/log.ts";

export interface MailboxRow {
  id: string;
  user_id: string;
  provider: "outlook" | "imap" | "gmail";
  email: string;
  label: string;
  status: string;
  secret_enc: string;
  state: Record<string, any>;
}

export async function getMailbox(id: string): Promise<MailboxRow | null> {
  return one<MailboxRow>("select id, user_id, provider, email, label, status, secret_enc, state from mailboxes where id = $1", [id]);
}

export async function saveState(id: string, patch: Record<string, unknown>) {
  await pool.query("update mailboxes set state = state || $2::jsonb, last_checked_at = now(), last_error = null, status = 'active' where id = $1", [
    id,
    JSON.stringify(patch),
  ]);
}

export async function markError(id: string, message: string) {
  await pool.query("update mailboxes set status = 'error', last_error = $2 where id = $1", [id, message.slice(0, 300)]);
}

/** Analyse un mail brut (MIME) reçu dans une boîte connectée. Le corps n'est jamais stocké. */
export async function ingestRawMail(mailbox: MailboxRow, raw: string | ArrayBuffer | Uint8Array, idHint: string) {
  const mail = await PostalMime.parse(raw as string);
  const authenticationResults = mail.headers.filter((h) => h.key === "authentication-results").map((h) => h.value);
  const replyTo = mail.replyTo?.[0] && "address" in mail.replyTo[0] ? (mail.replyTo[0].address ?? null) : null;
  const from = mail.from && "address" in mail.from ? mail.from : null;
  const text = mail.text ?? (mail.html ? mail.html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : "");

  const out = await processMessage({
    userId: mailbox.user_id,
    input: {
      source: "mail",
      fromName: from?.name || null,
      fromAddress: from?.address ?? null,
      subject: mail.subject ?? null,
      text,
      html: mail.html ?? null,
      headers: { authenticationResults, replyTo },
      receivedAt: mail.date && !Number.isNaN(Date.parse(mail.date)) ? new Date(mail.date) : new Date(),
    },
    origin: mailbox.email,
    fingerprint: `mail:${mailbox.id}:${mail.messageId ?? idHint}`,
    deep: true,
    notify: true,
  });
  if (out) log.info("mail.analyzed", { mailboxId: mailbox.id, verdict: out.alert.verdict });
}
