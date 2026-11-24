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
});

t("le client voit l'appel certifié, un autre numéro reste non certifié", async () => {
  const ok = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0199007777", headers: auth() })).json();
  assert.equal(ok.certified, true);
  assert.equal(ok.call.advisorName, "Paul Test");
  const spoof = (await app.inject({ method: "GET", url: "/v1/me/calls/check?number=0612345678", headers: auth() })).json();
  assert.equal(spoof.certified, false);

  await app.inject({ method: "POST", url: `/v1/me/calls/${ok.call.id}/confirm`, headers: auth(), payload: { confirmed: true } });
  const detail = (await app.inject({ method: "GET", url: `/v1/console/calls/${ok.call.id}`, headers: { cookie } })).json();
  assert.equal(detail.status, "confirmed");
  assert.equal(detail.timeline.length, 3);
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
  const alert = (await app.inject({ method: "GET", url: `/v1/me/alerts/${res.json().alertId}`, headers: auth() })).json();
  assert.equal(alert.checks.length, 4);
});

t("droit à l'effacement : le compte et ses données disparaissent", async () => {
  assert.equal((await app.inject({ method: "DELETE", url: "/v1/me", headers: auth() })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/me", headers: auth() })).statusCode, 401);
});
