/**
 * Console v2 : fiches clients, notes, invitations, journal d'activité. Périmètre par banque, droits par rôle.
 * Nécessite Postgres (voir api.test.ts) ; ignoré si la base n'est pas joignable.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.DEV_FIXED_OTP ??= "000000";
process.env.SMS_PROVIDER ??= "console";
process.env.AI_PROVIDER = "none";

const { pool } = await import("../db/pool.ts");
const reachable = await pool.query("select 1").then(() => true, () => false);
const { migrate } = await import("../db/migrate.ts");
const { buildServer } = await import("./server.ts");
const { hashPassword } = await import("../lib/crypto.ts");
const { createSession } = await import("./context.ts");

const app = buildServer();
const stamp = Date.now() + 7;
const PW = "mot-de-passe-test-12";
interface Actor { id: string; email: string; cookie: string }
let bankA = "", bankB = "";
let adminA: Actor, advisorA: Actor, advisor2A: Actor, adminB: Actor;
let clientA = { id: "", phone: "", headers: {} as Record<string, string> };
let clientB = { id: "", phone: "", headers: {} as Record<string, string> };
const userIds: string[] = [];

const h = (a: Actor) => ({ cookie: a.cookie });
const get = (a: Actor, url: string) => app.inject({ method: "GET", url: `/v1/console${url}`, headers: h(a) });
const send = (a: Actor, method: "POST" | "DELETE" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url: `/v1/console${url}`, headers: h(a), payload });
const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"]).split(";")[0]!;

async function makeStaff(bankId: string, role: string, tag: string, line: string | null = null): Promise<Actor> {
  const email = `${tag}-${stamp}@console.test`;
  const row = await pool.query(
    "insert into advisors (bank_id, role, email, name, agency, outbound_number, password_hash) values ($1, $2, $3, $4, '', $5, $6) returning id",
    [bankId, role, email, `Compte ${tag}`, line, await hashPassword(PW)],
  );
  const res = await app.inject({ method: "POST", url: "/v1/console/login", payload: { email, password: PW } });
  assert.equal(res.statusCode, 200);
  return { id: row.rows[0].id, email, cookie: cookieOf(res) };
}

async function makeUser(tag: string, bankId: string, advisorId: string) {
  const phone = `+3363996${String(stamp).slice(-3)}${tag}`;
  const u = await pool.query("insert into users (phone, first_name) values ($1, $2) returning id", [phone, `Client${tag}`]);
  userIds.push(u.rows[0].id);
  await pool.query("insert into user_banks (user_id, bank_id, status, customer_ref, linked_at, referent_id) values ($1, $2, 'certified', $3, now(), $4)", [u.rows[0].id, bankId, `REF-${tag}`, advisorId]);
  const token = await createSession("user", u.rows[0].id, 1);
  return { id: u.rows[0].id as string, phone, headers: { authorization: `Bearer ${token}` } };
}

before(async () => {
  if (!reachable) return;
  await migrate();
  bankA = (await pool.query("insert into banks (slug, name, partner, official_numbers) values ($1, 'Banque V2A', true, '{+33199006800}') returning id", [`v2a-${stamp}`])).rows[0].id;
  bankB = (await pool.query("insert into banks (slug, name, partner) values ($1, 'Banque V2B', true) returning id", [`v2b-${stamp}`])).rows[0].id;
  adminA = await makeStaff(bankA, "bank_admin", "v2-admin-a");
  advisorA = await makeStaff(bankA, "advisor", "v2-advisor-a", "+33199006611");
  advisor2A = await makeStaff(bankA, "advisor", "v2-advisor2-a", "+33199006612");
  adminB = await makeStaff(bankB, "bank_admin", "v2-admin-b");
  clientA = await makeUser("1", bankA, advisorA.id);
  clientB = await makeUser("2", bankB, adminB.id);
  // Un signalement et un proche du client A : la banque ne doit voir que le signalement.
  await pool.query("insert into call_reports (user_id, bank_id, number, action) values ($1, $2, '+33199006800', 'hung_up')", [clientA.id, bankA]);
  await pool.query("insert into trusted_contacts (user_id, name, phone) values ($1, 'Proche Secret', '+33699999999')", [clientA.id]);
});

after(async () => {
  if (reachable) {
    const banks = [bankA, bankB];
    await pool.query("delete from certified_calls where bank_id = any($1)", [banks]);
    await pool.query("delete from user_banks where bank_id = any($1)", [banks]);
    await pool.query("delete from users where id = any($1)", [userIds]);
    await pool.query("delete from advisors where bank_id = any($1)", [banks]);
    await pool.query("delete from banks where id = any($1)", [banks]);
  }
  await app.close();
  await pool.end();
});

const t = (name: string, fn: () => Promise<void>) => test(name, { skip: !reachable && "Postgres indisponible" }, fn);

t("liste des clients : périmètre de la banque, téléphone masqué pour un conseiller, complet pour le responsable", async () => {
  const adv = await get(advisorA, "/customers");
  assert.equal(adv.statusCode, 200);
  const page = adv.json();
  assert.equal(page.total, 1);
  assert.equal(page.items[0].userId, clientA.id);
  assert.match(page.items[0].phone, /•• ••/);
  assert.ok(!adv.body.includes(clientA.phone) && !adv.body.includes(clientB.id));
  assert.equal(page.items[0].referent.id, advisorA.id);
  const adm = (await get(adminA, "/customers?status=certified&sort=last_call&dir=desc")).json();
  assert.doesNotMatch(adm.items[0].phone, /•/);
  assert.equal((await get(adminA, "/customers?q=Client1")).json().total, 1);
  assert.equal((await get(adminA, "/customers?q=Client2")).json().total, 0, "le client de l'autre banque est introuvable");
  assert.equal((await get(adminA, "/customers?agencyId=not-a-uuid")).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/customers" })).statusCode, 401);
});

t("fiche client d'une autre banque : 404 partout (fiche, appels, signalements, notes, journal, invitation, dissociation)", async () => {
  for (const actor of [advisorA, adminA]) {
    for (const path of ["", "/calls", "/reports", "/notes", "/journal"]) {
      assert.equal((await get(actor, `/customers/${clientB.id}${path}`)).statusCode, 404, `GET ${path}`);
    }
    assert.equal((await send(actor, "POST", `/customers/${clientB.id}/notes`, { text: "intrusion" })).statusCode, 404);
    assert.equal((await send(actor, "POST", `/customers/${clientB.id}/invite`)).statusCode, 404);
  }
  assert.equal((await send(adminA, "POST", `/customers/${clientB.id}/unlink`)).statusCode, 404);
  assert.equal((await get(adminA, "/customers/pas-un-uuid")).statusCode, 404);
  assert.equal((await get(adminB, `/customers/${clientA.id}`)).statusCode, 404);
  const still = await pool.query("select status from user_banks where user_id = $1 and bank_id = $2", [clientB.id, bankB]);
  assert.equal(still.rows[0].status, "certified");
});

t("fiche client : seulement ce qui concerne la banque (appels annoncés, signalements, notes), pas de proches", async () => {
  const call = await send(advisorA, "POST", "/calls", { userId: clientA.id, reason: "Point sur votre épargne" });
  assert.equal(call.statusCode, 200, call.body);
  const detail = await get(advisorA, `/customers/${clientA.id}`);
  assert.equal(detail.statusCode, 200);
  assert.deepEqual(detail.json().counts, { calls: 1, reports: 1, notes: 0 });
  const calls = (await get(advisorA, `/customers/${clientA.id}/calls`)).json();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].advisor.id, advisorA.id);
  const reports = await get(advisorA, `/customers/${clientA.id}/reports`);
  assert.equal(reports.json().length, 1);
  for (const body of [detail.body, reports.body, (await get(advisorA, `/customers/${clientA.id}/journal`)).body]) {
    assert.ok(!/Proche Secret|trusted|mailbox/i.test(body));
  }
  assert.ok(!detail.body.includes(clientA.phone), "le conseiller ne reçoit pas le numéro complet");
});

t("notes : création par un conseiller, suppression seulement par l'auteur ou le responsable", async () => {
  const mk = async (a: Actor, text: string) => (await send(a, "POST", `/customers/${clientA.id}/notes`, { text })).json();
  assert.equal((await send(advisorA, "POST", `/customers/${clientA.id}/notes`, { text: "   " })).statusCode, 400);
  const n1 = await mk(advisorA, "Souhaite être rappelé le matin.");
  assert.equal(n1.canDelete, true);
  const n2 = await mk(advisorA, "Note à supprimer par le responsable.");
  const seen = (await get(advisor2A, `/customers/${clientA.id}/notes`)).json();
  assert.equal(seen.length, 2);
  assert.equal(seen[0].canDelete, false, "un autre conseiller ne peut pas supprimer");
  assert.equal((await send(advisor2A, "DELETE", `/customers/${clientA.id}/notes/${n1.id}`)).statusCode, 403);
  assert.equal((await send(adminB, "DELETE", `/customers/${clientA.id}/notes/${n1.id}`)).statusCode, 404);
  // Une note d'un client ne se supprime pas via un autre client.
  assert.equal((await send(adminA, "DELETE", `/customers/${clientB.id}/notes/${n1.id}`)).statusCode, 404);
  assert.equal((await send(advisorA, "DELETE", `/customers/${clientA.id}/notes/${n1.id}`)).statusCode, 200);
  assert.equal((await send(adminA, "DELETE", `/customers/${clientA.id}/notes/${n2.id}`)).statusCode, 200);
  assert.equal((await get(advisorA, `/customers/${clientA.id}/notes`)).json().length, 0);
});

t("invitations : liste par rôle, jamais le code, annulation, code annulé refusé côté client", async () => {
  const mk = async (a: Actor) => (await send(a, "POST", `/customers/${clientA.id}/invite`)).json();
  const inv1 = await mk(advisorA);
  assert.match(inv1.code, /^\d{6}$/);
  const inv2 = await mk(advisor2A);
  const mineA = (await get(advisorA, "/invites")).json();
  assert.ok(mineA.some((i: { id: string }) => i.id === inv1.id) && !mineA.some((i: { id: string }) => i.id === inv2.id));
  const all = await get(adminA, "/invites");
  assert.ok(all.json().some((i: { id: string }) => i.id === inv2.id));
  assert.ok(!all.body.includes(inv1.code) && !/code_?hash/i.test(all.body));
  assert.equal((await get(adminB, "/invites")).json().some((i: { id: string }) => i.id === inv1.id), false);
  // Annuler l'invitation d'un autre conseiller : 404 ; d'une autre banque : 404 ; la sienne ou le responsable : 200.
  assert.equal((await send(advisorA, "DELETE", `/invites/${inv2.id}`)).statusCode, 404);
  assert.equal((await send(adminB, "DELETE", `/invites/${inv1.id}`)).statusCode, 404);
  assert.equal((await send(advisorA, "DELETE", `/invites/${inv1.id}`)).statusCode, 200);
  assert.equal((await send(advisorA, "DELETE", `/invites/${inv1.id}`)).statusCode, 404, "déjà annulée");
  const status = (await get(adminA, "/invites")).json().find((i: { id: string }) => i.id === inv1.id).status;
  assert.equal(status, "cancelled");
  const join = await app.inject({ method: "POST", url: "/v1/me/banks/join", headers: clientA.headers, payload: { code: inv1.code } });
  assert.equal(join.statusCode, 400, "un code annulé ne relie plus rien");
  assert.equal((await send(adminA, "DELETE", `/invites/${inv2.id}`)).statusCode, 200);
});

t("appels : liste filtrée par statut, conseiller et période", async () => {
  const all = (await get(adminA, "/call-log")).json();
  assert.equal(all.total, 1);
  assert.match(all.items[0].client.phone, /^\d\d \d\d \d\d \d\d \d\d$/, "le responsable voit le numéro complet");
  assert.equal((await get(adminA, `/call-log?advisorId=${advisor2A.id}`)).json().total, 0);
  assert.equal((await get(adminA, "/call-log?status=announced")).json().total, 1);
  assert.equal((await get(adminA, "/call-log?status=confirmed")).json().total, 0);
  assert.equal((await get(adminA, "/call-log?from=2099-01-01")).json().total, 0);
  assert.equal((await get(adminB, "/call-log")).json().total, 0, "les appels d'une autre banque restent invisibles");
  assert.equal((await get(advisorA, "/call-log?status=bidon")).statusCode, 400);
});

t("journal d'activité : alimenté par les actions clés, réservé au responsable, limité à sa banque", async () => {
  assert.equal((await get(advisorA, "/audit")).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/v1/console/audit" })).statusCode, 401);
  await send(adminA, "PATCH", `/team/${advisor2A.id}`, { outboundNumber: "+33199006613" });
  const res = await get(adminA, "/audit?pageSize=100");
  assert.equal(res.statusCode, 200);
  const actions = new Set<string>(res.json().items.map((e: { action: string }) => e.action));
  for (const a of ["auth.login", "call.announced", "invite.created", "invite.cancelled", "note.created", "note.deleted", "staff.line_changed"]) {
    assert.ok(actions.has(a), `événement ${a}`);
  }
  assert.ok(!/\+33\d{9}|\b0[1-9]( ?\d\d){4}\b/.test(res.body), "aucun numéro de téléphone dans le journal");
  assert.equal((await get(adminA, "/audit?category=note")).json().items.every((e: { action: string }) => e.action.startsWith("note.")), true);
  assert.equal((await get(adminA, `/audit?actorId=${advisor2A.id}`)).json().total, 2, "filtre par acteur : connexion et invitation");
  // Le journal de la fiche ne contient que les événements de ce client.
  const journal = (await get(advisorA, `/customers/${clientA.id}/journal`)).json();
  assert.ok(journal.length >= 3 && journal.every((e: { target: { id: string } }) => e.target.id === clientA.id));
  // Autre banque : ne voit rien de A.
  const other = (await get(adminB, "/audit?pageSize=100")).json();
  assert.ok(!other.items.some((e: { actor: { id: string } }) => [adminA.id, advisorA.id].includes(e.actor.id)));
});

t("dissocier : un conseiller reçoit 403, le responsable peut, le client disparaît et c'est journalisé", async () => {
  assert.equal((await send(advisorA, "POST", `/customers/${clientA.id}/unlink`)).statusCode, 403);
  assert.equal((await get(advisorA, `/customers/${clientA.id}`)).statusCode, 200, "toujours relié");
  const dash = await get(advisorA, "/dashboard");
  assert.equal(dash.statusCode, 200);
  assert.equal(dash.json().today.announced, 1);
  assert.equal((await send(adminA, "POST", `/customers/${clientA.id}/unlink`)).statusCode, 200);
  assert.equal((await get(adminA, `/customers/${clientA.id}`)).statusCode, 404);
  assert.equal((await get(adminA, "/customers")).json().total, 0);
  const ended = await pool.query("select status from certified_calls where user_id = $1 and bank_id = $2", [clientA.id, bankA]);
  assert.equal(ended.rows[0].status, "ended", "l'annonce ouverte est close");
  assert.ok((await get(adminA, "/audit?category=client")).json().items.some((e: { action: string }) => e.action === "client.unlinked"));
});
