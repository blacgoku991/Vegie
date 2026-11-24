import { normalizeText } from "./brands.ts";
import type { Finding } from "./types.ts";

/**
 * Règles rapides sur le texte (sans IA) : elles fonctionnent hors ligne, en quelques
 * millisecondes, et servent de filet de sécurité si l'IA est indisponible.
 */
interface Rule {
  id: string;
  pattern: RegExp;
  weight: number;
  reason: string;
}

const rules: Rule[] = [
  {
    id: "card",
    pattern: /(numero de (votre )?carte|cryptogramme|code de securite (de|au dos)|date d'expiration de (votre )?carte|coordonnees bancaires)/,
    weight: 45,
    reason: "Le message vous demande vos informations de carte bancaire.",
  },
  {
    id: "code",
    // Demander un code est le signe le plus sûr : aucun organisme ne le fait.
    // (Les vrais SMS de code disent « ne le communiquez à personne » : exclus.)
    pattern: /(?<!\bne )(communiquez|donnez|transmettez|indiquez|envoyez|dictez|repondez avec)(?![^.]{0,12}(jamais|a personne))[- ]?(nous|moi|lui)?[^.]{0,25}\bcode|code (recu|que vous allez recevoir) par sms[^.]{0,40}(communiquer|donner|transmettre|indiquer)/,
    weight: 60,
    reason: "Le message vous demande un code de confirmation. Ne le donnez jamais.",
  },
  {
    id: "credentials",
    pattern: /(identifiant(s)? et (votre )?mot de passe|confirmer (vos|votre) (identifiants|mot de passe)|mettre a jour vos (informations|coordonnees|donnees))/,
    weight: 30,
    reason: "Le message vous demande de confirmer vos identifiants.",
  },
  {
    id: "fee",
    pattern: /(frais (de (livraison|reexpedition|douane|port|dossier|traitement))|(reglez|payez|regler|payer) [^.]{0,40}\b[0-4][,.]\d{2} ?(€|eur))/,
    weight: 35,
    reason: "Le message réclame de petits frais à payer en ligne, une technique d'arnaque classique.",
  },
  {
    id: "urgency",
    pattern: /(sous 24 ?h|sous 48 ?h|immediatement|dernier (rappel|avis|delai)|sans reponse de votre part|dans les plus brefs delais|action requise|urgent)/,
    weight: 15,
    reason: "Le message vous presse d'agir vite.",
  },
  {
    id: "threat",
    pattern: /(compte (sera |a ete |est )?(suspendu|bloque|cloture|desactive|restreint)|majoration|poursuites|huissier|penalite|amende (impayee|majoree)|fourriere)/,
    weight: 25,
    reason: "Le message vous menace (blocage, amende, poursuites) pour vous faire agir sans réfléchir.",
  },
  {
    id: "too-good",
    pattern: /(vous avez gagne|remboursement (de|d'un montant)|carte cadeau|gagnant|heritage|investissement garanti|rendement garanti)/,
    weight: 20,
    reason: "Le message promet de l'argent ou un cadeau.",
  },
  {
    id: "fraud-advisor",
    pattern: /(conseiller (anti-?fraude|securite)|service (fraude|securite) (de votre banque|bancaire)|operation suspecte sur votre compte|securiser (vos fonds|votre compte|votre argent))/,
    weight: 35,
    reason: "Le message parle d'une « fraude » sur votre compte : c'est le scénario du faux conseiller bancaire.",
  },
  {
    id: "new-number",
    pattern: /((maman|papa|mamie|papi|mamy|papy)[^.]{0,80}(nouveau (numero|telephone)|telephone (est )?(casse|perdu))|c'est (moi|ton fils|ta fille)[^.]{0,60}nouveau numero)/,
    weight: 45,
    reason: "Quelqu'un se fait passer pour un proche avec un « nouveau numéro » : appelez votre proche sur son numéro habituel.",
  },
  {
    id: "transfer",
    pattern: /(faire un virement|virement (urgent|immediat)|mandat cash|coupon(s)? (pcs|transcash|neosurf)|recharge (pcs|transcash|neosurf)|cartes? (google play|itunes|steam) )/,
    weight: 40,
    reason: "Le message demande un virement ou des coupons de paiement.",
  },
  {
    id: "cpf",
    pattern: /(droits? (cpf|formation) (vont|va) (expirer|etre perdus)|solde cpf)/,
    weight: 35,
    reason: "Le message parle de vos droits à la formation qui vont « expirer » : c'est une arnaque connue.",
  },
];

export function textFindings(subject: string | null | undefined, text: string): Finding[] {
  const haystack = normalizeText(`${subject ?? ""}\n${text}`).replace(/\s+/g, " ");
  const out: Finding[] = [];
  for (const rule of rules) {
    if (rule.pattern.test(haystack)) {
      out.push({ check: "text", level: rule.weight >= 30 ? "danger" : "warning", weight: rule.weight, reason: rule.reason });
    }
  }
  return out;
}
