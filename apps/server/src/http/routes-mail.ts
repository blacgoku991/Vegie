import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Mailbox, MailProviderInfo } from "@vigie/shared";
import { config } from "../config.ts";
import { many, one, pool } from "../db/pool.ts";
import { encryptJson, randomToken, safeEqual } from "../lib/crypto.ts";
import { enqueue } from "../jobs/queue.ts";
import { exchangeGraphCode, graphAuthUrl, graphEnabled, handleGraphLifecycle, handleGraphNotifications } from "../mail/graph.ts";
import { exchangeGmailCode, gmailAuthUrl, gmailEnabled, handleGmailPush } from "../mail/gmail.ts";
import { imapPresets, testImapLogin } from "../mail/imap.ts";
import { HttpError, requireUser } from "./context.ts";
import { log } from "../lib/log.ts";

const appLink = (path: string) => `${config.APP_SCHEME}://${path}`;

export async function mailRoutes(app: FastifyInstance) {
  app.get("/mail/providers", async (): Promise<MailProviderInfo> => ({
    outlook: graphEnabled(),
    gmail: gmailEnabled(),
    imapPresets,
  }));

  app.get("/me/mailboxes", async (req): Promise<Mailbox[]> => {
    const userId = await requireUser(req);
    const rows = await many<{ id: string; provider: Mailbox["provider"]; email: string; label: string; status: Mailbox["status"]; last_checked_at: Date | null }>(
      "select id, provider, email, label, status, last_checked_at from mailboxes where user_id = $1 order by created_at",
      [userId],
    );
    return rows.map((r) => ({ id: r.id, provider: r.provider, email: r.email, label: r.label, status: r.status, lastCheckedAt: r.last_checked_at?.toISOString() ?? null }));
  });

  app.post("/me/mailboxes/imap", async (req) => {
    const userId = await requireUser(req);
    const body = z.object({ presetId: z.string(), email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const preset = imapPresets.find((p) => p.id === body.presetId);
    if (!preset) throw new HttpError(400, "unknown_provider", "Fournisseur inconnu");
    const email = body.email.trim().toLowerCase();
    const failure = await testImapLogin(preset, email, body.password);
    if (failure) throw new HttpError(400, "imap_login_failed", preset.help ? `${failure} ${preset.help}` : failure);
    await pool.query(
      `insert into mailboxes (user_id, provider, email, label, secret_enc, state) values ($1, 'imap', $2, $3, $4, $5)
       on conflict (user_id, email) do update set secret_enc = excluded.secret_enc, status = 'active', last_error = null`,
      [userId, email, preset.label, encryptJson({ password: body.password }), JSON.stringify({ presetId: preset.id })],
    );
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/me/mailboxes/:id", async (req) => {
    const userId = await requireUser(req);
    await pool.query("delete from mailboxes where id = $1 and user_id = $2", [req.params.id, userId]);
    return { ok: true };
  });

  // ───────────── OAuth (Outlook, Gmail) ─────────────
  app.get<{ Params: { provider: string } }>("/me/mailboxes/:provider/start", async (req) => {
    const userId = await requireUser(req);
    const provider = z.enum(["outlook", "gmail"]).parse(req.params.provider);
    if (provider === "outlook" && !graphEnabled()) throw new HttpError(503, "disabled", "La connexion Outlook n'est pas encore disponible.");
    if (provider === "gmail" && !gmailEnabled()) throw new HttpError(503, "disabled", "La connexion Gmail arrive bientôt.");
    const state = randomToken(24);
    const verifier = randomToken(48);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    await pool.query("insert into oauth_states (state, user_id, provider, code_verifier) values ($1, $2, $3, $4)", [state, userId, provider, verifier]);
    return { url: provider === "outlook" ? graphAuthUrl(state, challenge) : gmailAuthUrl(state, challenge) };
  });

  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>(
    "/oauth/:provider/callback",
    async (req, reply) => {
      const provider = req.params.provider === "microsoft" ? "outlook" : req.params.provider === "google" ? "gmail" : null;
      const { code, state } = req.query;
      const st = state
        ? await one<{ user_id: string; code_verifier: string; provider: string }>(
            "delete from oauth_states where state = $1 and created_at > now() - interval '15 minutes' returning user_id, code_verifier, provider",
            [state],
          )
        : null;
      if (!provider || !code || !st || st.provider !== provider) return reply.redirect(appLink("mailboxes?error=1"));
      try {
        const { secret, email } = provider === "outlook" ? await exchangeGraphCode(code, st.code_verifier) : await exchangeGmailCode(code, st.code_verifier);
        const row = await one<{ id: string }>(
          `insert into mailboxes (user_id, provider, email, label, secret_enc) values ($1, $2, $3, $4, $5)
           on conflict (user_id, email) do update set secret_enc = excluded.secret_enc, status = 'active', last_error = null
           returning id`,
          [st.user_id, provider, email, provider === "outlook" ? "Outlook" : "Gmail", encryptJson(secret)],
        );
        await enqueue(provider === "outlook" ? "graph.subscribe" : "gmail.watch", { mailboxId: row!.id });
        return reply.redirect(appLink(`mailboxes?added=${provider}`));
      } catch (err) {
        log.warn("oauth.failed", { provider, error: (err as Error).message });
        return reply.redirect(appLink("mailboxes?error=1"));
      }
    },
  );

  // ───────────── Webhooks ─────────────
  /** Microsoft Graph : poignée de main (validationToken) puis notifications. Réponse < 3 s. */
  app.post<{ Querystring: { validationToken?: string } }>("/webhooks/graph", async (req, reply) => {
    if (req.query.validationToken) return reply.type("text/plain").send(req.query.validationToken);
    await handleGraphNotifications(req.body as never);
    return reply.code(202).send();
  });

  app.post<{ Querystring: { validationToken?: string } }>("/webhooks/graph/lifecycle", async (req, reply) => {
    if (req.query.validationToken) return reply.type("text/plain").send(req.query.validationToken);
    await handleGraphLifecycle(req.body as never);
    return reply.code(202).send();
  });

  /** Gmail via Cloud Pub/Sub (abonnement push avec ?secret=…). */
  app.post<{ Querystring: { secret?: string } }>("/webhooks/gmail", async (req, reply) => {
    if (!gmailEnabled() || !config.GMAIL_PUSH_SECRET || !safeEqual(req.query.secret ?? "", config.GMAIL_PUSH_SECRET)) {
      return reply.code(403).send();
    }
    await handleGmailPush(req.body as never);
    return reply.code(204).send();
  });
}
