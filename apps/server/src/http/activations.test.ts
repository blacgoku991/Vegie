/**
 * Liaison par lien d'activation + durcissements de la console (lien basic, masquage, recherche, numéros officiels).
 * Nécessite Postgres (voir api.test.ts) ; ignoré si la base n'est pas joignable.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

process.env.DEV_FIXED_OTP ??= "000000";
process.env.SMS_PROVIDER ??= "console";
process.env.AI_PROVIDER = "none";
process.env.EXPOSE_ACTIVATION_LINK = "true";

const { pool } = await import("../db/pool.ts");
const reachable = await pool.query("select 1").then(() => true, () => false);
const { migrate } = await import("../db/migrate.ts");
const { buildServer } = await import("./server.ts");
const { hashPassword } = await import("../lib/crypto.ts");
const { createSession } = await import("./context.ts");
const { config } = await import("../config.ts");

const app = buildServer();
const stamp = Date.now() % 100000;
const PW = "mot-de-passe-test-12";
interface Actor { id: string; cookie: string }
let bankA = "", bankB = "";
let adminA: Actor, advisorA: Actor, advisorA2: Actor, adminB: Actor, advisorB: Actor;
const userIds: string[] = [];
let n = 0;
// Numéros fictifs 06 39 98 xx xx ; le milieu dépend de l'exécution pour éviter les collisions.
const phone = () => `0639${String(stamp % 100).padStart(2, "0")}${String(Math.floor(stamp / 100) % 10)}${String(++n).padStart(3, "0")}`.slice(0, 10);
const e164 = (p: string) => `+33${p.slice(1)}`;

const call = (a: Actor | null, method: "GET" | "POST" | "DELETE" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url: `/v1${url}`, headers: a ? { cookie: a.cookie } : undefined, payload });
const tokenOf = (webLink: string) => new URL(webLink).searchParams.get("token")!;

async function makeStaff(bankId: string, role: string, tag: string): Promise<Actor> {
  const email = `${tag}-${stamp}@act.test`;
  const row = await pool.query("insert into advisors (bank_id, role, email, name, agency, password_hash) values ($1, $2, $3, $4, '', $5) returning id", [bankId, role, email, `Compte ${tag}`, await hashPassword(PW)]);
  const res = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password: PW } });
  assert.equal(res.statusCode, 200);
  return { id: row.rows[0].id, cookie: String(res.headers["set-cookie"]).split(";")[0]! };
}

async function makeUser(p: string, bankId: string | null, status: string, firstName = "Test") {
  const u = await pool.query("insert into users (phone, first_name) values ($1, $2) returning id", [e164(p), firstName]);
  userIds.push(u.rows[0].id);
  if (bankId) await pool.query("insert into user_banks (user_id, bank_id, status, customer_ref) values ($1, $2, $3, $4)", [u.rows[0].id, bankId, status, `R-${p.slice(-4)}`]);
  return u.rows[0].id as string;
}

before(async () => {
  if (!reachable) return;
  await migrate();
  await pool.query("delete from activation_attempts");
  bankA = (await pool.query("insert into banks (slug, name, partner) values ($1, 'Banque ActA', true) returning id", [`acta-${stamp}`])).rows[0].id;
  bankB = (await pool.query("insert into banks (slug, name, partner, official_numbers) values ($1, 'Banque ActB', true, '{+33199007700}') returning id", [`actb-${stamp}`])).rows[0].id;
  adminA = await makeStaff(bankA, "bank_admin", "adm-a");
  advisorA = await makeStaff(bankA, "advisor", "adv-a");
  advisorA2 = await makeStaff(bankA, "advisor", "adv-a2");
  adminB = await makeStaff(bankB, "bank_admin", "adm-b");
  advisorB = await makeStaff(bankB, "advisor", "adv-b");
});

after(async () => {
  if (reachable) {
    const banks = [bankA, bankB];
    await pool.query("delete from certified_calls where bank_id = any($1)", [banks]);
    await pool.query("delete from call_reports where bank_id = any($1) or user_id = any($2)", [banks, userIds]);
    await pool.query("delete from client_activations where bank_id = any($1)", [banks]);
    await pool.query("delete from user_banks where bank_id = any($1)", [banks]);
    await pool.query("delete from users where id = any($1)", [userIds]);
    await pool.query("delete from audit_events where bank_id = any($1)", [banks]);
    await pool.query("delete from advisors where bank_id = any($1)", [banks]);
    await pool.query("delete from banks where id = any($1)", [banks]);
  }
  await app.close();
  await pool.end();
});

const t = (name: string, fn: () => Promise<void>) => test(name, { skip: !reachable && "Postgres indisponible" }, fn);
const create = (a: Actor, p: string, extra: object = {}) => call(a, "POST", "/console/customers", { firstName: "Colette", phone: p, customerRef: "HZ-9", ...extra });

t("création puis activation : compte créé, lien certifié, session valide, journal sans numéro ni jeton", async () => {
  const p = phone();
  const res = await create(advisorA, p);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.match(body.maskedPhone, /••/);
  assert.ok(body.link.startsWith("smartsecure://activate?token="));
  assert.match(body.activation.phone, /••/);
  const token = tokenOf(body.webLink);
  const stored = await pool.query("select token_hash from client_activations where id = $1", [body.activation.id]);
  assert.ok(!stored.rows[0].token_hash.includes(token), "le jeton est stocké haché");
  const act = await call(null, "POST", "/auth/activate", { token });
  assert.equal(act.statusCode, 200);
  const session = act.json();
  userIds.push(session.user.id);
  assert.equal(session.user.firstName, "Colette");
  assert.equal(session.user.phone, e164(p));
  const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(me.statusCode, 200);
  const link = await pool.query("select status, customer_ref, referent_id from user_banks where user_id = $1 and bank_id = $2", [session.user.id, bankA]);
  assert.deepEqual(link.rows[0], { status: "certified", customer_ref: "HZ-9", referent_id: advisorA.id });
  const events = JSON.stringify((await pool.query("select * from audit_events where bank_id = $1", [bankA])).rows);
  assert.ok(events.includes("invite.activation_created") && events.includes("invite.activation_used"));
  assert.ok(!events.includes(p) && !events.includes(p.slice(1)) && !events.includes(token), "aucun numéro ni jeton dans le journal");
  assert.equal((await call(advisorA, "GET", "/console/activations")).json().length, 0, "plus en attente après activation");
});

t("jeton réutilisé, annulé, expiré ou inconnu : même 400 générique", async () => {
  const used = (await create(advisorA, phone())).json();
  const tk = tokenOf(used.webLink);
  const first = await call(null, "POST", "/auth/activate", { token: tk });
  assert.equal(first.statusCode, 200);
  userIds.push(first.json().user.id);
  const cancelled = (await create(advisorA, phone())).json();
  assert.equal((await call(advisorA, "DELETE", `/console/activations/${cancelled.activation.id}`)).statusCode, 200);
  const expired = (await create(advisorA, phone())).json();
  await pool.query("update client_activations set expires_at = now() - interval '1 minute' where id = $1", [expired.activation.id]);
  const bodies: string[] = [];
  for (const token of [tk, tokenOf(cancelled.webLink), tokenOf(expired.webLink), "jeton-inconnu-0123456789"]) {
    const r = await call(null, "POST", "/auth/activate", { token });
    assert.equal(r.statusCode, 400);
    bodies.push(r.body);
  }
  assert.equal(new Set(bodies).size, 1, "réponses identiques");
});

t("numéro qui a déjà un compte : le lien n'ouvre aucune session et n'est pas consommé ; liaison seulement depuis ce compte connecté", async () => {
  const p = phone();
  const existing = await makeUser(p, bankB, "certified", "Ancien");
  const other = await makeUser(phone(), null, "basic", "Autre");
  const res = (await create(advisorA, p, { firstName: "Nouveau" })).json();
  const tk = tokenOf(res.webLink);
  const act = await call(null, "POST", "/auth/activate", { token: tk });
  assert.equal(act.statusCode, 200);
  assert.equal(act.json().requiresLogin, true);
  assert.match(act.json().phone, /••/);
  assert.ok(!("token" in act.json()) && !act.body.includes(existing), "aucune session ouverte");
  assert.equal((await pool.query("select used_at from client_activations where id = $1", [res.activation.id])).rows[0].used_at, null, "jeton non consommé");
  const bearer = async (id: string) => ({ authorization: `Bearer ${await createSession("user", id, 1)}` });
  // Un autre compte connecté ne peut pas utiliser le lien, et ne le brûle pas.
  const wrong = await app.inject({ method: "POST", url: "/v1/me/banks/activate", headers: await bearer(other), payload: { token: tk } });
  assert.equal(wrong.statusCode, 400);
  assert.equal((await pool.query("select used_at from client_activations where id = $1", [res.activation.id])).rows[0].used_at, null);
  assert.equal((await pool.query("select 1 from user_banks where user_id = $1 and bank_id = $2", [other, bankA])).rowCount, 0);
  assert.equal((await app.inject({ method: "POST", url: "/v1/me/banks/activate", payload: { token: tk } })).statusCode, 401);
  // Le bon compte, connecté, relie la banque.
  const ok = await app.inject({ method: "POST", url: "/v1/me/banks/activate", headers: await bearer(existing), payload: { token: tk } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().status, "certified");
  const banks = await pool.query("select status from user_banks where user_id = $1", [existing]);
  assert.equal(banks.rowCount, 2);
  assert.ok(banks.rows.every((r) => r.status === "certified"));
  assert.equal((await pool.query("select first_name from users where id = $1", [existing])).rows[0].first_name, "Ancien");
  assert.equal((await app.inject({ method: "POST", url: "/v1/me/banks/activate", headers: await bearer(existing), payload: { token: tk } })).statusCode, 400, "usage unique");
});

t("accès inter-banques : lister, renvoyer, annuler l'activation d'une autre banque donne 404 ; la banque vient de la session", async () => {
  const res = (await create(advisorA, phone(), { bankId: bankB })).json();
  const row = await pool.query("select bank_id from client_activations where id = $1", [res.activation.id]);
  assert.equal(row.rows[0].bank_id, bankA, "bankId du corps ignoré");
  for (const actor of [adminB, advisorB]) {
    assert.ok(!(await call(actor, "GET", "/console/activations")).body.includes(res.activation.id));
    assert.equal((await call(actor, "POST", `/console/activations/${res.activation.id}/resend`)).statusCode, 404);
    assert.equal((await call(actor, "DELETE", `/console/activations/${res.activation.id}`)).statusCode, 404);
  }
  assert.equal((await call(advisorA2, "DELETE", `/console/activations/${res.activation.id}`)).statusCode, 404, "un autre conseiller ne voit pas les siennes");
  assert.equal((await call(adminA, "GET", "/console/activations")).json().some((a: { id: string }) => a.id === res.activation.id), true);
  assert.equal((await call(null, "POST", "/console/customers", { firstName: "X", phone: phone() })).statusCode, 401);
  assert.equal((await create(advisorA, "abc")).statusCode, 400);
});

t("renvoyer invalide l'ancien lien ; recréer pour le même numéro remplace l'ancienne activation", async () => {
  const p = phone();
  const first = (await create(advisorA, p)).json();
  assert.equal((await call(advisorA, "POST", `/console/activations/${first.activation.id}/resend`)).statusCode, 429, "délai entre deux envois");
  await pool.query("update client_activations set last_sent_at = now() - interval '5 minutes' where id = $1", [first.activation.id]);
  const resent = (await call(advisorA, "POST", `/console/activations/${first.activation.id}/resend`)).json();
  assert.notEqual(tokenOf(resent.webLink), tokenOf(first.webLink));
  assert.equal((await call(null, "POST", "/auth/activate", { token: tokenOf(first.webLink) })).statusCode, 400);
  const again = (await create(advisorA2, p)).json();
  assert.notEqual(again.activation.id, first.activation.id);
  assert.equal((await call(null, "POST", "/auth/activate", { token: tokenOf(resent.webLink) })).statusCode, 400);
  const open = await pool.query("select count(*)::int as n from client_activations where bank_id = $1 and phone = $2 and used_at is null and cancelled_at is null", [bankA, e164(p)]);
  assert.equal(open.rows[0].n, 1);
  const ok = await call(null, "POST", "/auth/activate", { token: tokenOf(again.webLink) });
  assert.equal(ok.statusCode, 200);
  userIds.push(ok.json().user.id);
});

t("plafond de 30 créations par conseiller et par jour (429)", async () => {
  const adv = await makeStaff(bankA, "advisor", "adv-cap");
  for (let i = 0; i < 30; i++) {
    await pool.query("insert into client_activations (bank_id, advisor_id, phone, first_name, token_hash, expires_at, cancelled_at) values ($1, $2, $3, 'X', $4, now() + interval '1 day', now())", [bankA, adv.id, `+3363990${String(i).padStart(4, "9")}`, `cap-${stamp}-${i}`]);
  }
  assert.equal((await create(adv, phone())).statusCode, 429);
  assert.equal((await create(advisorA2, phone())).statusCode, 200, "le plafond est par conseiller");
});

t("sans EXPOSE_ACTIVATION_LINK : jamais de lien ni de jeton (création, renvoi, liste) ; le serveur refuse de démarrer en production avec le drapeau", async () => {
  const before = config.EXPOSE_ACTIVATION_LINK;
  (config as { EXPOSE_ACTIVATION_LINK: boolean }).EXPOSE_ACTIVATION_LINK = false;
  try {
    const r = await create(advisorA2, phone());
    assert.equal(r.statusCode, 200);
    const noLink = (body: string) => !body.includes("token=") && !body.includes("smartsecure://") && !body.includes("webLink") && !body.includes('"link"');
    assert.ok(noLink(r.body));
    await pool.query("update client_activations set last_sent_at = now() - interval '5 minutes' where id = $1", [r.json().activation.id]);
    const resent = await call(advisorA2, "POST", `/console/activations/${r.json().activation.id}/resend`);
    assert.equal(resent.statusCode, 200);
    assert.ok(noLink(resent.body));
    assert.ok(noLink((await call(advisorA2, "GET", "/console/activations")).body));
  } finally {
    (config as { EXPOSE_ACTIVATION_LINK: boolean }).EXPOSE_ACTIVATION_LINK = before;
  }
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", 'await import("./src/config.ts")'], {
    env: { ...process.env, NODE_ENV: "production", ENCRYPTION_KEY: "x", PUBLIC_URL: "https://api.example", DEV_FIXED_OTP: "", EXPOSE_ACTIVATION_LINK: "true" },
    encoding: "utf8",
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /EXPOSE_ACTIVATION_LINK/);
});

t("les renvois comptent dans le plafond quotidien de 30 SMS", async () => {
  const adv = await makeStaff(bankA, "advisor", "adv-resend-cap");
  for (let i = 0; i < 28; i++) await pool.query("insert into activation_sends (advisor_id) values ($1)", [adv.id]);
  const first = await create(adv, phone());
  assert.equal(first.statusCode, 200);
  await pool.query("update client_activations set last_sent_at = now() - interval '5 minutes' where id = $1", [first.json().activation.id]);
  assert.equal((await call(adv, "POST", `/console/activations/${first.json().activation.id}/resend`)).statusCode, 200, "30e SMS");
  await pool.query("update client_activations set last_sent_at = now() - interval '5 minutes' where id = $1", [first.json().activation.id]);
  assert.equal((await call(adv, "POST", `/console/activations/${first.json().activation.id}/resend`)).statusCode, 429);
});

t("créations concurrentes pour le même numéro : jamais de 500, une seule activation ouverte", async () => {
  const p = phone();
  const rs = await Promise.all([create(advisorA, p), create(advisorA2, p), create(adminA, p)]);
  assert.ok(rs.every((r) => r.statusCode === 200 || r.statusCode === 409), rs.map((r) => r.statusCode).join());
  assert.ok(rs.some((r) => r.statusCode === 200));
  const open = await pool.query("select count(*)::int as n from client_activations where bank_id = $1 and phone = $2 and used_at is null and cancelled_at is null", [bankA, e164(p)]);
  assert.equal(open.rows[0].n, 1);
});

// ───────────── Durcissements de la revue de sécurité ─────────────
t("lien /link : seul un lien pending peut être certifié ; la recherche ignore les liens basic", async () => {
  const p1 = phone(), p2 = phone();
  const basic = await makeUser(p1, bankA, "basic", "Dissocie");
  const pending = await makeUser(p2, bankA, "pending", "Attente");
  assert.equal((await call(advisorA, "POST", `/console/clients/${basic}/link`, { customerRef: "ZZ-1" })).statusCode, 404);
  assert.equal((await pool.query("select status from user_banks where user_id = $1", [basic])).rows[0].status, "basic");
  assert.deepEqual((await call(advisorA, "GET", `/console/clients?q=${p1}`)).json(), []);
  assert.equal((await call(advisorA, "GET", `/console/clients?q=${p2}`)).json().length, 1);
  assert.equal((await call(advisorA, "POST", `/console/clients/${pending}/link`, { customerRef: "ZZ-2" })).statusCode, 200);
  assert.equal((await call(advisorA, "POST", `/console/clients/${pending}/link`, { customerRef: "ZZ-3" })).statusCode, 404, "déjà certifié");
});

t("numéro du client masqué pour un conseiller dans la recherche et les appels, complet pour le responsable", async () => {
  const p = phone();
  const id = await makeUser(p, bankA, "certified", "Masque");
  const adv = await call(advisorA, "GET", `/console/clients?q=${p}`);
  assert.equal(adv.json().length, 1);
  assert.match(adv.json()[0].phone, /••/);
  const adm = await call(adminA, "GET", `/console/clients?q=${p}`);
  assert.doesNotMatch(adm.json()[0].phone, /•/);
  await pool.query("update advisors set outbound_number = $2 where id = $1", [advisorA.id, `+3319900${String(stamp).padStart(5, "0")}`]);
  const started = await call(advisorA, "POST", "/console/calls", { userId: id, reason: "Point épargne" });
  assert.equal(started.statusCode, 200);
  assert.match(started.json().client.phone, /••/);
  assert.match((await call(advisorA, "GET", `/console/calls/${started.json().id}`)).json().client.phone, /••/);
  assert.match((await call(advisorA, "GET", "/console/calls")).json()[0].client.phone, /••/);
  assert.doesNotMatch((await call(adminA, "GET", `/console/calls/${started.json().id}`)).json().client.phone, /•/);
});

t("recherche par fin de numéro : réservée au responsable ; le conseiller doit saisir le numéro complet", async () => {
  const p = phone();
  await makeUser(p, bankA, "certified", "Suffixe");
  const suffix = p.slice(-6);
  assert.deepEqual((await call(advisorA, "GET", `/console/clients?q=${suffix}`)).json(), [], "pas d'oracle de suffixe pour un conseiller");
  assert.equal((await call(advisorA, "GET", `/console/clients?q=${p}`)).json().length, 1);
  assert.equal((await call(advisorA, "GET", "/console/clients?q=Suffixe")).json().length, 1, "le prénom reste cherchable");
  assert.equal((await call(adminA, "GET", `/console/clients?q=${suffix}`)).json().length, 1);
  // Même règle sur la liste des clients (/console/customers).
  const total = async (who: typeof advisorA, q: string) => (await call(who, "GET", `/console/customers?q=${encodeURIComponent(q)}`)).json().total;
  assert.equal(await total(advisorA, suffix), 0, "liste clients : pas d'oracle de suffixe pour un conseiller");
  assert.equal(await total(advisorA, p), 1, "liste clients : le numéro complet reste cherchable");
  assert.equal(await total(adminA, suffix), 1, "liste clients : le responsable peut chercher par fin de numéro");
});

t("numéro officiel déjà déclaré par une autre banque : 409 ; un signalement n'est rattaché par numéro qu'à une banque liée à l'utilisateur", async () => {
  assert.equal((await call(adminA, "PATCH", "/console/bank", { officialNumbers: ["01 99 00 77 00"] })).statusCode, 409);
  assert.equal((await call(adminA, "PATCH", "/console/bank", { officialPhone: "0199007700" })).statusCode, 409);
  assert.equal((await call(adminA, "PATCH", "/console/bank", { officialNumbers: ["0199007701"] })).statusCode, 200);
  // Client de la banque B uniquement, qui signale un numéro officiel de la banque A : pas de rattachement à A.
  const user = await makeUser(phone(), bankB, "certified");
  const tok = await createSession("user", user, 1);
  const report = (number: string) => app.inject({ method: "POST", url: "/v1/me/calls/report", headers: { authorization: `Bearer ${tok}` }, payload: { number, action: "hung_up" } });
  assert.equal((await report("+33199007701")).statusCode, 200);
  assert.equal((await pool.query("select bank_id from call_reports where user_id = $1 and number = '+33199007701'", [user])).rows[0].bank_id, null);
  assert.equal((await report("+33199007700")).statusCode, 200);
  assert.equal((await pool.query("select bank_id from call_reports where user_id = $1 and number = '+33199007700'", [user])).rows[0].bank_id, bankB);
});

t("trop d’échecs d’activation depuis une IP : 429", async () => {
  await pool.query("delete from activation_attempts");
  await pool.query("insert into activation_attempts (ip) select '127.0.0.1' from generate_series(1, 20)");
  const r = await call(null, "POST", "/auth/activate", { token: "jeton-inconnu-0123456789" });
  assert.equal(r.statusCode, 429);
  await pool.query("delete from activation_attempts");
});

t("les jokers % _ \\ saisis dans une recherche sont littéraux", async () => {
  await makeUser(phone(), bankA, "certified", "Joker");
  for (const q of ["%%", "__", "J%r", "\\\\"]) {
    assert.deepEqual((await call(adminA, "GET", `/console/clients?q=${encodeURIComponent(q)}`)).json(), [], q);
    assert.equal((await call(adminA, "GET", `/console/customers?q=${encodeURIComponent(q)}`)).json().total, 0, q);
  }
  assert.equal((await call(adminA, "GET", "/console/clients?q=Jok")).json().length, 1);
});

t("POST /console/admin/banks : numéro officiel déjà déclaré par une autre banque : 409", async () => {
  const email = `root-${stamp}@act.test`;
  const row = await pool.query("insert into advisors (bank_id, role, email, name, agency, password_hash) values (null, 'superadmin', $1, 'Root', '', $2) returning id", [email, await hashPassword(PW)]);
  try {
    const login = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password: PW } });
    const root = { id: row.rows[0].id, cookie: String(login.headers["set-cookie"]).split(";")[0]! };
    const body = (slug: string, nums: string[]) => ({ name: "Banque Neuve", slug, officialNumbers: nums, admin: { name: "Resp Neuf", email: `${slug}@act.test` } });
    assert.equal((await call(root, "POST", "/console/admin/banks", body(`neuve-${stamp}`, ["01 99 00 77 00"]))).statusCode, 409);
    const ok = await call(root, "POST", "/console/admin/banks", body(`neuve-${stamp}`, ["0199007702"]));
    assert.equal(ok.statusCode, 200);
    await pool.query("delete from advisors where email = $1", [`neuve-${stamp}@act.test`]);
    await pool.query("delete from banks where id = $1", [ok.json().bank.id]);
  } finally {
    await pool.query("delete from sessions where advisor_id = $1", [row.rows[0].id]);
    await pool.query("delete from advisors where id = $1", [row.rows[0].id]);
  }
});
