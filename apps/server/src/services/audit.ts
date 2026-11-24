import { one, pool, type Queryable } from "../db/pool.ts";

export type AuditAction =
  | "auth.login"
  | "call.announced"
  | "call.ended"
  | "invite.created"
  | "invite.used"
  | "invite.cancelled"
  | "invite.activation_created"
  | "invite.activation_resent"
  | "invite.activation_cancelled"
  | "invite.activation_used"
  | "client.linked"
  | "client.unlinked"
  | "note.created"
  | "note.deleted"
  | "staff.created"
  | "staff.updated"
  | "staff.deactivated"
  | "staff.reactivated"
  | "staff.line_changed"
  | "staff.activation_link"
  | "agency.created"
  | "agency.renamed"
  | "agency.deleted"
  | "bank.numbers_updated";

export interface AuditInput {
  bankId: string;
  actor: { id: string | null; name: string } | null;
  action: AuditAction;
  target?: { type: "client" | "call" | "invite" | "staff" | "agency" | "bank"; id?: string | null; label?: string | null };
  /** Valeurs simples et non sensibles uniquement : jamais de numéro de téléphone, de code ou de texte libre du client. */
  meta?: Record<string, string | number | boolean | null>;
}

/** Enregistre un événement. À appeler dans la même transaction que l'action quand c'est possible. */
export async function audit(input: AuditInput, db: Queryable = pool): Promise<void> {
  await db.query(
    `insert into audit_events (bank_id, actor_id, actor_name, action, target_type, target_id, target_label, meta)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.bankId, input.actor?.id ?? null, input.actor?.name ?? "Système", input.action, input.target?.type ?? null, input.target?.id ?? null, input.target?.label ?? null, JSON.stringify(input.meta ?? {})],
  );
}

/** Libellé d'un client pour le journal : prénom et référence, jamais le téléphone. */
export async function clientLabel(bankId: string, userId: string, db: Queryable = pool): Promise<string> {
  const r = await one<{ first_name: string | null; customer_ref: string | null }>(
    `select u.first_name, ub.customer_ref from users u left join user_banks ub on ub.user_id = u.id and ub.bank_id = $2 where u.id = $1`,
    [userId, bankId], db,
  );
  return [r?.first_name ?? "Client", r?.customer_ref ? `(${r.customer_ref})` : ""].filter(Boolean).join(" ");
}
