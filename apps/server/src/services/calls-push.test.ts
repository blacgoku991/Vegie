/** Le push de fin d'annonce ne doit jamais retarder la réponse de /me/calls/check (Android n'attend qu'~1 s). */
import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.AI_PROVIDER = "none";
const { pool } = await import("../db/pool.ts");
const reachable = await pool.query("select 1").then(() => true, () => false);
const { migrate } = await import("../db/migrate.ts");
const { consumeMatch, expireCallJob } = await import("./calls.ts");

const realFetch = globalThis.fetch;
const created = { bank: "", user: "" };
const banks: string[] = [];
const users: string[] = [];

after(async () => {
  globalThis.fetch = realFetch;
  if (reachable) {
    await pool.query("delete from certified_calls where bank_id = any($1)", [banks]);
    await pool.query("delete from users where id = any($1)", [users]);
    await pool.query("delete from advisors where bank_id = any($1)", [banks]);
    await pool.query("delete from banks where id = any($1)", [banks]);
  }
  await pool.end();
});

async function setup() {
  await migrate();
  const stamp = Date.now();
  const bank = await pool.query("insert into banks (slug, name) values ($1, 'Banque Test Push') returning id", [`push-${stamp}`]);
  created.bank = bank.rows[0].id;
  banks.push(created.bank);
  const adv = await pool.query("insert into advisors (bank_id, role, email, name, agency, password_hash) values ($1, 'advisor', $2, 'Conseiller', 'Agence', 'x') returning id", [created.bank, `push-${stamp}@console.test`]);
  const user = await pool.query("insert into users (phone) values ($1) returning id", [`+3363995${String(stamp).slice(-4)}`]);
  created.user = user.rows[0].id;
  users.push(created.user);
  await pool.query("insert into push_tokens (user_id, token, platform) values ($1, $2, 'ios')", [created.user, `ExponentPushToken[${stamp}]`]);
  const call = await pool.query(
    "insert into certified_calls (bank_id, advisor_id, user_id, reason, caller_number, expires_at) values ($1, $2, $3, 'test', '+33199001234', now() + interval '10 minutes') returning id",
    [created.bank, adv.rows[0].id, created.user],
  );
  return call.rows[0].id as string;
}

test("consumeMatch répond vite même si le push est bloqué", { skip: !reachable }, async () => {
  const callId = await setup();
  let pushes = 0;
  globalThis.fetch = (() => { pushes++; return new Promise(() => {}); }) as typeof fetch; // ne répond jamais
  const t0 = Date.now();
  assert.equal(await consumeMatch(created.user, callId), true);
  assert.ok(Date.now() - t0 < 1000, "la réponse ne doit pas attendre le push");
  assert.equal(await consumeMatch(created.user, callId), false, "usage unique");
});

test("consumeMatch répond même si le push échoue", { skip: !reachable }, async () => {
  const callId = await setup();
  globalThis.fetch = (() => Promise.reject(new Error("réseau"))) as typeof fetch;
  assert.equal(await consumeMatch(created.user, callId), true);
});

test("expireCallJob : pas de push pour une annonce déjà consommée", { skip: !reachable }, async () => {
  const callId = await setup();
  let pushes = 0;
  globalThis.fetch = (() => { pushes++; return Promise.resolve(new Response(JSON.stringify({ data: [] }))); }) as typeof fetch;
  await consumeMatch(created.user, callId); // envoie son propre push de fin, en arrière-plan
  await new Promise((r) => setTimeout(r, 200));
  pushes = 0;
  await expireCallJob(callId);
  assert.equal(pushes, 0);
});

test("expireCallJob : push de fin pour une annonce restée ouverte", { skip: !reachable }, async () => {
  const callId = await setup();
  let body = "";
  globalThis.fetch = ((_u: unknown, init: RequestInit) => { body = String(init.body); return Promise.resolve(new Response(JSON.stringify({ data: [] }))); }) as typeof fetch;
  await expireCallJob(callId);
  assert.match(body, /certified_call_ended/);
});
