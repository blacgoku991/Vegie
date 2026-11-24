const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")} h ${String(d.getMinutes()).padStart(2, "0")}`;

/** « à l'instant », « il y a 12 min », « aujourd'hui à 9 h 05 », « hier à 18 h 30 », « lundi 22 novembre ». */
export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (sameDay(d, now)) return `aujourd'hui à ${hhmm(d)}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `hier à ${hhmm(d)}`;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

/** Intitulé de groupe pour l'historique. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, now)) return "Aujourd'hui";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Hier";
  const label = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const sourceLabel: Record<string, string> = {
  mail: "Mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  messaging: "Message",
  call: "Appel",
  share: "Message partagé",
};

export const sourceIcon = { mail: "mail", sms: "message", whatsapp: "message", messaging: "message", call: "phone", share: "share" } as const;

/** Saisie d'un numéro français groupée par paires (« 06 39 98 00 01 ») ; un numéro international (+…) est laissé tel quel. */
export function groupPhoneInput(raw: string): string {
  if (raw.trim().startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ");
}
