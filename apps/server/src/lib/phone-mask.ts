import { formatPhone } from "@vigie/shared";

/** « 06 39 •• •• 01 » : garde le début et la fin, masque le milieu. Les numéros non français sont masqués plus largement. */
export function maskPhone(e164: string): string {
  const f = formatPhone(e164);
  if (/^\d\d( \d\d){4}$/.test(f)) return `${f.slice(0, 5)} •• •• ${f.slice(-2)}`;
  return `•••• ${e164.slice(-2)}`;
}

/** Téléphone affiché selon le rôle : complet pour le responsable, partiellement masqué pour un conseiller. */
export const phoneFor = (role: string, e164: string): string => (role === "bank_admin" ? formatPhone(e164) : maskPhone(e164));
