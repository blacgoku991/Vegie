import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizePhone } from "@vigie/shared";
import type {
  AlertSummary,
  AuthVerifyResponse,
  Bank,
  CallCheckResponse,
  CallMatch,
  HomeResponse,
  JoinBankResponse,
  Me,
  PhoneDirectory,
  ScanMessageResponse,
  TrustedContact,
  UserBank,
  UserSettings,
} from "@vigie/shared";
import { config, isProd } from "../config.ts";
import { many, one, pool, tx } from "../db/pool.ts";
import { otpCode, sha256 } from "../lib/crypto.ts";
import { sendSms } from "../lib/sms.ts";
import { analyze } from "../analysis/analyze.ts";
import { alertColumns, processMessage, toDetail, toSummary } from "../services/alerts.ts";
import { audit, clientLabel } from "../services/audit.ts";
import { activeCallFor, confirmCall, consumeMatch, markSeen } from "../services/calls.ts";
import { HttpError, createSession, destroySession, notFound, requireUser } from "./context.ts";

const phoneSchema = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p || !p.startsWith("+")) {
    ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide" });
    return z.NEVER;
  }
  return p;
});

interface BankRow {
  id: string;
  slug: string;
  name: string;
  partner: boolean;
  official_phone: string | null;
}
const toBank = (b: BankRow): Bank => ({ id: b.id, slug: b.slug, name: b.name, partner: b.partner, officialPhone: b.official_phone });

async function loadMe(userId: string): Promise<Me> {
  const u = await one<{ id: string; phone: string; first_name: string | null; settings: UserSettings }>(
    "select id, phone, first_name, settings from users where id = $1",
    [userId],
  );
  if (!u) throw notFound();
  return { id: u.id, phone: u.phone, firstName: u.first_name, settings: u.settings };
}

export async function appRoutes(app: FastifyInstance) {
  // ───────────── Connexion par SMS ─────────────
  app.post("/auth/start", async (req) => {
    const { phone } = z.object({ phone: phoneSchema }).parse(req.body);
    const code = otpCode();
    const sent = await one(
      `insert into otp_codes (phone, code_hash, expires_at, attempts, sent_at) values ($1, $2, now() + interval '10 minutes', 0, now())
       on conflict (phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = now()
       where otp_codes.sent_at <= now() - interval '45 seconds' returning phone`,
      [phone, sha256(code)],
    );
    if (!sent) throw new HttpError(429, "too_soon", "Un code vient d’être envoyé. Patientez quelques secondes.");
    // Le SMS rappelle la règle d'or : ce code ne se donne à personne.
    await sendSms(phone, `Votre code SmartSecure : ${code}. Ne le donnez à personne, même à un conseiller ou à SmartSecure.`);
    return { ok: true };
  });

  app.post("/auth/verify", async (req): Promise<AuthVerifyResponse> => {
    const body = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const devBypass = !isProd && config.DEV_FIXED_OTP && body.code === config.DEV_FIXED_OTP;
    if (!devBypass) {
      const otp = await one<{ code_hash: string; attempts: number }>(
        `update otp_codes set attempts = attempts + 1, expires_at = case when code_hash = $2 then now() else expires_at end
         where phone = $1 and expires_at > now() and attempts < 5 returning code_hash, attempts`,
        [body.phone, sha256(body.code)],
      );
      if (!otp || otp.attempts > 5) throw new HttpError(400, "code_expired", "Ce code a expiré. Demandez-en un nouveau.");
      if (otp.code_hash !== sha256(body.code)) throw new HttpError(400, "bad_code", "Ce code n'est pas le bon.");
    }
    const user = await one<{ id: string }>(
      `insert into users (phone, settings) values ($1, '{"autoHangup":false,"notifyContactOnScam":false}') on conflict (phone) do update set phone = excluded.phone returning id`,
      [body.phone],
    );
    const token = await createSession("user", user!.id, 365);
    return { token, user: await loadMe(user!.id) };
  });

  app.post("/auth/logout", async (req) => {
    const token = req.headers.authorization?.slice(7);
    if (token) await destroySession(token);
    return { ok: true };
  });

  // ───────────── Profil ─────────────
  app.get("/me", async (req) => loadMe(await requireUser(req)));

  app.patch("/me", async (req) => {
    const userId = await requireUser(req);
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(40).optional(),
        settings: z.object({ autoHangup: z.boolean().optional(), notifyContactOnScam: z.boolean().optional() }).optional(),
      })
      .parse(req.body);
    if (body.firstName) await pool.query("update users set first_name = $2 where id = $1", [userId, body.firstName]);
    if (body.settings) await pool.query("update users set settings = settings || $2::jsonb where id = $1", [userId, JSON.stringify(body.settings)]);
    return loadMe(userId);
  });

  app.delete("/me", async (req) => {
    // Droit à l'effacement (RGPD) : tout est supprimé en cascade.
    const userId = await requireUser(req);
    await pool.query("delete from users where id = $1", [userId]);
    return { ok: true };
  });

  app.post("/me/devices", async (req) => {
    const userId = await requireUser(req);
    const body = z.object({ platform: z.enum(["ios", "android", "web"]), pushToken: z.string().nullable() }).parse(req.body);
    if (body.pushToken) {
      await pool.query(
        `insert into push_tokens (token, user_id, platform) values ($1, $2, $3)
         on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`,
        [body.pushToken, userId, body.platform],
      );
    }
    return { ok: true };
  });

  app.get("/home", async (req): Promise<HomeResponse> => {
    const userId = await requireUser(req);
    const [me, stats, alerts, activeCall] = await Promise.all([
      one<{ first_name: string | null; blocked_count: number }>("select first_name, blocked_count from users where id = $1", [userId]),
      one<{ mails: number; mails_error: number; banks: number }>(
        `select (select count(*)::int from mailboxes where user_id = $1 and status = 'active') as mails,
                (select count(*)::int from mailboxes where user_id = $1 and status <> 'active') as mails_error,
                (select count(*)::int from user_banks where user_id = $1) as banks`,
        [userId],
      ),
      many<any>(`select ${alertColumns} from alerts where user_id = $1 and (verdict <> 'safe' or incomplete) order by received_at desc limit 3`, [userId]),
      activeCallFor(userId),
    ]);
    return {
      firstName: me?.first_name ?? null,
      blockedCount: me?.blocked_count ?? 0,
      // Le serveur ne connaît que les banques et les boîtes mail. Appels et SMS dépendent des réglages
      // du téléphone : seule l'app peut les lire, le serveur ne prétend rien à leur sujet.
      sources: { banks: stats?.banks ?? 0, mails: stats?.mails ?? 0, mailsInError: stats?.mails_error ?? 0 },
      latestAlerts: alerts.map(toSummary),
      activeCall,
    };
  });

  // ───────────── Proches ─────────────
  app.get("/me/contacts", async (req): Promise<TrustedContact[]> => {
    const userId = await requireUser(req);
    return many<TrustedContact>("select id, name, phone from trusted_contacts where user_id = $1 order by created_at", [userId]);
  });

  app.post("/me/contacts", async (req) => {
    const userId = await requireUser(req);
    const body = z.object({ name: z.string().trim().min(1).max(60), phone: phoneSchema }).parse(req.body);
    return tx(async db => {
      const me = await one<{ phone: string }>("select phone from users where id = $1 for update", [userId], db);
      if (me?.phone === body.phone) throw new HttpError(400, "own_number", "Indiquez le numéro de votre proche, différent du vôtre.");
      const contacts = await many<{ phone: string }>("select phone from trusted_contacts where user_id = $1", [userId], db);
      if (contacts.some(c => c.phone === body.phone)) throw new HttpError(409, "already_added", "Ce proche est déjà dans votre liste.");
      if (contacts.length >= 3) throw new HttpError(400, "limit", "Vous pouvez ajouter jusqu’à trois proches.");
      return one<TrustedContact>("insert into trusted_contacts (user_id, name, phone) values ($1, $2, $3) returning id, name, phone", [userId, body.name, body.phone], db);
    });
  });

  app.delete<{ Params: { id: string } }>("/me/contacts/:id", async (req) => {
    const userId = await requireUser(req);
    await pool.query("delete from trusted_contacts where id = $1 and user_id = $2", [req.params.id, userId]);
    return { ok: true };
  });

  /** « Prévenir un proche » pendant un appel suspect. Renvoie sent=false si le SMS n'a pas pu partir (l'app ouvre alors les SMS). */
  app.post("/me/contacts/alert", async (req) => {
    const userId = await requireUser(req);
    const body = z.object({ context: z.enum(["call", "message"]), number: z.string().nullish() }).parse(req.body);
    const [me, contacts] = await Promise.all([
      one<{ first_name: string | null }>("select first_name from users where id = $1", [userId]),
      many<{ phone: string; name: string }>("select phone, name from trusted_contacts where user_id = $1", [userId]),
    ]);
    if (!contacts.length || config.SMS_PROVIDER === "console") return { sent: false, contacts };
    const who = me?.first_name ?? "Votre proche";
    const text =
      body.context === "call"
        ? `SmartSecure : ${who} reçoit un appel suspect de quelqu'un qui se dit de sa banque. Appelez-le dès que possible.`
        : `SmartSecure : ${who} a reçu un message suspect et a besoin de votre avis. Appelez-le dès que possible.`;
    await Promise.all(contacts.map((c) => sendSms(c.phone, text)));
    await pool.query("insert into call_reports (user_id, number, action) values ($1, $2, 'alerted_contact')", [userId, body.number ?? null]);
    return { sent: true, contacts };
  });

  // ───────────── Banques ─────────────
  app.get("/banks", async (): Promise<Bank[]> => {
    return (await many<BankRow>("select id, slug, name, partner, official_phone from banks order by partner desc, name")).map(toBank);
  });

  app.get("/me/banks", async (req): Promise<UserBank[]> => {
    const userId = await requireUser(req);
    const rows = await many<BankRow & { status: UserBank["status"] }>(
      `select b.id, b.slug, b.name, b.partner, b.official_phone, ub.status
       from user_banks ub join banks b on b.id = ub.bank_id where ub.user_id = $1 order by ub.created_at`,
      [userId],
    );
    return rows.map((r) => ({ bank: toBank(r), status: r.status }));
  });

  app.post("/me/banks", async (req) => {
    const userId = await requireUser(req);
    const { bankId } = z.object({ bankId: z.string().uuid() }).parse(req.body);
    const bank = await one<{ partner: boolean }>("select partner from banks where id = $1", [bankId]);
    if (!bank) throw notFound("Banque inconnue");
    // Banque partenaire : le conseiller confirme l'identité du client depuis la console avant toute certification.
    await pool.query(
      "insert into user_banks (user_id, bank_id, status) values ($1, $2, $3) on conflict do nothing",
      [userId, bankId, bank.partner ? "pending" : "basic"],
    );
    return { ok: true };
  });

  /**
   * Liaison par invitation : le conseiller donne un code à 6 chiffres (ou un QR) → lien « certifié » immédiat.
   * L'invitation porte le numéro du client : le code ne marche que depuis ce compte. 5 essais par utilisateur et par 15 min ;
   * même réponse si le code n'existe pas, est expiré, déjà utilisé ou destiné à un autre numéro.
   */
  app.post("/me/banks/join", async (req): Promise<JoinBankResponse> => {
    const userId = await requireUser(req);
    const { code } = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Le code comporte 6 chiffres.") }).parse(req.body);
    const tooMany = () => new HttpError(429, "too_many_attempts", "Trop d'essais. Patientez un moment ou demandez un nouveau code à votre conseiller.");
    // Plafonds vérifiés ET enregistrés dans une même transaction, sous verrou par utilisateur : des requêtes
    // parallèles ne peuvent pas dépasser 5 essais. Plafonds d'échecs : 30/heure par IP, 300/heure au total.
    const attemptId = await tx(async (db) => {
      await db.query("select pg_advisory_xact_lock(hashtext($1))", [userId]);
      const c = await one<{ mine: number; ip: number; total: number }>(
        `select count(*) filter (where user_id = $1 and at > now() - interval '15 minutes')::int as mine,
                count(*) filter (where failed and ip = $2)::int as ip, count(*) filter (where failed)::int as total
         from invite_attempts where at > now() - interval '1 hour'`,
        [userId, req.ip],
        db,
      );
      if (!c || c.mine >= 5 || c.ip >= 30 || c.total >= 300) return null;
      const row = await one<{ id: string }>("insert into invite_attempts (user_id, ip) values ($1, $2) returning id", [userId, req.ip], db);
      return row!.id;
    });
    if (!attemptId) throw tooMany();
    await pool.query("delete from invite_attempts where at < now() - interval '1 day'");
    const me = await one<{ phone: string }>("select phone from users where id = $1", [userId]);
    return tx(async (db) => {
      const invite = await one<{ bank_id: string; customer_ref: string | null; advisor_id: string; advisor_name: string }>(
        `update client_invites i set used_at = now(), used_by = $2
         from advisors a
         where a.id = i.advisor_id and i.code_hash = $1 and i.client_phone = $3 and i.used_at is null and i.cancelled_at is null and i.expires_at > now()
         returning i.bank_id, i.customer_ref, i.advisor_id, a.name as advisor_name`,
        [sha256(`invite:${code}`), userId, me?.phone ?? ""],
        db,
      );
      if (!invite) throw new HttpError(400, "invalid_code", "Ce code n'est pas valable ou a expiré. Demandez-en un nouveau à votre conseiller.");
      await db.query(
        `insert into user_banks (user_id, bank_id, status, customer_ref, linked_at, referent_id) values ($1, $2, 'certified', $3, now(), $4)
         on conflict (user_id, bank_id) do update set status = 'certified', linked_at = now(), referent_id = excluded.referent_id,
           customer_ref = coalesce(excluded.customer_ref, user_banks.customer_ref)`,
        [userId, invite.bank_id, invite.customer_ref, invite.advisor_id],
      );
      await audit({ bankId: invite.bank_id, actor: { id: null, name: "Le client" }, action: "invite.used", target: { type: "client", id: userId, label: await clientLabel(invite.bank_id, userId, db) }, meta: { advisor: invite.advisor_name } }, db);
      await db.query("update invite_attempts set failed = false where id = $1", [attemptId]);
      const bank = await one<BankRow>("select id, slug, name, partner, official_phone from banks where id = $1", [invite.bank_id], db);
      return { bank: toBank(bank!), status: "certified" };
    });
  });

  app.delete<{ Params: { bankId: string } }>("/me/banks/:bankId", async (req) => {
    const userId = await requireUser(req);
    await tx(async db => {
      await db.query("select id from users where id = $1 for update", [userId]);
      const link = /^[0-9a-f-]{36}$/i.test(req.params.bankId) ? await one<{ status: string }>("select status from user_banks where user_id = $1 and bank_id = $2", [userId, req.params.bankId], db) : null;
      if (link && link.status !== "basic") await audit({ bankId: req.params.bankId, actor: { id: null, name: "Le client" }, action: "client.unlinked", target: { type: "client", id: userId, label: await clientLabel(req.params.bankId, userId, db) } }, db);
      await db.query("delete from user_banks where user_id = $1 and bank_id = $2", [userId, req.params.bankId]);
      await db.query("update certified_calls set status = 'ended', ended_at = now() where user_id = $1 and bank_id = $2 and status in ('announced','seen')", [userId, req.params.bankId]);
    });
    return { ok: true };
  });

  /** Annuaire pour le filtrage d'appels hors ligne (Android CallScreeningService, iOS Call Directory). */
  app.get("/me/phone-directory", async (req): Promise<PhoneDirectory> => {
    const userId = await requireUser(req);
    const banks = await many<{ id: string; name: string; partner: boolean; official_numbers: string[] }>(
      `select b.id, b.name, b.partner, b.official_numbers from user_banks ub join banks b on b.id = ub.bank_id where ub.user_id = $1`,
      [userId],
    );
    const reported = await many<{ number: string; reports: number }>(
      "select number, reports from reported_numbers where reports >= 3 order by reports desc limit 20000",
    );
    return {
      version: new Date().toISOString().slice(0, 13),
      bankNumbers: banks.flatMap((b) => b.official_numbers.map((n) => ({ number: n, bankId: b.id, bankName: b.name, partner: b.partner }))),
      reportedNumbers: reported,
    };
  });

  // ───────────── Appels ─────────────
  /** Bouton « On m'appelle de ma banque » et vérification depuis le filtrage d'appels Android. */
  app.get<{ Querystring: { number?: string } }>("/me/calls/check", async (req): Promise<CallCheckResponse> => {
    const userId = await requireUser(req);
    const call = await activeCallFor(userId);
    const number = req.query.number ? normalizePhone(req.query.number) : null;
    // Une annonce ne valide que l'appel venant du numéro annoncé. Sans numéro (iPhone, bouton manuel),
    // on sait seulement qu'un appel était prévu : jamais « certifié ».
    const match: CallMatch = !number ? "number_unknown" : call?.callerNumber && call.callerNumber === number ? "number_match" : "number_mismatch";
    // Premier appel concordant seulement : l'annonce est consommée, un second check concordant n'est plus certifié.
    const certified = !!call && match === "number_match" && (await consumeMatch(userId, call.id));
    if (call && !certified && match === "number_unknown") await markSeen(userId, call.id);
    const banks = await many<BankRow>(
      `select b.id, b.slug, b.name, b.partner, b.official_phone from user_banks ub join banks b on b.id = ub.bank_id where ub.user_id = $1`,
      [userId],
    );
    return { certified, match: call ? (match === "number_match" && !certified ? "number_mismatch" : match) : "number_unknown", call, banks: banks.map(toBank) };
  });

  app.post<{ Params: { id: string } }>("/me/calls/:id/confirm", async (req) => {
    const userId = await requireUser(req);
    const { confirmed } = z.object({ confirmed: z.boolean() }).parse(req.body);
    await confirmCall(userId, req.params.id, confirmed);
    return { ok: true };
  });

  /** Signalement d'un appel non certifié (alimente la base communautaire et les stats des banques). */
  app.post("/me/calls/report", async (req) => {
    const userId = await requireUser(req);
    const body = z
      .object({
        number: z.string().nullish(),
        bankId: z.string().uuid().nullish(),
        action: z.enum(["hung_up", "called_back", "alerted_contact", "confirmed"]),
        certifiedCallId: z.string().uuid().nullish(),
      })
      .parse(req.body);
    const number = body.number ? normalizePhone(body.number) : null;
    // Numéro officiel usurpé : on rattache le signalement à la banque imitée (statistiques console).
    if (body.bankId && !await one("select 1 from user_banks where user_id = $1 and bank_id = $2", [userId, body.bankId])) throw notFound("Banque introuvable");
    if (body.certifiedCallId && !await one("select 1 from certified_calls where user_id = $1 and id = $2 and ($3::uuid is null or bank_id = $3)", [userId, body.certifiedCallId, body.bankId ?? null])) throw notFound("Annonce introuvable");
    const bankId =
      body.bankId ??
      (number ? (await one<{ id: string }>("select id from banks where $1 = any(official_numbers) or $1 = official_phone limit 1", [number]))?.id : null) ??
      null;
    await pool.query(
      "insert into call_reports (user_id, bank_id, number, action, certified_call_id) values ($1, $2, $3, $4, $5)",
      [userId, bankId, number, body.action, body.certifiedCallId ?? null],
    );
    if (number && body.action === "hung_up") {
      await pool.query(
        `insert into reported_numbers (number, reports) values ($1, 1)
         on conflict (number) do update set reports = reported_numbers.reports + 1, last_reported_at = now()`,
        [number],
      );
    }
    return { ok: true };
  });

  // ───────────── Alertes ─────────────
  app.get<{ Querystring: { verdict?: string; source?: string; before?: string } }>("/me/alerts", async (req): Promise<AlertSummary[]> => {
    const userId = await requireUser(req);
    const q = z
      .object({
        verdict: z.enum(["safe", "suspicious", "scam", "incomplete"]).optional(),
        source: z.enum(["mail", "sms", "whatsapp", "messaging", "call", "share"]).optional(),
        before: z.iso.datetime().optional(),
      })
      .parse(req.query);
    const rows = await many<any>(
      `select ${alertColumns} from alerts
       where user_id = $1 and ($2::text is null or
         case when verdict = 'safe' and incomplete then 'incomplete' else verdict end = $2) and ($3::text is null or source = $3)
         and ($4::timestamptz is null or received_at < $4)
       order by received_at desc limit 50`,
      [userId, q.verdict ?? null, q.source ?? null, q.before ?? null],
    );
    return rows.map(toSummary);
  });

  app.get<{ Params: { id: string } }>("/me/alerts/:id", async (req) => {
    const userId = await requireUser(req);
    const row = await one<any>(
      `update alerts set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning ${alertColumns}`,
      [req.params.id, userId],
    );
    if (!row) throw notFound("Alerte introuvable");
    return toDetail(row);
  });

  // ───────────── Analyse à la demande ─────────────
  /**
   * Android (NotificationListenerService) et extension Partager iOS.
   * L'appareil n'envoie que les messages qui contiennent un lien, un numéro ou une demande d'argent.
   */
  app.post("/me/scan", async (req): Promise<ScanMessageResponse> => {
    const userId = await requireUser(req);
    const body = z
      .object({
        source: z.enum(["sms", "whatsapp", "messaging", "share", "mail"]),
        sender: z.string().max(200).nullish(),
        text: z.string().min(1).max(20_000),
        app: z.string().max(100).nullish(),
      })
      .parse(req.body);
    const out = await processMessage({
      userId,
      input: { source: body.source, senderId: body.sender ?? null, text: body.text, receivedAt: new Date() },
      origin: body.app ?? null,
      fingerprint: sha256(`${body.sender ?? ""}|${body.text}`),
      deep: true,
      // L'appareil affiche lui-même le résultat : pas de notification serveur en double.
      notify: false,
    });
    if (!out) {
      const existing = await one<any>(`select ${alertColumns} from alerts where user_id = $1 and fingerprint = $2`, [userId, sha256(`${body.sender ?? ""}|${body.text}`)]);
      return {
        verdict: existing?.verdict ?? "suspicious",
        explanation: existing?.explanation ?? "",
        advice: existing?.advice ?? "",
        alertId: existing?.id ?? null,
        incomplete: existing ? !!existing.incomplete : true,
      };
    }
    return { verdict: out.alert.verdict, explanation: out.alert.explanation, advice: out.alert.advice, alertId: out.alert.id, incomplete: out.alert.incomplete };
  });

  /**
   * Extension iOS Message Filter (IdentityLookup). Apple envoie la requête de façon anonyme
   * (pas d'identifiant utilisateur) : on répond vite, sans IA, et on ne stocke rien.
   * Format de réponse propre à Vigie, interprété par l'extension.
   */
  app.post("/ios/message-filter", async (req) => {
    const body = z
      .object({ _version: z.number().optional(), query: z.object({ sender: z.string().optional(), message: z.object({ text: z.string().optional() }) }) })
      .parse(req.body);
    const text = body.query.message.text ?? "";
    if (!text) return { action: "none" };
    const result = await analyze({ source: "sms", senderId: body.query.sender ?? null, text, receivedAt: new Date() }, { deep: false, budgetMs: 2500 });
    return { action: result.verdict === "scam" ? "junk" : "none", verdict: result.verdict };
  });
}
