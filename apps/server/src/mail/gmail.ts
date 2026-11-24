import { config } from "../config.ts";
import { many, pool } from "../db/pool.ts";
import { decryptJson, encryptJson } from "../lib/crypto.ts";
import { enqueue } from "../jobs/queue.ts";
import { getMailbox, ingestRawMail, saveState, type MailboxRow } from "./ingest.ts";

/**
 * Gmail — DERRIÈRE UN FLAG (FEATURE_GMAIL).
 * Le scope gmail.readonly est « restreint » : Google exige une vérification de l'app et un audit
 * de sécurité CASA annuel avant la mise en production. Tant que ce n'est pas fait, le flag reste éteint.
 * Push : users.watch → Cloud Pub/Sub (abonnement push vers /v1/webhooks/gmail), à renouveler chaque jour.
 */
export const gmailEnabled = () => config.FEATURE_GMAIL && !!config.GOOGLE_CLIENT_ID && !!config.GOOGLE_CLIENT_SECRET;
export const gmailRedirectUri = () => `${config.PUBLIC_URL}/v1/oauth/google/callback`;
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

interface GmailSecret {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

export function gmailAuthUrl(state: string, codeChallenge: string) {
  const qs = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly email",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${qs}`;
}

async function token(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID ?? "", client_secret: config.GOOGLE_CLIENT_SECRET ?? "", ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error_description ?? `OAuth Google : ${res.status}`);
  return json;
}

export async function exchangeGmailCode(code: string, verifier: string) {
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: gmailRedirectUri(), code_verifier: verifier });
  const secret: GmailSecret = { refreshToken: t.refresh_token ?? "", accessToken: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  const profile = await gfetch<{ emailAddress: string }>(secret.accessToken, "/profile");
  return { secret, email: profile.emailAddress.toLowerCase() };
}

async function accessToken(mb: MailboxRow) {
  const s = decryptJson<GmailSecret>(mb.secret_enc);
  if (s.expiresAt - Date.now() > 120_000) return s.accessToken;
  const t = await token({ grant_type: "refresh_token", refresh_token: s.refreshToken });
  const fresh: GmailSecret = { ...s, accessToken: t.access_token!, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  await pool.query("update mailboxes set secret_enc = $2 where id = $1", [mb.id, encryptJson(fresh)]);
  return fresh.accessToken;
}

async function gfetch<T>(tok: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gmail ${res.status}`);
  return (await res.json()) as T;
}

export async function watchGmail(mailboxId: string) {
  const mb = await getMailbox(mailboxId);
  if (!mb || !config.GMAIL_PUBSUB_TOPIC) return;
  const w = await gfetch<{ historyId: string; expiration: string }>(await accessToken(mb), "/watch", {
    method: "POST",
    body: JSON.stringify({ topicName: config.GMAIL_PUBSUB_TOPIC, labelIds: ["INBOX"] }),
  });
  await saveState(mb.id, { historyId: mb.state.historyId ?? w.historyId, watchExpires: Number(w.expiration) });
}

export async function renewGmailWatches() {
  if (!gmailEnabled()) return;
  const rows = await many<{ id: string }>("select id from mailboxes where provider = 'gmail' and status = 'active'");
  for (const r of rows) await enqueue("gmail.watch", { mailboxId: r.id });
}

/** Message Pub/Sub : { emailAddress, historyId } encodé en base64. */
export async function handleGmailPush(body: { message?: { data?: string } }) {
  if (!body.message?.data) return;
  const { emailAddress } = JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8")) as { emailAddress: string };
  const rows = await many<{ id: string }>("select id from mailboxes where provider = 'gmail' and email = $1 and status = 'active'", [emailAddress.toLowerCase()]);
  for (const r of rows) await enqueue("gmail.sync", { mailboxId: r.id });
}

export async function syncGmail(mailboxId: string) {
  const mb = await getMailbox(mailboxId);
  if (!mb?.state.historyId) return;
  const tok = await accessToken(mb);
  const h = await gfetch<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId: string }>(
    tok,
    `/history?startHistoryId=${mb.state.historyId}&historyTypes=messageAdded&labelId=INBOX`,
  );
  for (const item of h.history ?? []) {
    for (const added of item.messagesAdded ?? []) {
      const m = await gfetch<{ raw: string }>(tok, `/messages/${added.message.id}?format=raw`);
      await ingestRawMail(mb, Buffer.from(m.raw, "base64url").toString("utf8"), added.message.id);
    }
  }
  await saveState(mailboxId, { historyId: h.historyId });
}
