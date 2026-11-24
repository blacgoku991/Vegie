import { randomInt } from "node:crypto";
import type { ClientInvite } from "@vigie/shared";
import { config } from "../config.ts";
import { one, tx } from "../db/pool.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { HttpError, type AdvisorCtx } from "../http/context.ts";
import { audit } from "./audit.ts";

export const INVITE_MINUTES = 15;
export const MAX_OPEN_INVITES = 20;

/** Crée une invitation (code à 6 chiffres haché, 15 min, usage unique) liée au numéro du client. */
export function createInvite(advisor: AdvisorCtx, clientPhone: string, customerRef: string | null): Promise<ClientInvite> {
  return tx(async db => {
    const staff = await one("select 1 from advisors where id = $1 and active for update", [advisor.id], db);
    if (!staff) throw new HttpError(403, "account_disabled", "Ce compte est désactivé.");
    const open = await one<{ n: number }>(
      "select count(*)::int as n from client_invites where advisor_id = $1 and used_at is null and cancelled_at is null and expires_at > now()", [advisor.id], db,
    );
    if (open && open.n >= MAX_OPEN_INVITES) throw new HttpError(429, "too_many_invites", "Trop d’invitations en cours. Attendez leur expiration avant d’en créer d’autres.");
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const codeHash = sha256(`invite:${code}`);
      await db.query("delete from client_invites where code_hash = $1 and used_at is null and expires_at <= now()", [codeHash]);
      const row = await one<{ id: string; expires_at: Date }>(
        `insert into client_invites (bank_id, advisor_id, code_hash, token_hash, customer_ref, client_phone, expires_at)
         values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' minutes')::interval)
         on conflict do nothing returning id, expires_at`,
        [advisor.bankId, advisor.id, codeHash, sha256(randomToken(24)), customerRef || null, clientPhone, String(INVITE_MINUTES)], db,
      );
      if (row) {
        await audit({ bankId: advisor.bankId, actor: advisor, action: "invite.created", target: { type: "invite", id: row.id, label: customerRef || null } }, db);
        return { id: row.id, code, link: `${config.INVITE_SCHEME}://join?code=${code}`, expiresAt: row.expires_at.toISOString() };
      }
    }
    throw new HttpError(503, "busy", "Impossible de générer un code. Réessayez.");
  });
}
