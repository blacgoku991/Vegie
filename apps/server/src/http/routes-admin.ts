/**
 * Console multi-banques : activation de compte, équipe, agences, réglages de la banque, superadmin, invitations client.
 * Contrôle d'accès côté serveur uniquement : chaque route passe par requireAdvisor / requireBankAdmin / requireSuperadmin,
 * et toute requête SQL est filtrée par la banque de la session (jamais par un identifiant fourni par le client seul).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ActivationInfo, ActivationLink, AdminBank, Advisor, Agency, BankSettings, ClientInvite, StaffMember } from "@vigie/shared";
import { many, one, pool, tx } from "../db/pool.ts";
import { hashPassword, sha256 } from "../lib/crypto.ts";
import { audit } from "../services/audit.ts";
import { createInvite } from "../services/invites.ts";
import { MIN_PASSWORD, checkAgency, createStaff, createStaffInBank, issueActivation, listTeam, loadMember, loadStaff, ownedMember, outboundLine, parseNumber, staffDto } from "../services/staff.ts";
import { HttpError, createSession, notFound, requireAdvisor, requireBankAdmin, requireSuperadmin, setConsoleCookie } from "./context.ts";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const numbers = z.array(z.string()).max(30).transform((list) => {
  const out = new Set<string>();
  for (const raw of list) {
    const n = parseNumber(raw);
    if (n) out.add(n);
  }
  return [...out];
});

interface BankRow {
  id: string;
  slug: string;
  name: string;
  partner: boolean;
  official_phone: string | null;
  official_numbers: string[];
  staff: number;
  linked: number;
}

const bankAdminSelect = `
  select b.id, b.slug, b.name, b.partner, b.official_phone, b.official_numbers,
         (select count(*)::int from advisors a where a.bank_id = b.id) as staff,
         (select count(*)::int from user_banks ub where ub.bank_id = b.id and ub.status = 'certified') as linked
  from banks b`;

const toAdminBank = (b: BankRow): AdminBank => ({
  id: b.id,
  slug: b.slug,
  name: b.name,
  partner: b.partner,
  officialPhone: b.official_phone,
  officialNumbers: b.official_numbers,
  staff: b.staff,
  linkedClients: b.linked,
});

export async function adminRoutes(app: FastifyInstance) {
  // ───────────── Activation de compte (public, jeton à usage unique) ─────────────
  app.get<{ Querystring: { token?: string } }>("/console/activate", async (req): Promise<ActivationInfo> => {
    const token = z.string().min(20).max(200).parse(req.query.token);
    const row = await one<{ name: string; email: string; bank_name: string | null }>(
      `select a.name, a.email, b.name as bank_name from activation_tokens t join advisors a on a.id = t.advisor_id left join banks b on b.id = a.bank_id
       where t.token_hash = $1 and t.used_at is null and t.expires_at > now() and a.active`,
      [sha256(token)],
    );
    if (!row) throw new HttpError(404, "invalid_token", "Ce lien d'activation n'est plus valable. Demandez-en un nouveau à votre responsable.");
    return { name: row.name, email: row.email, bankName: row.bank_name ?? "SmartSecure" };
  });

  app.post("/console/activate", async (req, reply): Promise<Advisor> => {
    const body = z
      .object({
        token: z.string().min(20).max(200),
        password: z.string().min(MIN_PASSWORD, `Le mot de passe doit faire au moins ${MIN_PASSWORD} caractères.`).max(200),
      })
      .parse(req.body);
    const hash = await hashPassword(body.password);
    // Consommation atomique : un jeton ne sert qu'une fois, même si deux requêtes arrivent ensemble.
    const { advisorId, session } = await tx(async db => {
      const row = await one<{ advisor_id: string }>(
        `select t.advisor_id from activation_tokens t join advisors a on a.id = t.advisor_id
         where t.token_hash = $1 and a.active for update of a`,
        [sha256(body.token)], db,
      );
      const consumed = row && await one(
        "update activation_tokens set used_at = now() where token_hash = $1 and used_at is null and expires_at > now() returning 1",
        [sha256(body.token)], db,
      );
      if (!row || !consumed) throw new HttpError(400, "invalid_token", "Ce lien d’activation n’est plus valable. Demandez-en un nouveau à votre responsable.");
      await db.query("update advisors set password_hash = $2 where id = $1", [row.advisor_id, hash]);
      await db.query("delete from sessions where advisor_id = $1", [row.advisor_id]);
      return { advisorId: row.advisor_id, session: await createSession("advisor", row.advisor_id, 0.5, db) };
    });
    setConsoleCookie(reply, session);
    return staffDto(await loadStaff(advisorId));
  });

  // ───────────── Équipe de la banque (responsable) ─────────────
  app.get("/console/team", async (req): Promise<StaffMember[]> => listTeam((await requireBankAdmin(req)).bankId));

  app.post("/console/team", async (req): Promise<{ member: StaffMember; activation: ActivationLink }> => {
    const admin = await requireBankAdmin(req);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        email: emailSchema,
        role: z.enum(["advisor", "bank_admin"]),
        agencyId: z.string().uuid().nullish(),
        outboundNumber: z.string().nullish(),
      })
      .parse(req.body);
    const created = await createStaff(admin.bankId, body);
    await audit({ bankId: admin.bankId, actor: admin, action: "staff.created", target: { type: "staff", id: created.member.id, label: created.member.name }, meta: { role: body.role } });
    return created;
  });

  app.patch<{ Params: { id: string } }>("/console/team/:id", async (req): Promise<StaffMember> => {
    const admin = await requireBankAdmin(req);
    const target = await ownedMember(admin.bankId, req.params.id);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        role: z.enum(["advisor", "bank_admin"]).optional(),
        agencyId: z.string().uuid().nullable().optional(),
        outboundNumber: z.string().nullable().optional(),
      })
      .parse(req.body);
    if (body.role && body.role !== target.role && target.id === admin.id) {
      throw new HttpError(400, "self_role", "Vous ne pouvez pas modifier votre propre rôle.");
    }
    const sets: string[] = [];
    const params: unknown[] = [target.id];
    const set = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (body.name !== undefined) set("name", body.name);
    if (body.role !== undefined) set("role", body.role);
    if (body.agencyId !== undefined) {
      const ag = await checkAgency(admin.bankId, body.agencyId);
      set("agency_id", ag?.id ?? null);
      set("agency", ag?.name ?? "");
    }
    if (body.outboundNumber !== undefined) set("outbound_number", await outboundLine(admin.bankId, body.outboundNumber));
    if (sets.length) {
      const before = await loadMember(target.id);
      await pool.query(`update advisors set ${sets.join(", ")} where id = $1`, params);
      const after = await loadMember(target.id);
      const ref = { type: "staff" as const, id: target.id, label: after.name };
      if (body.outboundNumber !== undefined && before.outboundNumber !== after.outboundNumber) {
        await audit({ bankId: admin.bankId, actor: admin, action: "staff.line_changed", target: ref, meta: { declared: !!after.outboundNumber } });
      }
      if (body.name !== undefined || body.role !== undefined || body.agencyId !== undefined) {
        await audit({ bankId: admin.bankId, actor: admin, action: "staff.updated", target: ref, meta: { role: after.role, agency: after.agency } });
      }
    }
    return loadMember(target.id);
  });

  app.post<{ Params: { id: string } }>("/console/team/:id/deactivate", async (req): Promise<StaffMember> => {
    const admin = await requireBankAdmin(req);
    const target = await ownedMember(admin.bankId, req.params.id);
    if (target.id === admin.id) throw new HttpError(400, "self_deactivate", "Vous ne pouvez pas désactiver votre propre compte.");
    await tx(async (db) => {
      await db.query("update advisors set active = false where id = $1", [target.id]);
      await db.query("delete from sessions where advisor_id = $1", [target.id]);
      await db.query("delete from activation_tokens where advisor_id = $1", [target.id]);
      await db.query("update certified_calls set status = 'ended', ended_at = now() where advisor_id = $1 and status in ('announced', 'seen')", [target.id]);
      await db.query("delete from client_invites where advisor_id = $1 and used_at is null", [target.id]);
    });
    const member = await loadMember(target.id);
    await audit({ bankId: admin.bankId, actor: admin, action: "staff.deactivated", target: { type: "staff", id: target.id, label: member.name } });
    return member;
  });

  app.post<{ Params: { id: string } }>("/console/team/:id/reactivate", async (req): Promise<StaffMember> => {
    const admin = await requireBankAdmin(req);
    const target = await ownedMember(admin.bankId, req.params.id);
    await pool.query("update advisors set active = true where id = $1", [target.id]);
    const member = await loadMember(target.id);
    await audit({ bankId: admin.bankId, actor: admin, action: "staff.reactivated", target: { type: "staff", id: target.id, label: member.name } });
    return member;
  });

  /** Régénère un lien d'activation (ancien lien invalidé). Sert aussi à réinitialiser un mot de passe oublié. */
  app.post<{ Params: { id: string } }>("/console/team/:id/activation-link", async (req): Promise<ActivationLink> => {
    const admin = await requireBankAdmin(req);
    const target = await ownedMember(admin.bankId, req.params.id);
    if (!target.active) throw new HttpError(409, "inactive", "Réactivez d'abord ce compte.");
    const email = (await one<{ email: string }>("select email from advisors where id = $1", [target.id]))!.email;
    const link = await issueActivation(target.id, email);
    await audit({ bankId: admin.bankId, actor: admin, action: "staff.activation_link", target: { type: "staff", id: target.id, label: (await loadMember(target.id)).name } });
    return link;
  });

  // ───────────── Agences ─────────────
  const agencySelect = `select g.id, g.name, (select count(*)::int from advisors a where a.agency_id = g.id) as advisors from agencies g`;

  app.get("/console/agencies", async (req): Promise<Agency[]> => {
    const staff = await requireAdvisor(req);
    return many<Agency>(`${agencySelect} where g.bank_id = $1 order by g.name`, [staff.bankId]);
  });

  app.post("/console/agencies", async (req): Promise<Agency> => {
    const admin = await requireBankAdmin(req);
    const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const row = await one<{ id: string }>("insert into agencies (bank_id, name) values ($1, $2) on conflict do nothing returning id", [admin.bankId, name]);
    if (!row) throw new HttpError(409, "agency_exists", "Cette agence existe déjà.");
    await audit({ bankId: admin.bankId, actor: admin, action: "agency.created", target: { type: "agency", id: row.id, label: name } });
    return (await one<Agency>(`${agencySelect} where g.id = $1`, [row.id]))!;
  });

  app.patch<{ Params: { id: string } }>("/console/agencies/:id", async (req): Promise<Agency> => {
    const admin = await requireBankAdmin(req);
    const { name } = z.object({ name: z.string().trim().min(2).max(80) }).parse(req.body);
    const ag = await ownedAgency(admin.bankId, req.params.id);
    const clash = await one("select 1 from agencies where bank_id = $1 and name = $2 and id <> $3", [admin.bankId, name, ag.id]);
    if (clash) throw new HttpError(409, "agency_exists", "Cette agence existe déjà.");
    await pool.query("update agencies set name = $2 where id = $1", [ag.id, name]);
    await pool.query("update advisors set agency = $2 where agency_id = $1", [ag.id, name]);
    await audit({ bankId: admin.bankId, actor: admin, action: "agency.renamed", target: { type: "agency", id: ag.id, label: name } });
    return (await one<Agency>(`${agencySelect} where g.id = $1`, [ag.id]))!;
  });

  app.delete<{ Params: { id: string } }>("/console/agencies/:id", async (req) => {
    const admin = await requireBankAdmin(req);
    const ag = await ownedAgency(admin.bankId, req.params.id);
    await tx(async db => {
      await db.query("update advisors set agency_id = null, agency = '' where agency_id = $1", [ag.id]);
      await db.query("delete from agencies where id = $1", [ag.id]);
      await audit({ bankId: admin.bankId, actor: admin, action: "agency.deleted", target: { type: "agency", id: null, label: ag.name } }, db);
    });
    return { ok: true };
  });

  // ───────────── Réglages de la banque ─────────────
  const bankSettings = async (bankId: string): Promise<BankSettings> => {
    const b = await one<{ id: string; slug: string; name: string; official_phone: string | null; official_numbers: string[] }>(
      "select id, slug, name, official_phone, official_numbers from banks where id = $1",
      [bankId],
    );
    if (!b) throw notFound("Banque introuvable");
    return { id: b.id, slug: b.slug, name: b.name, officialPhone: b.official_phone, officialNumbers: b.official_numbers };
  };

  app.get("/console/bank", async (req): Promise<BankSettings> => bankSettings((await requireAdvisor(req)).bankId));

  app.patch("/console/bank", async (req): Promise<BankSettings> => {
    const admin = await requireBankAdmin(req);
    const body = z.object({ officialPhone: z.string().nullish(), officialNumbers: numbers.optional() }).parse(req.body);
    const declared = [...(body.officialNumbers ?? []), parseNumber(body.officialPhone)].filter((n): n is string => !!n);
    if (declared.length && await one("select 1 from banks where id <> $1 and (official_phone = any($2::text[]) or official_numbers && $2::text[])", [admin.bankId, declared]))
      throw new HttpError(409, "number_taken", "Un de ces numéros est déjà déclaré par une autre banque. Contactez SmartSecure si c'est une erreur.");
    await pool.query(`update banks set official_phone = case when $2 then $3 else official_phone end,
       official_numbers = coalesce($4::text[], official_numbers) where id = $1`,
      [admin.bankId, body.officialPhone !== undefined, parseNumber(body.officialPhone), body.officialNumbers ?? null]);
    await audit({ bankId: admin.bankId, actor: admin, action: "bank.numbers_updated", target: { type: "bank", id: admin.bankId, label: admin.bankName }, meta: { numbers: body.officialNumbers?.length ?? null } });
    return bankSettings(admin.bankId);
  });

  // ───────────── Superadmin : les banques ─────────────
  app.get("/console/admin/banks", async (req): Promise<AdminBank[]> => {
    await requireSuperadmin(req);
    return (await many<BankRow>(`${bankAdminSelect} order by b.partner desc, b.name`)).map(toAdminBank);
  });

  app.post("/console/admin/banks", async (req): Promise<{ bank: AdminBank; admin: StaffMember; activation: ActivationLink }> => {
    await requireSuperadmin(req);
    const body = z
      .object({
        name: z.string().trim().min(2).max(80),
        slug: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Identifiant : lettres minuscules, chiffres et tirets.")
          .max(60),
        officialNumbers: numbers.default([]),
        admin: z.object({ name: z.string().trim().min(2).max(80), email: emailSchema }),
      })
      .parse(req.body);
    if (body.officialNumbers.length && await one("select 1 from banks where official_phone = any($1::text[]) or official_numbers && $1::text[]", [body.officialNumbers]))
      throw new HttpError(409, "number_taken", "Un de ces numéros est déjà déclaré par une autre banque.");
    if (await one("select 1 from banks where slug = $1", [body.slug])) throw new HttpError(409, "slug_taken", "Cet identifiant de banque existe déjà.");
    if (await one("select 1 from advisors where email = $1", [body.admin.email])) throw new HttpError(409, "email_taken", "Impossible de créer ce compte avec cet e-mail.");
    return tx(async db => {
      const bank = await one<{ id: string }>(
        "insert into banks (slug, name, partner, official_numbers) values ($1, $2, true, $3) on conflict (slug) do nothing returning id",
        [body.slug, body.name, body.officialNumbers], db,
      );
      if (!bank) throw new HttpError(409, "slug_taken", "Cet identifiant de banque existe déjà.");
      const created = await createStaffInBank(bank.id, { ...body.admin, role: "bank_admin" }, db);
      const row = await one<BankRow>(`${bankAdminSelect} where b.id = $1`, [bank.id], db);
      return { bank: toAdminBank(row!), admin: created.member, activation: created.activation };
    });
  });

  /** Ajoute un responsable à une banque existante (ou en renouvelle l'accès). */
  app.post<{ Params: { id: string } }>("/console/admin/banks/:id/admins", async (req): Promise<{ admin: StaffMember; activation: ActivationLink }> => {
    await requireSuperadmin(req);
    const bankId = z.string().uuid().parse(req.params.id);
    if (!(await one("select 1 from banks where id = $1", [bankId]))) throw notFound("Banque introuvable");
    const body = z.object({ name: z.string().trim().min(2).max(80), email: emailSchema }).parse(req.body);
    const created = await createStaff(bankId, { ...body, role: "bank_admin" });
    return { admin: created.member, activation: created.activation };
  });

  // ───────────── Invitation client (conseiller ou responsable) ─────────────
  app.post("/console/invites", async (req): Promise<ClientInvite> => {
    const advisor = await requireAdvisor(req);
    const body = z
      .object({ customerRef: z.string().trim().max(40).nullish(), clientPhone: z.string().min(1, "Indiquez le numéro de téléphone du client.") })
      .parse(req.body ?? {});
    const clientPhone = parseNumber(body.clientPhone);
    if (!clientPhone?.startsWith("+")) throw new HttpError(400, "bad_number", "Indiquez le numéro de téléphone du client.");
    return createInvite(advisor, clientPhone, body.customerRef || null);
  });
}

async function ownedAgency(bankId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Agence introuvable");
  const ag = await one<{ id: string; bank_id: string; name: string }>("select id, bank_id, name from agencies where id = $1", [id]);
  if (!ag) throw notFound("Agence introuvable");
  if (ag.bank_id !== bankId) throw new HttpError(403, "forbidden", "Cette agence n'appartient pas à votre banque.");
  return ag;
}
