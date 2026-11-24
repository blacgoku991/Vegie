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
const { hashPassword } = await import("../lib/crypto.ts");

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
  bankId = (await pool.query("insert into banks (slug, name, partner, official_numbers) values ($1, 'Banque Test', true, '{+33199007777}') returning id", [slug])).rows[0].id;
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
  const ok = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(ok.certified, true);
  assert.equal(ok.match, "number_match");
  assert.equal(ok.call.advisorName, "Paul Test");
  // L'annonce est consommée par le premier appel concordant : un second check concordant n'est plus certifié.
  const second = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(second.certified, false);
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

t("sans numéro sortant renseigné, le numéro officiel de la banque sert de numéro attendu ; sans aucun numéro, refus", async () => {
  const email = `sans-numero-${advisorEmail}`;
  const adv = await pool.query("insert into advisors (bank_id, email, name, agency, outbound_number, password_hash) values ($1, $2, 'Sans Numero', 'Agence B', null, $3) returning id", [
    bankId,
    email,
    await hashPassword("secret-test"),
  ]);
  const login = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password: "secret-test" } });
  const other = String(login.headers["set-cookie"]).split(";")[0]!;
  const userId = (await app.inject({ method: "GET", url: `/v1/console/clients?q=${encodeURIComponent(phone)}`, headers: { cookie: other } })).json()[0].userId;

  const viaBank = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie: other }, payload: { userId, reason: "Point épargne" } });
  assert.equal(viaBank.statusCode, 200);
  assert.equal(viaBank.json().callerNumber, "+33199007777", "repli sur le numéro officiel de la banque");
  await app.inject({ method: "POST", url: `/v1/console/calls/${viaBank.json().id}/end`, headers: { cookie: other } });

  await pool.query("update banks set official_numbers = '{}', official_phone = null where id = $1", [bankId]);
  const none = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie: other }, payload: { userId, reason: "Point épargne" } });
  assert.equal(none.statusCode, 400, "pas de numéro attendu → pas d'annonce");
  const typed = await app.inject({ method: "POST", url: "/v1/console/calls", headers: { cookie: other }, payload: { userId, reason: "Point épargne", callerNumber: "0199007777" } });
  assert.equal(typed.statusCode, 200);
  assert.equal(typed.json().callerNumber, "+33199007777");
  await pool.query("update banks set official_numbers = '{+33199007777}' where id = $1", [bankId]);
  await pool.query("delete from certified_calls where advisor_id = $1", [adv.rows[0].id]);
  await pool.query("delete from advisors where id = $1", [adv.rows[0].id]);
});

t("un faux appel signalé depuis le numéro officiel est rattaché à la banque usurpée", async () => {
  await app.inject({ method: "POST", url: "/v1/me/calls/report", headers: auth(), payload: { number: "01 99 00 77 77", action: "hung_up" } });
  const reports = (await app.inject({ method: "GET", url: "/v1/console/reports", headers: { cookie } })).json();
  assert.equal(reports[0].spoofedOfficial, true);
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
});

t("droit à l'effacement : le compte et ses données disparaissent", async () => {
  assert.equal((await app.inject({ method: "DELETE", url: "/v1/me", headers: auth() })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/me", headers: auth() })).statusCode, 401);
});
