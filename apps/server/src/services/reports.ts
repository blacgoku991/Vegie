import type { FakeCallReport } from "@vigie/shared";
import { formatPhone } from "@vigie/shared";
import { many } from "../db/pool.ts";
import { maskPhone } from "../lib/phone-mask.ts";

/** Appels suspects signalés (le client a raccroché) au nom de la banque, éventuellement pour un seul client. */
export async function listReports(bankId: string, opts: { userId?: string; limit?: number } = {}): Promise<FakeCallReport[]> {
  const rows = await many<{ id: string; number: string | null; created_at: Date; action: FakeCallReport["action"]; first_name: string | null; phone: string; user_id: string; spoofed: boolean }>(
    `select r.id, r.number, r.created_at, r.action, u.first_name, u.phone, u.id as user_id,
            coalesce(r.number = any(b.official_numbers) or r.number = b.official_phone, false) as spoofed
     from call_reports r join users u on u.id = r.user_id join banks b on b.id = r.bank_id
     where r.bank_id = $1 and r.action = 'hung_up' and ($2::uuid is null or r.user_id = $2)
     order by r.created_at desc limit $3`,
    [bankId, opts.userId ?? null, opts.limit ?? 100],
  );
  return rows.map((r) => ({
    id: r.id,
    number: r.number ? formatPhone(r.number) : null,
    spoofedOfficial: r.spoofed,
    reportedAt: r.created_at.toISOString(),
    action: r.action,
    client: { firstName: r.first_name, phoneMasked: maskPhone(r.phone), userId: r.user_id },
  }));
}
