/**
 * Données de démonstration (développement uniquement).
 * - Une banque partenaire fictive, « Banque Horizon », et les grandes banques en protection de base.
 * - Les numéros de démo sont dans les plages réservées à la fiction par l'ARCEP (01 99 00…, 06 39 98…).
 * - Les alertes passent par le vrai moteur d'analyse.
 */
import { isProd } from "../config.ts";
import { hashPassword, randomToken, sha256 } from "../lib/crypto.ts";
import { processMessage } from "../services/alerts.ts";
import { migrate } from "./migrate.ts";
import { one, pool } from "./pool.ts";

if (isProd) throw new Error("Le jeu de démo ne doit jamais tourner en production.");

await migrate();
await pool.query(`truncate users, banks, advisors, agencies, activation_tokens, client_invites, client_activations, activation_attempts, client_notes, audit_events, invite_attempts, sessions, push_tokens, user_banks, certified_calls, call_reports,
  reported_numbers, mailboxes, alerts, trusted_contacts, oauth_states, domain_intel, otp_codes, jobs restart identity cascade`);

const realBanks: Array<[string, string, string[]]> = [
  ["credit-agricole", "Crédit Agricole", ["credit-agricole.fr"]],
  ["bnp-paribas", "BNP Paribas", ["bnpparibas.fr"]],
  ["societe-generale", "Société Générale", ["societegenerale.fr"]],
  ["la-banque-postale", "La Banque Postale", ["labanquepostale.fr"]],
  ["caisse-epargne", "Caisse d'Épargne", ["caisse-epargne.fr"]],
  ["banque-populaire", "Banque Populaire", ["banquepopulaire.fr"]],
  ["lcl", "LCL", ["lcl.fr"]],
  ["credit-mutuel", "Crédit Mutuel", ["creditmutuel.fr"]],
  ["cic", "CIC", ["cic.fr"]],
  ["boursobank", "BoursoBank", ["boursobank.com"]],
];
// Numéros officiels : laissés vides tant qu'ils ne sont pas fournis et vérifiés par chaque banque.
for (const [slug, name, domains] of realBanks) {
  await pool.query("insert into banks (slug, name, partner, official_domains) values ($1, $2, false, $3)", [slug, name, domains]);
}
const horizon = await one<{ id: string }>(
  `insert into banks (slug, name, partner, official_phone, official_numbers, official_domains)
   values ('banque-horizon', 'Banque Horizon', true, '+33199000000', $1, '{banque-horizon.test}') returning id`,
  // Numéros PUBLICS (standard, service client) : ceux que les escrocs usurpent. Les lignes directes des conseillers n'y figurent pas.
  [["+33199000000", "+33199000100"]],
);
const postale = await one<{ id: string }>("select id from banks where slug = 'la-banque-postale'");

// Équipe SmartSecure (sans banque) puis équipe de Banque Horizon : responsable, conseiller, deux agences.
const password = await hashPassword("vigie-demo");
await pool.query(
  `insert into advisors (bank_id, role, email, name, agency, password_hash) values (null, 'superadmin', 'admin@smartsecure.test', 'Équipe SmartSecure', '', $1)`,
  [await hashPassword("smartsecure-admin")],
);
const lyon = await one<{ id: string }>("insert into agencies (bank_id, name) values ($1, 'Agence Lyon Bellecour') returning id", [horizon!.id]);
const paris = await one<{ id: string }>("insert into agencies (bank_id, name) values ($1, 'Agence Paris Opéra') returning id", [horizon!.id]);
await pool.query(
  `insert into advisors (bank_id, role, email, name, agency, agency_id, outbound_number, password_hash) values
   ($1, 'bank_admin', 'responsable@banque-horizon.test', 'Marc Lefèvre', 'Agence Paris Opéra', $2, '+33199001300', $4),
   ($1, 'advisor', 'conseiller@banque-horizon.test', 'Claire Martin', 'Agence Lyon Bellecour', $3, '+33199001234', $4)`,
  [horizon!.id, paris!.id, lyon!.id, password],
);
const advisor = await one<{ id: string }>("select id from advisors where email = 'conseiller@banque-horizon.test'");

const user = await one<{ id: string }>(
  `insert into users (phone, first_name, blocked_count, settings) values ('+33639980001', 'Jeanne', 4, '{"autoHangup": true, "notifyContactOnScam": true}') returning id`,
);
const userId = user!.id;
await pool.query("insert into user_banks (user_id, bank_id, status, customer_ref, linked_at) values ($1, $2, 'certified', 'HZ-104582', now())", [userId, horizon!.id]);
await pool.query("insert into user_banks (user_id, bank_id, status) values ($1, $2, 'basic')", [userId, postale!.id]);
await pool.query("insert into trusted_contacts (user_id, name, phone) values ($1, 'Sophie (ma fille)', '+33639980002')", [userId]);
await pool.query(
  `insert into mailboxes (user_id, provider, email, label, secret_enc, state, last_checked_at)
   values ($1, 'imap', 'jeanne.dupont@orange.fr', 'Orange', 'v1.demo.demo.demo', '{"presetId":"orange","demo":true}', now()),
          ($1, 'outlook', 'jeanne.d@hotmail.fr', 'Outlook', 'v1.demo.demo.demo', '{"demo":true}', now())`,
  [userId],
);
// Boîtes de démonstration (state.demo) : affichées dans l'app, ignorées par les connecteurs.

// Âge des domaines pré-rempli : la démo ne dépend pas du réseau.
await pool.query(
  `insert into domain_intel (domain, registered_at) values
   ('ameli-remboursement.top', now() - interval '3 days'),
   ('chrono-suivi-colis.com', now() - interval '6 days'),
   ('labanquepostale.fr', now() - interval '9000 days')`,
);

const ago = (min: number) => new Date(Date.now() - min * 60_000);
const demo = [
  {
    input: {
      source: "mail" as const,
      fromName: "Assurance Maladie",
      fromAddress: "remboursement@ameli-sante-info.com",
      subject: "Remboursement en attente : 148,20 €",
      text: "Madame, vous avez droit à un remboursement de 148,20 €. Pour le recevoir, confirmez vos coordonnées bancaires sous 48h : https://ameli-remboursement.top/dossier",
      receivedAt: ago(12),
    },
    origin: "jeanne.dupont@orange.fr",
  },
  {
    input: {
      source: "sms" as const,
      senderId: "+33756123478",
      text: "Chronopost : votre colis n'a pas pu etre livre. Reprogrammez la livraison (frais 1,49€) : chrono-suivi-colis.com/fr",
      receivedAt: ago(95),
    },
    origin: "Messages",
  },
  {
    input: {
      source: "whatsapp" as const,
      senderId: "+33698765432",
      text: "Coucou mamie c'est moi, mon téléphone est cassé, c'est mon nouveau numéro. Tu peux m'écrire ici ?",
      receivedAt: ago(60 * 26),
    },
    origin: "WhatsApp",
  },
  {
    input: {
      source: "mail" as const,
      fromName: "La Banque Postale",
      fromAddress: "info@labanquepostale.fr",
      subject: "Votre relevé de compte est disponible",
      headers: { authenticationResults: ["mx.orange.fr; spf=pass; dkim=pass; dmarc=pass"] },
      text: "Bonjour, votre relevé de compte d'octobre est disponible dans votre espace client : https://www.labanquepostale.fr/",
      receivedAt: ago(60 * 30),
    },
    origin: "jeanne.dupont@orange.fr",
  },
  {
    input: {
      source: "mail" as const,
      fromName: "BNP Paribas Service Sécurité",
      fromAddress: "securite.bnp.paribas@gmail.com",
      subject: "Opération suspecte sur votre compte",
      text: "Une opération suspecte a été détectée. Votre conseiller anti-fraude va vous contacter : communiquez-lui le code reçu par SMS pour sécuriser vos fonds.",
      receivedAt: ago(60 * 50),
    },
    origin: "jeanne.d@hotmail.fr",
  },
  {
    input: {
      source: "mail" as const,
      fromName: "Sophie Dupont",
      fromAddress: "sophie.dupont@gmail.com",
      subject: "Dimanche midi",
      text: "Coucou maman, on arrive vers midi dimanche avec les enfants. Bisous !",
      receivedAt: ago(60 * 72),
    },
    origin: "jeanne.dupont@orange.fr",
  },
];
for (const [i, d] of demo.entries()) {
  await processMessage({ userId, input: d.input, origin: d.origin, fingerprint: `demo-${i}`, deep: false, notify: false });
}

// Historique d'appels certifiés et de faux appels signalés (pour la console).
for (let day = 13; day >= 1; day--) {
  for (let k = 0; k < (day % 4) + 1; k++) {
    await pool.query(
      `insert into certified_calls (bank_id, advisor_id, user_id, reason, caller_number, status, created_at, expires_at, seen_at, confirmed_at, ended_at)
       values ($1, $2, $3, 'Point sur votre épargne', '+33199001234', 'ended', now() - ($4 || ' days')::interval, now() - ($4 || ' days')::interval + interval '30 minutes',
               now() - ($4 || ' days')::interval + interval '1 minute', case when $5 then now() - ($4 || ' days')::interval + interval '2 minutes' end,
               now() - ($4 || ' days')::interval + interval '12 minutes')`,
      [horizon!.id, advisor!.id, userId, String(day), k % 3 !== 2],
    );
  }
  if (day % 3 === 0) {
    await pool.query(
      `insert into call_reports (user_id, bank_id, number, action, created_at) values ($1, $2, $3, 'hung_up', now() - ($4 || ' days')::interval)`,
      [userId, horizon!.id, day % 2 ? "+33199000000" : "+33639985555", String(day)],
    );
  }
}
await pool.query("insert into reported_numbers (number, reports) values ('+33639985555', 14), ('+33199009999', 6)");

// ───────────── Console v2 : clients fictifs de Banque Horizon, appels, notes, signalements, invitations, journal ─────────────
const admin = await one<{ id: string }>("select id from advisors where email = 'responsable@banque-horizon.test'");
await pool.query("update user_banks set referent_id = $2 where user_id = $1 and bank_id = $3", [userId, advisor!.id, horizon!.id]);
const cohort: Array<{ name: string; phone: string; ref: string; status: "certified" | "pending"; by: string; linkedDaysAgo: number }> = [
  { name: "Marcel", phone: "+33639980011", ref: "HZ-104611", status: "certified", by: advisor!.id, linkedDaysAgo: 40 },
  { name: "Odette", phone: "+33639980012", ref: "HZ-104612", status: "certified", by: advisor!.id, linkedDaysAgo: 33 },
  { name: "Paulette", phone: "+33639980013", ref: "HZ-104613", status: "certified", by: admin!.id, linkedDaysAgo: 21 },
  { name: "Gérard", phone: "+33639980014", ref: "HZ-104614", status: "certified", by: admin!.id, linkedDaysAgo: 18 },
  { name: "Simone", phone: "+33639980015", ref: "HZ-104615", status: "certified", by: advisor!.id, linkedDaysAgo: 12 },
  { name: "Lucien", phone: "+33639980016", ref: "HZ-104616", status: "certified", by: advisor!.id, linkedDaysAgo: 9 },
  { name: "Yvette", phone: "+33639980017", ref: "HZ-104617", status: "certified", by: admin!.id, linkedDaysAgo: 5 },
  { name: "Robert", phone: "+33639980018", ref: "HZ-104618", status: "pending", by: advisor!.id, linkedDaysAgo: 0 },
  { name: "Denise", phone: "+33639980019", ref: "HZ-104619", status: "certified", by: advisor!.id, linkedDaysAgo: 0 },
];
const ids: Record<string, string> = { Jeanne: userId };
for (const c of cohort) {
  const u = await one<{ id: string }>("insert into users (phone, first_name) values ($1, $2) returning id", [c.phone, c.name]);
  ids[c.name] = u!.id;
  await pool.query(
    `insert into user_banks (user_id, bank_id, status, customer_ref, linked_at, referent_id, created_at)
     values ($1, $2, $3, $4, case when $3 = 'certified' then now() - ($5 || ' days')::interval end, $6, now() - ($5 || ' days')::interval)`,
    [u!.id, horizon!.id, c.status, c.ref, String(c.linkedDaysAgo), c.by],
  );
}

const call = (who: string, by: string, reason: string, status: string, minAgo: number, confirmed: boolean, durationMin = 12) =>
  pool.query(
    `insert into certified_calls (bank_id, advisor_id, user_id, reason, caller_number, status, created_at, expires_at, seen_at, confirmed_at, ended_at)
     values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval, now() - ($7 || ' minutes')::interval + interval '10 minutes',
             now() - ($7 || ' minutes')::interval + interval '1 minute',
             case when $8::boolean then now() - ($7 || ' minutes')::interval + interval '2 minutes' end,
             case when $6 in ('ended', 'rejected') then now() - ($7 || ' minutes')::interval + ($9 || ' minutes')::interval end)`,
    [horizon!.id, by, ids[who], reason, by === admin!.id ? "+33199001300" : "+33199001234", status, String(minAgo), confirmed, String(durationMin)],
  );
await call("Marcel", advisor!.id, "Renouvellement de votre carte bancaire", "seen", 3, false);
await call("Odette", advisor!.id, "Point sur votre épargne", "confirmed", 140, true);
await call("Gérard", admin!.id, "Suivi de votre dossier de prêt", "ended", 200, true);
await call("Paulette", admin!.id, "Rendez-vous annuel", "rejected", 60 * 26, false, 3);
await call("Simone", advisor!.id, "Point sur votre épargne", "ended", 60 * 30, true);
await call("Lucien", advisor!.id, "Renouvellement de votre carte bancaire", "announced", 60 * 52, false);
await call("Yvette", admin!.id, "Suivi de votre dossier de prêt", "ended", 60 * 24 * 3, true);
await call("Odette", advisor!.id, "Rendez-vous annuel", "ended", 60 * 24 * 6, true);
await call("Marcel", advisor!.id, "Point sur votre épargne", "ended", 60 * 24 * 9, true);

for (const [who, num, daysAgo] of [["Paulette", "+33199000000", 1], ["Lucien", "+33639985555", 2], ["Marcel", "+33199000100", 4]] as const) {
  await pool.query("insert into call_reports (user_id, bank_id, number, action, created_at) values ($1, $2, $3, 'hung_up', now() - ($4 || ' days')::interval)", [ids[who], horizon!.id, num, String(daysAgo)]);
}

const notes: Array<[string, string, string, string, number]> = [
  ["Marcel", advisor!.id, "Claire Martin", "Préfère être appelé en fin de matinée. Sa fille l’aide avec l’application.", 60 * 24 * 8],
  ["Marcel", admin!.id, "Marc Lefèvre", "A signalé un faux appel début de mois : le rappeler pour faire le point.", 60 * 24 * 3],
  ["Odette", advisor!.id, "Claire Martin", "Rendez-vous en agence prévu pour renouveler sa carte.", 60 * 24 * 5],
  ["Paulette", admin!.id, "Marc Lefèvre", "A refusé l’annonce d’appel : vérifier qu’elle a bien compris le principe.", 60 * 24],
  ["Gérard", advisor!.id, "Claire Martin", "Dossier de prêt en cours, pièces attendues.", 60 * 48],
];
for (const [who, authorId, authorName, body, minAgo] of notes) {
  await pool.query("insert into client_notes (bank_id, user_id, author_id, author_name, body, created_at) values ($1, $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)", [horizon!.id, ids[who], authorId, authorName, body, String(minAgo)]);
}

const invite = (by: string, phone: string, ref: string | null, minAgo: number, used: string | null, cancelled: boolean) =>
  pool.query(
    `insert into client_invites (bank_id, advisor_id, code_hash, token_hash, customer_ref, client_phone, created_at, expires_at, used_at, used_by, cancelled_at)
     values ($1, $2, $3, $4, $5, $6, now() - ($7 || ' minutes')::interval, now() - ($7 || ' minutes')::interval + interval '15 minutes',
             case when $8::uuid is not null then now() - ($7 || ' minutes')::interval + interval '4 minutes' end, $8,
             case when $9::boolean then now() - ($7 || ' minutes')::interval + interval '2 minutes' end)`,
    [horizon!.id, by, sha256(`seed:${randomToken(8)}`), sha256(randomToken(8)), ref, phone, String(minAgo), used, cancelled],
  );
await invite(advisor!.id, "+33639980021", "HZ-104620", 4, null, false);
await invite(advisor!.id, "+33639980019", "HZ-104619", 60 * 3, ids.Denise!, false);
await invite(advisor!.id, "+33639980022", null, 60 * 48, null, false);
await invite(admin!.id, "+33639980023", "HZ-104621", 60 * 26, null, true);

// Activation en attente : client fictif qui n’a pas encore appuyé sur le lien du SMS (le lien réel n’est connu de personne).
await pool.query(
  `insert into client_activations (bank_id, advisor_id, phone, first_name, customer_ref, token_hash, expires_at, created_at, last_sent_at)
   values ($1, $2, $3, $4, $5, $6, now() + interval '48 hours', now() - interval '24 hours', now() - interval '24 hours')`,
  [horizon!.id, advisor!.id, "+33639980031", "Colette", "HZ-104631", sha256(`seed-activation:${randomToken(8)}`)],
);

const ev = (minAgo: number, actorId: string | null, actorName: string, action: string, type: string | null, targetId: string | null, label: string | null, meta: object = {}) =>
  pool.query(
    `insert into audit_events (bank_id, actor_id, actor_name, action, target_type, target_id, target_label, meta, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now() - ($9 || ' minutes')::interval)`,
    [horizon!.id, actorId, actorName, action, type, targetId, label, JSON.stringify(meta), String(minAgo)],
  );
const refOf = (who: string) => cohort.find((c) => c.name === who)?.ref ?? "HZ-104582";
const label = (who: string) => `${who} (${refOf(who)})`;
await ev(60 * 24 * 40, admin!.id, "Marc Lefèvre", "staff.created", "staff", advisor!.id, "Claire Martin", { role: "advisor" });
await ev(60 * 24 * 40, admin!.id, "Marc Lefèvre", "staff.line_changed", "staff", advisor!.id, "Claire Martin", { declared: true });
await ev(60 * 24 * 30, admin!.id, "Marc Lefèvre", "bank.numbers_updated", "bank", horizon!.id, "Banque Horizon", { numbers: 2 });
for (const [who, daysAgo] of [["Marcel", 40], ["Odette", 33], ["Paulette", 21], ["Gérard", 18]] as const) {
  await ev(60 * 24 * daysAgo + 5, advisor!.id, "Claire Martin", "invite.created", "invite", null, refOf(who));
  await ev(60 * 24 * daysAgo, null, "Le client", "invite.used", "client", ids[who]!, label(who), { advisor: "Claire Martin" });
}
for (const [who, minAgo, by, name] of [["Odette", 140, advisor!.id, "Claire Martin"], ["Gérard", 200, admin!.id, "Marc Lefèvre"], ["Marcel", 3, advisor!.id, "Claire Martin"]] as const) {
  await ev(minAgo, by, name, "call.announced", "client", ids[who]!, label(who));
}
await ev(190, admin!.id, "Marc Lefèvre", "call.ended", "client", ids.Gérard!, label("Gérard"));
await ev(60 * 24 * 8, advisor!.id, "Claire Martin", "note.created", "client", ids.Marcel!, label("Marcel"));
await ev(60 * 24 * 3, admin!.id, "Marc Lefèvre", "note.created", "client", ids.Marcel!, label("Marcel"));
await ev(60 * 24, admin!.id, "Marc Lefèvre", "note.created", "client", ids.Paulette!, label("Paulette"));
await ev(60 * 24 * 12, advisor!.id, "Claire Martin", "client.linked", "client", ids.Simone!, label("Simone"));
await ev(4, advisor!.id, "Claire Martin", "invite.created", "invite", null, "HZ-104620");
await ev(60 * 26, admin!.id, "Marc Lefèvre", "invite.created", "invite", null, "HZ-104621");
await ev(60 * 26 - 2, admin!.id, "Marc Lefèvre", "invite.cancelled", "invite", null, "HZ-104621");
await ev(60 * 5, admin!.id, "Marc Lefèvre", "auth.login", null, null, null);
await ev(60 * 3, advisor!.id, "Claire Martin", "auth.login", null, null, null);

console.log("Démo prête.");
console.log("  App : téléphone 06 39 98 00 01, code = DEV_FIXED_OTP");
console.log("  Console conseiller : conseiller@banque-horizon.test / vigie-demo");
console.log("  Console responsable : responsable@banque-horizon.test / vigie-demo");
console.log("  Console superadmin : admin@smartsecure.test / smartsecure-admin");
await pool.end();
