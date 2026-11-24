/**
 * Données de démonstration (développement uniquement).
 * - Une banque partenaire fictive, « Banque Horizon », et les grandes banques en protection de base.
 * - Les numéros de démo sont dans les plages réservées à la fiction par l'ARCEP (01 99 00…, 06 39 98…).
 * - Les alertes passent par le vrai moteur d'analyse.
 */
import { isProd } from "../config.ts";
import { hashPassword } from "../lib/crypto.ts";
import { processMessage } from "../services/alerts.ts";
import { migrate } from "./migrate.ts";
import { one, pool } from "./pool.ts";

if (isProd) throw new Error("Le jeu de démo ne doit jamais tourner en production.");

await migrate();
await pool.query(`truncate users, banks, advisors, sessions, push_tokens, user_banks, certified_calls, call_reports,
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
  [["+33199000000", "+33199001234", "+33199001235"]],
);
const postale = await one<{ id: string }>("select id from banks where slug = 'la-banque-postale'");

await pool.query(
  `insert into advisors (bank_id, email, name, agency, outbound_number, password_hash) values ($1, $2, $3, $4, $5, $6)`,
  [horizon!.id, "conseiller@banque-horizon.test", "Claire Martin", "Agence Lyon Bellecour", "+33199001234", await hashPassword("vigie-demo")],
);
const advisor = await one<{ id: string }>("select id from advisors limit 1");

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

console.log("Démo prête.");
console.log("  App : téléphone 06 39 98 00 01, code = DEV_FIXED_OTP");
console.log("  Console : conseiller@banque-horizon.test / vigie-demo");
await pool.end();
