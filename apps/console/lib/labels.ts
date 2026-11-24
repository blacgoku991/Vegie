import type { AuditCategory, AuditEvent, IconName, Tone } from "@vigie/shared";

const labels: Record<string, string> = {
  "auth.login": "Connexion",
  "call.announced": "Appel annoncé",
  "call.ended": "Annonce terminée",
  "invite.created": "Invitation créée",
  "invite.used": "Invitation utilisée",
  "invite.cancelled": "Invitation annulée",
  "client.linked": "Client relié",
  "client.unlinked": "Client dissocié",
  "note.created": "Note ajoutée",
  "note.deleted": "Note supprimée",
  "staff.created": "Compte créé",
  "staff.updated": "Compte modifié",
  "staff.deactivated": "Compte désactivé",
  "staff.reactivated": "Compte réactivé",
  "staff.line_changed": "Ligne directe modifiée",
  "staff.activation_link": "Lien d’activation émis",
  "agency.created": "Agence créée",
  "agency.renamed": "Agence renommée",
  "agency.deleted": "Agence supprimée",
  "bank.numbers_updated": "Numéros officiels modifiés",
};

export const auditLabel = (action: string) => labels[action] ?? action;

export const auditCategories: Array<{ id: AuditCategory; label: string }> = [
  { id: "auth", label: "Connexions" },
  { id: "call", label: "Appels" },
  { id: "invite", label: "Invitations" },
  { id: "client", label: "Clients" },
  { id: "note", label: "Notes" },
  { id: "staff", label: "Équipe" },
  { id: "settings", label: "Réglages" },
];

const looks: Record<string, { icon: IconName; tone: Tone }> = {
  auth: { icon: "user", tone: "neutral" },
  call: { icon: "phone", tone: "neutral" },
  invite: { icon: "mail", tone: "neutral" },
  client: { icon: "check", tone: "positive" },
  note: { icon: "text", tone: "neutral" },
  staff: { icon: "user", tone: "warning" },
  agency: { icon: "bank", tone: "neutral" },
  bank: { icon: "shield", tone: "warning" },
};

export function auditLook(action: string): { icon: IconName; tone: Tone } {
  if (action === "client.unlinked" || action === "invite.cancelled" || action === "staff.deactivated") return { icon: "close", tone: "danger" };
  return looks[action.split(".")[0]!] ?? { icon: "clock", tone: "neutral" };
}

/** Détail lisible des métadonnées non sensibles. */
export function auditDetail(e: AuditEvent): string {
  const m = e.meta;
  switch (e.action) {
    case "invite.used": return m.advisor ? `Invité par ${m.advisor}` : "";
    case "staff.created": return m.role === "bank_admin" ? "Rôle responsable" : "Rôle conseiller";
    case "staff.updated": return [m.role === "bank_admin" ? "Responsable" : "Conseiller", m.agency].filter(Boolean).join(" · ");
    case "staff.line_changed": return m.declared ? "Ligne directe déclarée" : "Ligne directe retirée";
    case "bank.numbers_updated": return m.numbers != null ? `${m.numbers} numéro${Number(m.numbers) > 1 ? "s" : ""} officiel${Number(m.numbers) > 1 ? "s" : ""}` : "";
    default: return "";
  }
}
