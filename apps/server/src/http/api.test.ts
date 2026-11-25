/**
 * Test d'intégration de l'API (nécessite Postgres : DATABASE_URL, base de test jetable).
 * Ignoré automatiquement si la base n'est pas joignable.
 * Lancer : DATABASE_URL=postgres://… npm test -w @vigie/server
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DEV_FIXED_OTP ??= "000000";
process.env.SMS_PROVIDER ??= "console";
process.env.AI_PROVIDER = "none";

const { pool } = await import("../db/pool.ts");
const reachable = await pool.query("select 1").then(
  () => true,
  () => false,
);

const { migrate } = await import("../db/migrate.ts");
const { buildServer } = await import("./server.ts");
const { hashPassword, sha256 } = await import("../lib/crypto.ts");

const app = buildServer();
const phone = `+3363998${String(Math.floor(Math.random() * 10_000)).padStart(4, "0")}`;
let token = "";
let cookie = "";
let bankId = "";
let advisorEmail = "";

before(async () => {
  if (!reachable) return;
  await migrate();
  const slug = `test-${Date.now()}`;
  bankId = (await pool.query("insert into banks (slug, name, partner, official_numbers) values ($1, 'Banque Test', true, '{+33199007700}') returning id", [slug])).rows[0].id;
  advisorEmail = `${slug}@banque.test`;
  await pool.query("insert into advisors (bank_id, email, name, agency, outbound_number, password_hash) values ($1, $2, 'Paul Test', 'Agence Test', '+33199007777', $3)", [
    bankId,
    advisorEmail,
    await hashPassword("secret-test"),
  ]);
});

after(async () => {
  if (reachable) {
    await pool.query("delete from users where phone = $1", [phone]);
    await pool.query("delete from certified_calls where bank_id = $1", [bankId]);
    await pool.query("delete from call_reports where bank_id = $1", [bankId]);
    await pool.query("delete from advisors where bank_id = $1", [bankId]);
    await pool.query("delete from banks where id = $1", [bankId]);
  }
  await app.close();
  await pool.end();
});

const t = (name: string, fn: () => Promise<void>) => test(name, { skip: !reachable && "Postgres indisponible" }, fn);
const auth = () => ({ authorization: `Bearer ${token}` });

t("connexion par code SMS", async () => {
  assert.equal((await app.inject({ method: "POST", url: "/v1/auth/start", payload: { phone } })).statusCode, 200);
  const bad = await app.inject({ method: "POST", url: "/v1/auth/verify", payload: { phone, code: "123456" } });
  assert.equal(bad.statusCode, 400);
  const res = await app.inject({ method: "POST", url: "/v1/auth/verify", payload: { phone, code: "000000" } });
  assert.equal(res.statusCode, 200);
  token = res.json().token;
  assert.ok(token.length > 20);
  assert.equal((await app.inject({ method: "GET", url: "/v1/home" })).statusCode, 401);
});

t("un code SMS réel ne délivre qu’une session, même lors de deux validations simultanées", async () => {
  const code = "748231";
  await pool.query(`insert into otp_codes(phone, code_hash, expires_at) values ($1, $2, now() + interval '5 minutes')
    on conflict(phone) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0`, [phone, sha256(code)]);
  const submit = () => app.inject({ method: "POST", url: "/v1/auth/verify", payload: { phone, code } });
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 400]);
});

t("le client ajoute sa banque partenaire : lien en attente", async () => {
  await app.inject({ method: "POST", url: "/v1/me/banks", headers: auth(), payload: { bankId } });
  const banks = (await app.inject({ method: "GET", url: "/v1/me/banks", headers: auth() })).json();
  assert.equal(banks[0].status, "pending");
});

t("sans annonce, l'appel n'est pas certifié", async () => {
  const res = (await app.inject({ method: "GET", url: "/v1/me/calls/check", headers: auth() })).json();
  assert.equal(res.certified, false);
  assert.equal(res.call, null);
});

t("l'accueil ne déclare pas les messages protégés : le serveur ne connaît que banques et mails", async () => {
  const home = (await app.inject({ method: "GET", url: "/v1/home", headers: auth() })).json();
  assert.deepEqual(home.sources, { banks: 1, mails: 0, mailsInError: 0 });
  assert.equal("messages" in home.sources, false);
  assert.equal("calls" in home.sources, false);
  // Lien « basic » (pas encore certifié) : la banque n'annonce rien pour ce client.
  const before = (await app.inject({ method: "GET", url: "/v1/me/calls/expected", headers: auth() })).json();
  assert.deepEqual(before.announcers, []);
});

t("le conseiller confirme l'identité puis annonce l'appel", async () => {
  const login = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email: advisorEmail, password: "secret-test" } });
  assert.equal(login.statusCode, 200);
  cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  const wrong = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email: advisorEmail, password: "nope" } });
  assert.equal(wrong.statusCode, 401);

  const found = (await app.inject({ method: "GET", url: `/v1/console/clients?q=${encodeURIComponent(phone)}`, headers: { cookie } })).json();
  assert.equal(found.length, 1);
  const userId = found[0].userId;

  const refused = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie }, payload: { userId, reason: "Point épargne" } });
  assert.equal(refused.statusCode, 409, "pas d'appel certifié avant confirmation d'identité");

  await app.inject({ method: "POST", url: `/v1/console/clients/${userId}/link`, headers: { cookie }, payload: { customerRef: "T-1" } });
  const call = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie }, payload: { userId, reason: "Point épargne" } });
  assert.equal(call.statusCode, 200);
  assert.equal(call.json().status, "announced");
  assert.equal(call.json().callerNumber, "+33199007777");
  const windowMin = (Date.parse(call.json().expiresAt) - Date.parse(call.json().createdAt)) / 60_000;
  assert.ok(windowMin <= 10 && windowMin > 9, `fenêtre de 10 min maximum, obtenu ${windowMin}`);
});

t("le client voit l'appel certifié, un autre numéro ou un numéro inconnu reste non certifié", async () => {
  // Filtrage Android sans annonce mémorisée : l'annonce ouverte est lisible sans la consommer ni la marquer « vue ».
  const noAuth = await app.inject({ method: "GET", url: "/v1/me/calls/expected" });
  assert.equal(noAuth.statusCode, 401);
  const expected = (await app.inject({ method: "GET", url: "/v1/me/calls/expected", headers: auth() })).json();
  assert.equal(expected.call.callerNumber, "+33199007777");
  assert.equal(expected.call.reason, undefined, "le motif ne sort que par la vérification du numéro");
  assert.deepEqual(expected.announcers, ["Banque Test"], "lien certifié + banque partenaire");
  const directory = (await app.inject({ method: "GET", url: "/v1/me/phone-directory", headers: auth() })).json();
  assert.deepEqual(directory.announcers, ["Banque Test"], "même liste que /me/calls/expected, pour le mode hors connexion");
  const ok = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(ok.certified, true);
  assert.equal(ok.match, "number_match");
  assert.equal(ok.call.advisorName, "Paul Test");
  // L'annonce est consommée par le premier appel concordant : un second check concordant n'est plus certifié.
  const second = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(second.certified, false);
  // Une annonce déjà utilisée n'est plus proposée au filtrage.
  const used = (await app.inject({ method: "GET", url: "/v1/me/calls/expected", headers: auth() })).json();
  assert.equal(used.call, null);
  const spoof = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0612345678", headers: auth() })).json();
  assert.equal(spoof.certified, false);
  assert.equal(spoof.match, "number_mismatch");
  // iPhone / bouton manuel : pas de numéro → on sait qu'un appel était prévu, jamais « certifié ».
  const blind = (await app.inject({ method: "GET", url: "/v1/me/calls/check", headers: auth() })).json();
  assert.equal(blind.certified, false);
  assert.equal(blind.match, "number_unknown");
  assert.equal(blind.call.id, ok.call.id);

  await app.inject({ method: "POST", url: `/v1/me/calls/${ok.call.id}/confirm`, headers: auth(), payload: { confirmed: true } });
  const detail = (await app.inject({ method: "GET", url: `/v1/console/calls/${ok.call.id}`, headers: { cookie } })).json();
  assert.equal(detail.status, "confirmed");
  assert.equal(detail.timeline.length, 3);

  // L'annonce est consommée par la confirmation : le même numéro ne repasse pas en vert.
  const again = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(again.certified, false);
  assert.equal(again.call, null);
});

t("seul le responsable peut déclarer la ligne directe utilisée pour une annonce", async () => {
  const email = `sans-numero-${advisorEmail}`;
  const adv = await pool.query("insert into advisors (bank_id, email, name, agency, outbound_number, password_hash) values ($1, $2, 'Sans Numero', 'Agence B', null, $3) returning id", [
    bankId,
    email,
    await hashPassword("secret-test"),
  ]);
  const login = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password: "secret-test" } });
  const other = String(login.headers["set-cookie"]).split(";")[0]!;
  const userId = (await app.inject({ method: "GET", url: `/v1/console/clients?q=${encodeURIComponent(phone)}`, headers: { cookie: other } })).json()[0].userId;
  const start = (payload: object) => app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie: other }, payload: { userId, reason: "Point épargne", ...payload } });

  const none = await start({});
  assert.equal(none.statusCode, 400, "pas de ligne directe, pas de numéro saisi : refus (plus de repli sur le numéro officiel)");
  assert.equal(none.json().error, "caller_number_required");
  assert.match(none.json().message, /ligne directe/);
  const override = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie }, payload: { userId, reason: "Rendez-vous", callerNumber: "0199007788" } });
  assert.equal(override.json().error, "caller_number_mismatch");
  const official = await start({ callerNumber: "01 99 00 77 00" });
  assert.equal(official.statusCode, 400, "un numéro officiel public ne peut pas être annoncé");
  assert.equal(official.json().error, "caller_number_required");
  const typed = await start({ callerNumber: "0199007788" });
  assert.equal(typed.statusCode, 400);
  assert.equal(typed.json().error, "caller_number_required");
  await pool.query("delete from certified_calls where advisor_id = $1", [adv.rows[0].id]);
  await pool.query("delete from advisors where id = $1", [adv.rows[0].id]);
});

t("deux annonces simultanées ne se superposent pas et une annonce expirée refuse la confirmation", async () => {
  const userId = (await app.inject({ method: "GET", url: "/v1/me", headers: auth() })).json().id;
  const start = () => app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie }, payload: { userId, reason: "Rendez-vous" } });
  const results = await Promise.all([start(), start()]);
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const id = results.find(r => r.statusCode === 200)!.json().id;
  await pool.query("update certified_calls set expires_at = now() - interval '1 second' where id = $1", [id]);
  const expired = await app.inject({ method: "POST", url: `/v1/me/calls/${id}/confirm`, headers: auth(), payload: { confirmed: true } });
  assert.equal(expired.statusCode, 404);
});

t("un faux appel signalé depuis le numéro officiel est rattaché à la banque usurpée", async () => {
  await app.inject({ method: "POST", url: "/v1/me/calls/report", headers: auth(), payload: { number: "01 99 00 77 00", action: "hung_up" } });
  const reports = (await app.inject({ method: "GET", url: "/v1/console/reports", headers: { cookie } })).json();
  assert.equal(reports[0].spoofedOfficial, true);
  await app.inject({ method: "POST", url: "/v1/me/calls/report", headers: auth(), payload: { bankId, action: "called_back" } });
  const stats = (await app.inject({ method: "GET", url: "/v1/console/stats", headers: { cookie } })).json();
  assert.equal(stats.fakeCallsReported, 1);
  assert.equal(stats.callbacksStarted, 1);
});

t("analyse d'un SMS partagé : arnaque détectée et enregistrée", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/me/scan",
    headers: auth(),
    payload: { source: "sms", sender: "+33612121212", text: "Ameli : votre carte vitale expire, renouvelez-la : ameli-carte-vitale-renouv.info/x (frais 2,99€)" },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().verdict, "scam");
  assert.equal(typeof res.json().incomplete, "boolean");
  const alert = (await app.inject({ method: "GET", url: `/v1/me/alerts/${res.json().alertId}`, headers: auth() })).json();
  assert.equal(alert.checks.length, 4);
  assert.equal(alert.title, "SMS analysé");
  assert.ok(alert.links.length > 0);
  assert.equal(alert.links[0].url, alert.links[0].domain);
});

t("droit à l'effacement : le compte et ses données disparaissent", async () => {
  assert.equal((await app.inject({ method: "DELETE", url: "/v1/me", headers: auth() })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/me", headers: auth() })).statusCode, 401);
});
