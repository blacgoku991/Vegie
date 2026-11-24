import { test } from "node:test";
import assert from "node:assert/strict";
import { lookalikeBrand, findBrandIn, registrableDomain } from "./brands.ts";
import { extractLinks, staticLinkFindings } from "./links.ts";
import { analyzeSender, parseAuthResults } from "./sender.ts";
import { textFindings } from "./text-rules.ts";
import { mergeWithAi, scoreFindings } from "./verdict.ts";
import { redact } from "./ai.ts";
import { analyze, checksFor } from "./analyze.ts";
import { incompleteCaution, verdictMeta, verdicts } from "@vigie/shared";
import type { MessageInput } from "./types.ts";

/** Analyse « hors ligne » (sans réseau ni IA) : ce que Vigie sait décider instantanément. */
function quick(input: Partial<MessageInput> & { text: string }) {
  const msg: MessageInput = { source: "mail", receivedAt: new Date(), ...input };
  const links = extractLinks(msg.text, msg.html);
  const sender = analyzeSender(msg, { hasLinks: links.length > 0 });
  const findings = [...sender.findings, ...staticLinkFindings(links, sender.claimedBrand), ...textFindings(msg.subject, msg.text)];
  return { ...scoreFindings(findings), findings, sender };
}

test("faux remboursement Ameli → arnaque", () => {
  const r = quick({
    fromName: "Assurance Maladie",
    fromAddress: "remboursement@ameli-sante-info.com",
    subject: "Remboursement en attente",
    text: "Vous avez droit à un remboursement de 148,20 €. Confirmez vos coordonnées bancaires sous 48h : https://ameli-remb.top/dossier",
  });
  assert.equal(r.verdict, "scam");
  assert.match(r.findings.find((f) => f.check === "sender")!.reason, /imite/);
});

test("newsletter authentique de La Banque Postale → sûr", () => {
  const r = quick({
    fromName: "La Banque Postale",
    fromAddress: "info@labanquepostale.fr",
    subject: "Découvrez notre nouvelle application",
    headers: { authenticationResults: ["mx.orange.fr; spf=pass smtp.mailfrom=labanquepostale.fr; dkim=pass; dmarc=pass"] },
    text: "Bonjour, découvrez la nouvelle version de notre application : https://www.labanquepostale.fr/appli",
  });
  assert.equal(r.verdict, "safe");
  assert.equal(r.sender.verifiedOfficial, true);
});

test("adresse officielle mais DMARC en échec (usurpation) → arnaque", () => {
  const r = quick({
    fromName: "Crédit Agricole",
    fromAddress: "alerte@credit-agricole.fr",
    headers: { authenticationResults: ["mx.free.fr; spf=fail; dkim=none; dmarc=fail"] },
    text: "Votre compte sera suspendu.",
  });
  assert.equal(r.verdict, "scam");
});

test("SMS colis avec petits frais depuis un portable → arnaque", () => {
  const r = quick({
    source: "sms",
    senderId: "+33612345678",
    text: "Colissimo : votre colis est en attente. Reglez les frais de reexpedition (1,99€) : colis-suivi-fr.com/abc",
  });
  assert.equal(r.verdict, "scam");
});

test("mail d'un ami qui parle de La Poste → sûr", () => {
  const r = quick({
    fromName: "Jacques Martin",
    fromAddress: "jacques.martin@gmail.com",
    subject: "Photos du week-end",
    text: "Coucou ! Je t'ai envoyé les photos par La Poste hier, tu devrais les recevoir lundi. Bises",
  });
  assert.equal(r.verdict, "safe");
});

test("arnaque « Coucou maman, nouveau numéro » → au moins douteux", () => {
  const r = quick({ source: "whatsapp", senderId: "+33698765432", text: "Coucou maman c'est moi, mon téléphone est cassé, c'est mon nouveau numéro. Tu peux m'aider ?" });
  assert.notEqual(r.verdict, "safe");
});

test("faux conseiller bancaire demandant un code → arnaque", () => {
  const r = quick({
    source: "sms",
    senderId: "+33756781234",
    text: "BNP Paribas : opération suspecte sur votre compte. Votre conseiller anti-fraude va vous appeler, communiquez-nous le code reçu par SMS pour sécuriser vos fonds.",
  });
  assert.equal(r.verdict, "scam");
});

test("lien maquillé : le texte affiche un site, le lien en ouvre un autre", () => {
  const links = extractLinks("", '<a href="https://secure-login.xyz/a">www.impots.gouv.fr</a>');
  const f = staticLinkFindings(links, null);
  assert.ok(f.some((x) => x.level === "danger" && /affiche/.test(x.reason)));
});

test("détection des domaines sosies sans faux positifs évidents", () => {
  assert.equal(lookalikeBrand("credit-agricoie.fr")?.id, "credit-agricole");
  assert.equal(lookalikeBrand("arneli.fr")?.id, "ameli");
  assert.equal(lookalikeBrand("paypa1.com")?.id, "paypal");
  assert.equal(lookalikeBrand("impots-gouv-remboursement.com")?.id, "impots");
  assert.equal(lookalikeBrand("www.ameli.fr"), null);
  assert.equal(lookalikeBrand("ca-paris.fr"), null);
  assert.equal(lookalikeBrand("amelie.fr"), null);
  assert.equal(lookalikeBrand("pineapple-shop.com"), null);
  assert.equal(lookalikeBrand("le-cafe-du-coin.fr"), null);
  assert.equal(registrableDomain("www.impots.gouv.fr"), "impots.gouv.fr");
});

test("reconnaissance des marques dans un nom d'expéditeur", () => {
  assert.equal(findBrandIn("Service Client AMELI")?.id, "ameli");
  assert.equal(findBrandIn("Crédit Agricole Alpes")?.id, "credit-agricole");
  assert.equal(findBrandIn("Jean Dupont"), null);
});

test("extraction des liens SMS écrits sans https", () => {
  const l = extractLinks("Votre colis : suivi-colis.info/xyz ou https://bit.ly/3abc. Contact : moi@exemple.fr");
  assert.deepEqual(l.map((x) => x.host).sort(), ["bit.ly", "suivi-colis.info"]);
});

test("lecture des résultats d'authentification", () => {
  assert.deepEqual(parseAuthResults(["mx.google.com; dkim=pass header.i=@x.fr; spf=softfail; dmarc=fail (p=reject)"]), {
    spf: "softfail",
    dkim: "pass",
    dmarc: "fail",
  });
});

test("l'IA peut aggraver un verdict mais jamais l'adoucir", () => {
  const ai = (verdict: "safe" | "suspicious" | "scam", confidence: "low" | "medium" | "high") => ({
    verdict, confidence, impersonated_brand: null, text_signals: [], site: null, explanation_fr: "",
  });
  assert.equal(mergeWithAi("scam", ai("safe", "high")), "scam");
  assert.equal(mergeWithAi("safe", ai("scam", "high")), "scam");
  assert.equal(mergeWithAi("safe", ai("scam", "low")), "suspicious");
  assert.equal(mergeWithAi("safe", null), "safe");
});

test("masquage des données sensibles avant envoi à l'IA", () => {
  const out = redact("Carte 4970 1012 3456 7890, IBAN FR76 3000 6000 0112 3456 7890 189, mail jean@orange.fr");
  assert.ok(!out.includes("4970 1012"));
  assert.ok(!out.includes("3000 6000"));
  assert.ok(out.includes("[adresse]@orange.fr"));
});

test("un vrai SMS de code de confirmation n'est pas une alerte", () => {
  const r = quick({ source: "sms", senderId: "BNPPARIBAS", text: "Votre code de confirmation est 482913. Ne le communiquez jamais, même à un conseiller." });
  assert.equal(r.verdict, "safe");
});

test("le verdict « sûr » ne promet rien : « Aucun signe d'arnaque détecté »", () => {
  assert.equal(verdicts.safe.label, "Aucun signe d'arnaque détecté");
  assert.equal(verdicts.safe.tone, "positive");
});

test("vérification incomplète : jamais de vert, même si le verdict est « sûr »", () => {
  const complete = verdictMeta("safe", false);
  const partial = verdictMeta("safe", true);
  assert.equal(complete.tone, "positive");
  assert.equal(partial.tone, "warning");
  assert.equal(partial.label, "Vérification incomplète");
  assert.match(incompleteCaution, /restez prudent/);
  // Une arnaque reste une arnaque.
  assert.equal(verdictMeta("scam", true).tone, "danger");
});

test("lien vers un site inconnu sans Web Risk ni visite possible : verdict « sûr » mais incomplet", async () => {
  const r = await analyze(
    { source: "mail", fromName: "Jacques Martin", fromAddress: "jacques.martin@gmail.com", text: "Voici le site de mon jardin : https://www.mon-jardin-bio.fr/", receivedAt: new Date() },
    { deep: false, budgetMs: 500 },
  );
  assert.equal(r.incomplete, true);
  assert.ok(r.missingChecks.length > 0);
  if (r.verdict === "safe") {
    assert.match(r.explanation, /Vérification incomplète : restez prudent/);
    assert.match(r.advice, /Ne cliquez sur aucun lien/);
  }
  const checks = checksFor(r, { hasSender: true, deep: false });
  assert.notEqual(checks.find((c) => c.key === "links")!.status, "ok");
});

test("message sans lien ni IA configurée : analyse complète", async () => {
  const r = await analyze(
    { source: "mail", fromName: "Jacques Martin", fromAddress: "jacques.martin@gmail.com", subject: "Photos", text: "Coucou ! Les photos arrivent lundi. Bises", receivedAt: new Date() },
    { deep: false, budgetMs: 500 },
  );
  assert.equal(r.verdict, "safe");
  assert.equal(r.incomplete, false);
  assert.equal(r.explanation, "Aucun signe d'arnaque détecté dans ce message.");
});
