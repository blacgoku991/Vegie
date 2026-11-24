/**
 * Console multi-banques : droits par rôle, activation de compte, invitation client.
 * Nécessite Postgres (voir api.test.ts) ; ignoré si la base n'est pas joignable.
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
const { createSession } = await import("./context.ts");

const app = buildServer();
const stamp = Date.now();
const PW = "mot-de-passe-test-12";

interface Actor {
  id: string;
  email: string;
  cookie: string;
}
let bankA = "";
let bankB = "";
let superadmin: Actor;
let adminA: Actor;
let advisorA: Actor;
let adminB: Actor;
let agencyA = "";
let agencyB = "";
const userIds: string[] = [];

const hdr = (a: Actor) => ({ cookie: a.cookie });
const login = async (email: string, password = PW) => app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password } });
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"]).split(";")[0]!;

async function makeStaff(bankId: string | null, role: string, tag: string, extra: { agencyId?: string | null; line?: string | null } = {}): Promise<Actor> {
  const email = `${tag}-${stamp}@console.test`;
  const row = await pool.query(
    "insert into advisors (bank_id, role, email, name, agency, agency_id, outbound_number, password_hash) values ($1, $2, $3, $4, '', $5, $6, $7) returning id",
    [bankId, role, email, `Compte ${tag}`, extra.agencyId ?? null, extra.line ?? null, await hashPassword(PW)],
  );
  const res = await login(email);
  assert.equal(res.statusCode, 200, `connexion de ${tag}`);
  return { id: row.rows[0].id, email, cookie: cookieOf(res) };
}

async function makeUser(tag: string) {
  const phone = `+3363997${String(stamp).slice(-3)}${tag}`;
  const u = await pool.query("insert into users (phone, first_name) values ($1, $2) returning id", [phone, `Client${tag}`]);
  userIds.push(u.rows[0].id);
  const token = await createSession("user", u.rows[0].id, 1);
  return { id: u.rows[0].id as string, phone, headers: { authorization: `Bearer ${token}` } };
}

before(async () => {
  if (!reachable) return;
  await migrate();
  bankA = (await pool.query("insert into banks (slug, name, partner, official_numbers) values ($1, 'Banque A', true, '{+33199006600}') returning id", [`ca-${stamp}`])).rows[0].id;
  bankB = (await pool.query("insert into banks (slug, name, partner) values ($1, 'Banque B', true) returning id", [`cb-${stamp}`])).rows[0].id;
  agencyA = (await pool.query("insert into agencies (bank_id, name) values ($1, 'Agence A1') returning id", [bankA])).rows[0].id;
  agencyB = (await pool.query("insert into agencies (bank_id, name) values ($1, 'Agence B1') returning id", [bankB])).rows[0].id;
  superadmin = await makeStaff(null, "superadmin", "super");
  adminA = await makeStaff(bankA, "bank_admin", "admin-a", { agencyId: agencyA });
  advisorA = await makeStaff(bankA, "advisor", "advisor-a", { agencyId: agencyA, line: "+33199006611" });
  adminB = await makeStaff(bankB, "bank_admin", "admin-b", { agencyId: agencyB });
});

after(async () => {
  if (reachable) {
    const banks = [bankA, bankB];
    await pool.query("delete from certified_calls where bank_id = any($1)", [banks]);
    await pool.query("delete from user_banks where bank_id = any($1)", [banks]);
    await pool.query("delete from users where id = any($1)", [userIds]);
    await pool.query("delete from advisors where bank_id = any($1) or email like $2", [banks, `%-${stamp}@console.test`]);
    await pool.query("delete from banks where id = any($1) or slug like $2", [banks, `%-${stamp}`]);
  }
  await app.close();
  await pool.end();
});

const t = (name: string, fn: () => Promise<void>) => test(name, { skip: !reachable && "Postgres indisponible" }, fn);

t("un conseiller ne gère ni comptes, ni agences, ni réglages : 403", async () => {
  const post = (url: string, payload: object) => app.inject({ method: "POST", url, headers: hdr(advisorA), payload });
  assert.equal((await post("/v1/console/team", { name: "Intrus Test", email: `x-${stamp}@console.test`, role: "advisor" })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/team", headers: hdr(advisorA) })).statusCode, 403);
  assert.equal((await post("/v1/console/agencies", { name: "Agence pirate" })).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: "/v1/console/bank", headers: hdr(advisorA), payload: { officialNumbers: ["0199000000"] } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${adminA.id}/deactivate`, headers: hdr(advisorA) })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/admin/banks", headers: hdr(advisorA) })).statusCode, 403);
  // Sans session : 401.
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/team" })).statusCode, 401);
  // Mais il lit sa banque et ses agences.
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/bank", headers: hdr(advisorA) })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/agencies", headers: hdr(advisorA) })).json().length, 1);
});

t("un responsable ne touche que sa banque : 403 / 400 sur l'autre", async () => {
  const other = (await pool.query("select id from advisors where email = $1", [adminB.email])).rows[0].id;
  assert.equal((await app.inject({ method: "PATCH", url: `/v1/console/team/${other}`, headers: hdr(adminA), payload: { name: "Détourné" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${other}/deactivate`, headers: hdr(adminA) })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${other}/activation-link`, headers: hdr(adminA) })).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: `/v1/console/agencies/${agencyB}`, headers: hdr(adminA), payload: { name: "Pirate" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url: `/v1/console/agencies/${agencyB}`, headers: hdr(adminA) })).statusCode, 403);
  // Le superadmin n'est pas non plus à sa portée.
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${superadmin.id}/deactivate`, headers: hdr(adminA) })).statusCode, 403);
  // Affecter un conseiller à l'agence d'une autre banque est refusé.
  const bad = await app.inject({ method: "POST", url: "/v1/console/team", headers: hdr(adminA), payload: { name: "Test Agence", email: `ag-${stamp}@console.test`, role: "advisor", agencyId: agencyB } });
  assert.equal(bad.statusCode, 400);
  // L'équipe listée ne contient jamais l'autre banque ni de hash.
  const team = await app.inject({ method: "GET", url: "/v1/console/team", headers: hdr(adminA) });
  const list = team.json();
  assert.equal(list.length, 2);
  assert.ok(!list.some((m: { email: string }) => m.email === adminB.email));
  assert.ok(!/hash|scrypt|password/i.test(team.body), "aucun hash ni mot de passe dans la réponse");
  // Réglages : seulement sa banque.
  const patched = await app.inject({ method: "PATCH", url: "/v1/console/bank", headers: hdr(adminA), payload: { officialNumbers: ["01 99 00 66 00", "0199006601"], officialPhone: "0199006600" } });
  assert.equal(patched.statusCode, 200);
  assert.deepEqual(patched.json().officialNumbers, ["+33199006600", "+33199006601"]);
  const untouched = await pool.query("select official_numbers from banks where id = $1", [bankB]);
  assert.deepEqual(untouched.rows[0].official_numbers, []);
  // Le superadmin n'a pas de banque : les routes « métier » lui sont fermées.
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/clients?q=ab", headers: hdr(superadmin) })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/team", headers: hdr(superadmin) })).statusCode, 403);
});

t("le superadmin crée une banque et son premier responsable ; le responsable active son compte", async () => {
  const bad = await app.inject({ method: "POST", url: "/v1/console/admin/banks", headers: hdr(adminA), payload: { name: "X", slug: "x", admin: { name: "Y", email: "y@y.test" } } });
  assert.equal(bad.statusCode, 403, "un responsable ne crée pas de banque");

  const slug = `nouvelle-${stamp}`;
  const created = await app.inject({
    method: "POST",
    url: "/v1/console/admin/banks",
    headers: hdr(superadmin),
    payload: { name: "Nouvelle Banque", slug, officialNumbers: ["01 99 00 55 00"], admin: { name: "Nina Responsable", email: `nina-${stamp}@console.test` } },
  });
  assert.equal(created.statusCode, 200, created.body);
  const body = created.json();
  assert.equal(body.bank.slug, slug);
  assert.deepEqual(body.bank.officialNumbers, ["+33199005500"]);
  assert.equal(body.admin.role, "bank_admin");
  assert.equal(body.admin.activated, false);
  assert.ok(!/hash|scrypt/i.test(created.body));
  const token = new URL(body.activation.link).searchParams.get("token")!;

  // Pas de connexion avant activation.
  assert.equal((await login(`nina-${stamp}@console.test`, "n'importe-quoi-12")).statusCode, 401);

  const info = await app.inject({ method: "GET", url: `/v1/console/activate?token=${token}` });
  assert.equal(info.statusCode, 200);
  assert.equal(info.json().bankName, "Nouvelle Banque");
  // Mot de passe trop court : refusé, le jeton reste valable.
  assert.equal((await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token, password: "court" } })).statusCode, 400);
  const ok = await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token, password: PW } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().role, "bank_admin");
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/team", headers: { cookie: cookieOf(ok) } })).statusCode, 200);
  assert.equal((await login(`nina-${stamp}@console.test`)).statusCode, 200);
  // Usage unique.
  assert.equal((await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token, password: "un-autre-mot-de-passe" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: `/v1/console/activate?token=${token}` })).statusCode, 404);

  const list = (await app.inject({ method: "GET", url: "/v1/console/admin/banks", headers: hdr(superadmin) })).json();
  assert.ok(list.some((b: { slug: string }) => b.slug === slug));
});

t("création d'un conseiller : jeton haché, 72 h, expiré ou régénéré = invalide ; compte désactivé = 403", async () => {
  const email = `neo-${stamp}@console.test`;
  const created = await app.inject({
    method: "POST",
    url: "/v1/console/team",
    headers: hdr(adminA),
    payload: { name: "Neo Conseiller", email, role: "advisor", agencyId: agencyA, outboundNumber: "01 99 00 66 12" },
  });
  assert.equal(created.statusCode, 200, created.body);
  const { member, activation } = created.json();
  assert.equal(member.agency, "Agence A1");
  assert.equal(member.outboundNumber, "01 99 00 66 12");
  const token = new URL(activation.link).searchParams.get("token")!;
  const stored = await pool.query("select token_hash, expires_at from activation_tokens where advisor_id = $1", [member.id]);
  assert.equal(stored.rows[0].token_hash, sha256(token), "seul le haché est stocké");
  assert.notEqual(stored.rows[0].token_hash, token);
  const hours = (stored.rows[0].expires_at.getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 71 && hours <= 72, `72 h, obtenu ${hours}`);
  assert.equal((await app.inject({ method: "POST", url: "/v1/console/team", headers: hdr(adminA), payload: { name: "Doublon", email, role: "advisor" } })).statusCode, 409);

  // Régénération : l'ancien lien ne marche plus.
  const again = (await app.inject({ method: "POST", url: `/v1/console/team/${member.id}/activation-link`, headers: hdr(adminA) })).json();
  const token2 = new URL(again.link).searchParams.get("token")!;
  assert.notEqual(token2, token);
  assert.equal((await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token, password: PW } })).statusCode, 400);

  // Jeton expiré.
  await pool.query("update activation_tokens set expires_at = now() - interval '1 minute' where token_hash = $1", [sha256(token2)]);
  assert.equal((await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token: token2, password: PW } })).statusCode, 400);
  const fresh = (await app.inject({ method: "POST", url: `/v1/console/team/${member.id}/activation-link`, headers: hdr(adminA) })).json();
  const token3 = new URL(fresh.link).searchParams.get("token")!;
  const activated = await app.inject({ method: "POST", url: "/v1/console/activate", payload: { token: token3, password: PW } });
  assert.equal(activated.statusCode, 200);
  const session = { cookie: cookieOf(activated) };
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/me", headers: session })).statusCode, 200);

  // Désactivation : la session en cours tombe, la connexion est refusée (403), puis la réactivation rend l'accès.
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${member.id}/deactivate`, headers: hdr(adminA) })).json().active, false);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/me", headers: session })).statusCode, 401);
  const refused = await login(email);
  assert.equal(refused.statusCode, 403);
  assert.equal(refused.json().error, "account_disabled");
  assert.equal((await login(email, "mauvais-mot-de-passe")).statusCode, 401, "mauvais mot de passe : pas de fuite sur l'état du compte");
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${adminA.id}/deactivate`, headers: hdr(adminA) })).statusCode, 400, "pas d'auto-désactivation");
  await app.inject({ method: "POST", url: `/v1/console/team/${member.id}/reactivate`, headers: hdr(adminA) });
  assert.equal((await login(email)).statusCode, 200);

  // Mise à jour de la ligne directe par le responsable.
  const upd = await app.inject({ method: "PATCH", url: `/v1/console/team/${member.id}`, headers: hdr(adminA), payload: { outboundNumber: "0199006620" } });
  assert.equal(upd.json().outboundNumber, "01 99 00 66 20");
});

t("invitation client : code valide, réutilisé, expiré, inconnu, trop d'essais", async () => {
  const jeanne = await makeUser("1");
  const paul = await makeUser("2");
  const marie = await makeUser("3");
  const inviteRes = await app.inject({ method: "POST", url: "/v1/console/invites", headers: hdr(advisorA), payload: { customerRef: "REF-42", clientPhone: jeanne.phone } });
  assert.equal(inviteRes.statusCode, 200, inviteRes.body);
  const invite = inviteRes.json();
  assert.match(invite.code, /^\d{6}$/);
  assert.equal(invite.link, `smartsecure://join?code=${invite.code}`);
  const minutes = (Date.parse(invite.expiresAt) - Date.now()) / 60_000;
  assert.ok(minutes > 14 && minutes <= 15, `15 min, obtenu ${minutes}`);
  const stored = await pool.query("select code_hash from client_invites where id = $1", [invite.id]);
  assert.notEqual(stored.rows[0].code_hash, invite.code, "le code n'est pas stocké en clair");

  const join = (u: { headers: Record<string, string> }, code: string) => app.inject({ method: "POST", url: "/v1/me/banks/join", headers: u.headers, payload: { code } });
  const ok = await join(jeanne, invite.code);
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().status, "certified");
  assert.equal(ok.json().bank.id, bankA);
  const link = await pool.query("select status, customer_ref, linked_at from user_banks where user_id = $1 and bank_id = $2", [jeanne.id, bankA]);
  assert.equal(link.rows[0].status, "certified");
  assert.equal(link.rows[0].customer_ref, "REF-42");
  assert.ok(link.rows[0].linked_at);
  const mine = (await app.inject({ method: "GET", url: "/v1/me/banks", headers: jeanne.headers })).json();
  assert.equal(mine[0].status, "certified");

  // Réutilisé (par quelqu'un d'autre) et inexistant : même réponse.
  const reused = await join(paul, invite.code);
  assert.equal(reused.statusCode, 400);
  const unknown = await join(paul, invite.code === "123456" ? "654321" : "123456");
  assert.equal(unknown.statusCode, 400);

  // Expiré : même réponse que les autres cas.
  const expiredInvite = (await app.inject({ method: "POST", url: "/v1/console/invites", headers: hdr(advisorA), payload: { clientPhone: paul.phone } })).json();
  await pool.query("update client_invites set expires_at = now() - interval '1 minute' where id = $1", [expiredInvite.id]);
  const expired = await join(paul, expiredInvite.code);
  assert.equal(expired.statusCode, 400);
  assert.deepEqual(expired.json(), reused.json(), "code expiré, utilisé ou inexistant : réponse identique");
  assert.deepEqual(unknown.json(), reused.json());
  assert.equal((await pool.query("select 1 from user_banks where user_id = $1", [paul.id])).rowCount, 0);

  // Trop d'essais : 5 par 15 min et par utilisateur, même avec un bon code ensuite.
  for (let i = 0; i < 5; i++) assert.equal((await join(marie, "000000")).statusCode, 400);
  const good = (await app.inject({ method: "POST", url: "/v1/console/invites", headers: hdr(advisorA), payload: { clientPhone: paul.phone } })).json();
  const blocked = await join(marie, good.code);
  assert.equal(blocked.statusCode, 429);
  assert.equal((await pool.query("select 1 from user_banks where user_id = $1", [marie.id])).rowCount, 0);
  // La limite est par utilisateur : un autre client peut encore utiliser ce code.
  assert.equal((await join(paul, good.code)).statusCode, 200);

  // Format invalide et session absente.
  assert.equal((await join(paul, "12ab")).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/v1/me/banks/join", payload: { code: "123456" } })).statusCode, 401);

  // Le conseiller retrouve ensuite le client, déjà certifié, et peut annoncer un appel depuis sa ligne directe.
  const found = (await app.inject({ method: "GET", url: `/v1/console/clients?q=${encodeURIComponent(jeanne.phone)}`, headers: hdr(advisorA) })).json();
  assert.equal(found[0].linkStatus, "certified");
  const call = await app.inject({ method: "POST", url: "/v1/console/calls", headers: hdr(advisorA), payload: { userId: jeanne.id, reason: "Point épargne" } });
  assert.equal(call.statusCode, 200, call.body);
  assert.equal(call.json().callerNumber, "+33199006611");
  // Un autre conseiller (autre banque) ne voit ni ce client ni cet appel.
  assert.equal((await app.inject({ method: "GET", url: `/v1/console/clients?q=${encodeURIComponent(jeanne.phone)}`, headers: hdr(adminB) })).json().length, 0);
  assert.equal((await app.inject({ method: "GET", url: `/v1/console/calls/${call.json().id}`, headers: hdr(adminB) })).statusCode, 404);
});

t("une ligne directe égale à un numéro officiel public est refusée à l'annonce", async () => {
  const user = await makeUser("4");
  await pool.query("insert into user_banks (user_id, bank_id, status, linked_at) values ($1, $2, 'certified', now())", [user.id, bankA]);
  await pool.query("update advisors set outbound_number = '+33199006600' where id = $1", [advisorA.id]);
  const res = await app.inject({ method: "POST", url: "/v1/console/calls", headers: hdr(advisorA), payload: { userId: user.id, reason: "Point épargne" } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error, "caller_number_required");
  await pool.query("update advisors set outbound_number = '+33199006611' where id = $1", [advisorA.id]);
});

const joinAs = (u: { headers: Record<string, string> }, code: string) => app.inject({ method: "POST", url: "/v1/me/banks/join", headers: u.headers, payload: { code } });
const invitePhone = (a: Actor, clientPhone?: string) => app.inject({ method: "POST", url: "/v1/console/invites", headers: hdr(a), payload: { clientPhone } });

t("l'invitation est liée au numéro du client : un autre compte, même avec le bon code, est refusé à l'identique", async () => {
  const owner = await makeUser("5");
  const intruder = await makeUser("6");
  assert.equal((await invitePhone(advisorA)).statusCode, 400, "numéro du client obligatoire");
  const invite = (await invitePhone(advisorA, owner.phone)).json();
  const wrong = await joinAs(intruder, invite.code);
  assert.equal(wrong.statusCode, 400);
  const unknown = await joinAs(intruder, invite.code === "111111" ? "222222" : "111111");
  assert.deepEqual(wrong.json(), unknown.json());
  assert.equal((await pool.query("select 1 from user_banks where user_id = $1", [intruder.id])).rowCount, 0);
  // Le code n'est pas brûlé par l'intrus : le bon client peut encore l'utiliser.
  assert.equal((await joinAs(owner, invite.code)).statusCode, 200);
});

t("20 essais en parallèle : au plus 5 comptés, les autres en 429", async () => {
  const u = await makeUser("7");
  const res = await Promise.all(Array.from({ length: 20 }, () => joinAs(u, "000000")));
  const codes = res.map((r) => r.statusCode);
  assert.equal(codes.filter((c) => c === 400).length, 5);
  assert.equal(codes.filter((c) => c === 429).length, 15);
  const n = await pool.query("select count(*)::int as n from invite_attempts where user_id = $1", [u.id]);
  assert.equal(n.rows[0].n, 5);
});

t("désactiver un conseiller supprime ses invitations non utilisées", async () => {
  const mate = await makeStaff(bankA, "advisor", "mate", { line: "+33199006655" });
  const user = await makeUser("8");
  assert.equal((await invitePhone(mate, user.phone)).statusCode, 200);
  assert.equal((await pool.query("select 1 from client_invites where advisor_id = $1", [mate.id])).rowCount, 1);
  assert.equal((await app.inject({ method: "POST", url: `/v1/console/team/${mate.id}/deactivate`, headers: hdr(adminA) })).statusCode, 200);
  assert.equal((await pool.query("select 1 from client_invites where advisor_id = $1", [mate.id])).rowCount, 0);
});

t("au plus 20 invitations ouvertes par conseiller", async () => {
  const busy = await makeStaff(bankA, "advisor", "busy", { line: "+33199006656" });
  const user = await makeUser("9");
  const attempts = await Promise.all(Array.from({ length: 22 }, () => invitePhone(busy, user.phone)));
  assert.equal(attempts.filter(r => r.statusCode === 200).length, 20);
  assert.equal(attempts.filter(r => r.statusCode === 429).length, 2);
});

t("e-mail déjà pris : message générique", async () => {
  const res = await app.inject({ method: "POST", url: "/v1/console/team", headers: hdr(adminA), payload: { name: "Doublon Test", email: adminB.email, role: "advisor" } });
  assert.equal(res.statusCode, 409);
  assert.doesNotMatch(res.json().message, /existe/i);
});
