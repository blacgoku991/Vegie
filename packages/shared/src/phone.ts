/**
 * Numéros de téléphone : normalisation E.164 (France par défaut) et affichage lisible.
 * Volontairement simple : Vigie ne traite que des numéros français et européens courants.
 */

export function normalizePhone(input: string, defaultCountry = "33"): string | null {
  const raw = input.trim();
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    // +33 0X… → on retire le 0 de trop, erreur de saisie fréquente.
    const fixed = rest.startsWith("330") ? "33" + rest.slice(3) : rest;
    return fixed.length >= 8 && fixed.length <= 15 ? "+" + fixed : null;
  }
  if (digits.startsWith("0") && digits.length === 10) return `+${defaultCountry}${digits.slice(1)}`;
  // Numéros courts (3 à 6 chiffres, ex. 3639) : gardés tels quels.
  if (/^\d{3,6}$/.test(digits)) return digits;
  return null;
}

/** +33612345678 → « 06 12 34 56 78 ». */
export function formatPhone(e164: string): string {
  if (e164.startsWith("+33") && e164.length === 12) {
    const national = "0" + e164.slice(3);
    return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  }
  return e164;
}
