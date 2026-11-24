import { config } from "../config.ts";
import { many, pool } from "../db/pool.ts";
import { decryptJson, encryptJson } from "../lib/crypto.ts";
import { log } from "../lib/log.ts";
import { enqueue } from "../jobs/queue.ts";
import { getMailbox, ingestRawMail, markError, saveState, type MailboxRow } from "./ingest.ts";

/**
 * Outlook.com / Hotmail / Live et comptes Microsoft 365 via Microsoft Graph.
 * - OAuth 2.0 code + PKCE, scopes Mail.Read + offline_access (lecture seule).
 * - Abonnement aux nouveaux mails de la boîte de réception (webhook), renouvelé tous les ~2 jours
 *   (maximum Microsoft : un peu moins de 7 jours).
 * - Le webhook répond en moins de 3 s : le traitement est mis en file d'attente.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = "offline_access Mail.Read User.Read";
const authority = () => `https://login.microsoftonline.com/${config.MS_TENANT}/oauth2/v2.0`;
export const graphRedirectUri = () => `${config.PUBLIC_URL}/v1/oauth/microsoft/callback`;
export const graphEnabled = () => !!(config.MS_CLIENT_ID && config.MS_CLIENT_SECRET);

interface GraphSecret {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
}

export function graphAuthUrl(state: string, codeChallenge: string): string {
  const qs = new URLSearchParams({
    client_id: config.MS_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: graphRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${authority()}/authorize?${qs}`;
}

async function tokenRequest(params: Record<string, string>): Promise<GraphSecret> {
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.MS_CLIENT_ID ?? "", client_secret: config.MS_CLIENT_SECRET ?? "", scope: SCOPES, ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token || !json.refresh_token) throw new Error(json.error_description ?? `OAuth Microsoft : ${res.status}`);
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
}

export async function exchangeGraphCode(code: string, verifier: string): Promise<{ secret: GraphSecret; email: string }> {
  const secret = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: graphRedirectUri(), code_verifier: verifier });
  const me = await graphFetch<{ mail?: string; userPrincipalName?: string }>(secret.accessToken, "/me?$select=mail,userPrincipalName");
  return { secret, email: (me.mail ?? me.userPrincipalName ?? "").toLowerCase() };
}

/** Jeton d'accès valide ; le jeton de renouvellement tourne et est re-chiffré à chaque fois. */
async function accessToken(mb: MailboxRow): Promise<string> {
  const secret = decryptJson<GraphSecret>(mb.secret_enc);
  if (secret.expiresAt - Date.now() > 120_000) return secret.accessToken;
  const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: secret.refreshToken });
  await pool.query("update mailboxes set secret_enc = $2 where id = $1", [mb.id, encryptJson(fresh)]);
  return fresh.accessToken;
}

async function graphFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw Object.assign(new Error(`Graph ${res.status} sur ${path.split("?")[0]}`), { status: res.status });
  if (res.status === 204) return undefined as T;
  const type = res.headers.get("content-type") ?? "";
  return (type.includes("json") ? await res.json() : await res.text()) as T;
}

const expiry = () => new Date(Date.now() + 70 * 3600_000).toISOString(); // ~3 jours

export async function subscribeMailbox(mailboxId: string) {
  const mb = await getMailbox(mailboxId);
  if (!mb) return;
  const token = await accessToken(mb);
  const sub = await graphFetch<{ id: string; expirationDateTime: string }>(token, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: `${config.PUBLIC_URL}/v1/webhooks/graph`,
      lifecycleNotificationUrl: `${config.PUBLIC_URL}/v1/webhooks/graph/lifecycle`,
      resource: "me/mailFolders('Inbox')/messages",
      expirationDateTime: expiry(),
      clientState: config.MS_WEBHOOK_SECRET,
    }),
  });
  await saveState(mb.id, { subscriptionId: sub.id, subscriptionExpires: sub.expirationDateTime });
}

/** Tâche périodique : prolonge les abonnements qui expirent dans moins de 24 h. */
export async function renewGraphSubscriptions() {
  const rows = await many<{ id: string }>(
    `select id from mailboxes where provider = 'outlook' and status <> 'paused' and coalesce(state->>'demo', '') <> 'true'
     and (state->>'subscriptionExpires' is null or (state->>'subscriptionExpires')::timestamptz < now() + interval '24 hours')`,
  );
  for (const { id } of rows) {
    const mb = await getMailbox(id);
    if (!mb) continue;
    try {
      const token = await accessToken(mb);
      if (mb.state.subscriptionId) {
        const sub = await graphFetch<{ expirationDateTime: string }>(token, `/subscriptions/${mb.state.subscriptionId}`, {
          method: "PATCH",
          body: JSON.stringify({ expirationDateTime: expiry() }),
        }).catch(async (err) => {
          if ((err as { status?: number }).status === 404) return null;
          throw err;
        });
        if (sub) {
          await saveState(id, { subscriptionExpires: sub.expirationDateTime });
          continue;
        }
      }
      await subscribeMailbox(id);
    } catch (err) {
      log.warn("graph.renew_failed", { mailboxId: id, error: (err as Error).message });
      await markError(id, "Connexion Outlook à renouveler");
    }
  }
}

/** Notification reçue : on met en file chaque nouveau message (réponse au webhook immédiate). */
export async function handleGraphNotifications(body: { value?: Array<{ subscriptionId: string; clientState?: string; resourceData?: { id?: string } }> }) {
  for (const n of body.value ?? []) {
    if (n.clientState !== config.MS_WEBHOOK_SECRET || !n.resourceData?.id) continue;
    const mb = await many<{ id: string }>("select id from mailboxes where provider = 'outlook' and state->>'subscriptionId' = $1", [n.subscriptionId]);
    if (mb[0]) await enqueue("graph.message", { mailboxId: mb[0].id, messageId: n.resourceData.id });
  }
}

/** Événements de cycle de vie : réautorisation, abonnement supprimé, notifications manquées. */
export async function handleGraphLifecycle(body: { value?: Array<{ subscriptionId: string; clientState?: string; lifecycleEvent: string }> }) {
  for (const n of body.value ?? []) {
    if (n.clientState !== config.MS_WEBHOOK_SECRET) continue;
    const rows = await many<{ id: string }>("select id from mailboxes where provider = 'outlook' and state->>'subscriptionId' = $1", [n.subscriptionId]);
    const id = rows[0]?.id;
    if (!id) continue;
    if (n.lifecycleEvent === "subscriptionRemoved") await enqueue("graph.subscribe", { mailboxId: id });
    else if (n.lifecycleEvent === "missed") await enqueue("graph.sync", { mailboxId: id });
    else if (n.lifecycleEvent === "reauthorizationRequired") await enqueue("graph.renew", {});
  }
}

export async function fetchGraphMessage(mailboxId: string, messageId: string) {
  const mb = await getMailbox(mailboxId);
  if (!mb || mb.status === "paused") return;
  const token = await accessToken(mb);
  const raw = await graphFetch<string>(token, `/me/messages/${encodeURIComponent(messageId)}/$value`, { headers: { accept: "text/plain" } });
  await ingestRawMail(mb, raw, messageId);
  await saveState(mailboxId, {});
}

/** Rattrapage : derniers mails reçus (après une coupure ou une notification manquée). */
export async function syncGraphRecent(mailboxId: string) {
  const mb = await getMailbox(mailboxId);
  if (!mb) return;
  const token = await accessToken(mb);
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const list = await graphFetch<{ value: Array<{ id: string }> }>(
    token,
    `/me/mailFolders/inbox/messages?$select=id&$top=25&$filter=receivedDateTime ge ${since}`,
  );
  for (const m of list.value) await enqueue("graph.message", { mailboxId, messageId: m.id });
}
