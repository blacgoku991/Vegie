import { ImapFlow } from "imapflow";
import type { ImapPreset } from "@vigie/shared";
import { many } from "../db/pool.ts";
import { decryptJson } from "../lib/crypto.ts";
import { log } from "../lib/log.ts";
import { getMailbox, ingestRawMail, markError, saveState, type MailboxRow } from "./ingest.ts";

/**
 * Boîtes des fournisseurs d'accès français (aucun ne propose OAuth) : IMAP en TLS sur le port 993.
 * Le mot de passe est chiffré (AES-256-GCM) et n'est jamais renvoyé à l'app.
 * Une connexion IDLE par boîte : le fournisseur nous prévient dès qu'un mail arrive.
 */
export const imapPresets: ImapPreset[] = [
  {
    id: "orange",
    label: "Orange",
    host: "imap.orange.fr",
    port: 993,
    domains: ["orange.fr", "wanadoo.fr"],
    help: "Si la connexion échoue, créez un « mot de passe dédié » dans votre Espace client Orange (Connexion et sécurité).",
  },
  { id: "free", label: "Free", host: "imap.free.fr", port: 993, domains: ["free.fr", "aliceadsl.fr"], help: null },
  {
    id: "sfr",
    label: "SFR",
    host: "imap.sfr.fr",
    port: 993,
    domains: ["sfr.fr", "neuf.fr", "cegetel.net", "club-internet.fr"],
    help: "Utilisez le mot de passe de votre messagerie SFR, qui peut être différent de celui de votre Espace client.",
  },
  { id: "laposte", label: "La Poste", host: "imap.laposte.net", port: 993, domains: ["laposte.net"], help: null },
  { id: "bouygues", label: "Bouygues Telecom", host: "imap.bbox.fr", port: 993, domains: ["bbox.fr"], help: null },
];

interface ImapSecret {
  password: string;
}

function client(preset: ImapPreset, email: string, password: string) {
  return new ImapFlow({
    host: preset.host,
    port: preset.port,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    // Certains fournisseurs coupent les connexions inactives : on relance IDLE régulièrement.
    maxIdleTime: 5 * 60_000,
  });
}

/** Vérifie les identifiants au moment de l'ajout ; renvoie un message compréhensible en cas d'échec. */
export async function testImapLogin(preset: ImapPreset, email: string, password: string): Promise<string | null> {
  const c = client(preset, email, password);
  c.on("error", () => {});
  try {
    await c.connect();
    await c.logout();
    return null;
  } catch (err) {
    const e = err as { authenticationFailed?: boolean; code?: string };
    if (e.authenticationFailed) return "L'adresse ou le mot de passe ne sont pas reconnus.";
    if (e.code === "ENOTFOUND" || e.code === "ETIMEDOUT") return "Le serveur de messagerie ne répond pas. Réessayez plus tard.";
    return "Connexion impossible pour le moment.";
  }
}

// ───────────── Gestionnaire des connexions permanentes ─────────────

const live = new Map<string, { client: ImapFlow; stop: () => void }>();

async function watch(mb: MailboxRow) {
  const preset = imapPresets.find((p) => p.id === mb.state.presetId);
  if (!preset) return;
  let password: string;
  try {
    ({ password } = decryptJson<ImapSecret>(mb.secret_enc));
  } catch {
    await markError(mb.id, "Identifiants illisibles : reconnectez la boîte");
    return;
  }
  const c = client(preset, mb.email, password);
  let stopped = false;
  let busy = false;
  live.set(mb.id, { client: c, stop: () => ((stopped = true), c.close()) });

  const pull = async () => {
    if (busy) return;
    busy = true;
    try {
      const fresh = await getMailbox(mb.id);
      const box = c.mailbox;
      if (!fresh || !box) return;
      const uidNext = box.uidNext;
      // Première connexion : on ne remonte pas tout l'historique, seulement les 5 derniers mails.
      const lastUid: number = fresh.state.lastUid ?? Math.max(0, uidNext - 6);
      if (uidNext - 1 <= lastUid) return;
      let maxUid = lastUid;
      for await (const msg of c.fetch(`${lastUid + 1}:*`, { uid: true, source: true }, { uid: true })) {
        if (msg.uid <= lastUid || !msg.source) continue;
        await ingestRawMail(fresh, new Uint8Array(msg.source), `uid:${msg.uid}`).catch((err) =>
          log.warn("imap.ingest_failed", { mailboxId: mb.id, error: (err as Error).message }),
        );
        maxUid = Math.max(maxUid, msg.uid);
      }
      await saveState(mb.id, { lastUid: maxUid });
    } finally {
      busy = false;
    }
  };

  c.on("exists", () => void pull().catch((err) => log.warn("imap.pull_failed", { mailboxId: mb.id, error: (err as Error).message })));
  c.on("error", (err: Error) => log.warn("imap.error", { mailboxId: mb.id, error: err.message }));
  c.on("close", () => {
    live.delete(mb.id);
    if (!stopped) setTimeout(() => void ensureWatched(mb.id), 30_000); // reconnexion
  });

  try {
    await c.connect();
    await c.mailboxOpen("INBOX", { readOnly: true });
    await pull();
  } catch (err) {
    const e = err as { authenticationFailed?: boolean; message: string };
    live.delete(mb.id);
    stopped = true;
    if (e.authenticationFailed) await markError(mb.id, "Mot de passe à mettre à jour");
    else log.warn("imap.connect_failed", { mailboxId: mb.id, error: e.message });
  }
}

async function ensureWatched(id: string) {
  if (live.has(id)) return;
  const mb = await getMailbox(id);
  if (mb && mb.provider === "imap" && mb.status === "active") await watch(mb);
}

/**
 * Synchronise les connexions avec la base (toutes les minutes).
 * Montée en charge : répartir les boîtes entre plusieurs processus (shard = hash(id) % N).
 */
export async function superviseImap() {
  const rows = await many<{ id: string }>(
    "select id from mailboxes where provider = 'imap' and status = 'active' and coalesce(state->>'demo', '') <> 'true'",
  );
  const wanted = new Set(rows.map((r) => r.id));
  for (const [id, conn] of live) if (!wanted.has(id)) conn.stop();
  for (const id of wanted) if (!live.has(id)) void ensureWatched(id);
}

export function stopImap() {
  for (const conn of live.values()) conn.stop();
}
