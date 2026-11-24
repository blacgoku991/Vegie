/**
 * Console v2 : tableau de bord, fiches clients, journal des appels, invitations, notes, journal d'activité.
 * RGPD : la banque ne voit que ce qui la concerne (lien, appels qu'elle a annoncés, signalements au nom de la banque,
 * ses propres notes). Jamais les alertes mail/SMS du client, ses proches ni ses autres banques.
 * Toute requête est filtrée par la banque de la session ; un identifiant d'une autre banque donne 404.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatPhone } from "@vigie/shared";
import type {
  AuditEvent, BankLinkStatus, CallListItem, CallStatus, ClientDetail, ClientInvite, ClientListItem, ClientNote, DashboardData, DashboardPeriod,
  InviteListItem, InviteStatus, Page,
} from "@vigie/shared";
import { many, one, tx } from "../db/pool.ts";
import { escapeLike } from "../lib/like.ts";
import { phoneFor } from "../lib/phone-mask.ts";
import { audit, clientLabel } from "../services/audit.ts";
import { createInvite } from "../services/invites.ts";
import { listReports } from "../services/reports.ts";
import { HttpError, notFound, requireAdvisor, requireBankAdmin, type AdvisorCtx } from "./context.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const uuidParam = (id: string, what: string) => {
  if (!UUID.test(id)) throw notFound(what);
  return id;
};

/** Construit un WHERE paramétré : `add("a = $?", v)` ajoute la valeur et numérote le paramètre. */
class Filter {
  params: unknown[];
  clauses: string[] = [];
  constructor(...init: unknown[]) {
    this.params = init;
  }
  add(sql: string, ...values: unknown[]) {
    let i = 0;
    this.clauses.push(sql.replace(/\$\?/g, () => {
      this.params.push(values[i++]);
      return `$${this.params.length}`;
    }));
  }
  get where() {
    return this.clauses.length ? ` and ${this.clauses.join(" and ")}` : "";
  }
}

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ───────────── Appels ─────────────
const effStatus = `case when c.status in ('announced','seen') and c.expires_at < now() then 'expired' else c.status end`;

interface CallRowX {
  id: string;
  user_id: string;
  first_name: string | null;
  phone: string;
  advisor_id: string;
  advisor_name: string;
  agency: string;
  reason: string;
  caller_number: string | null;
  status: CallStatus;
  created_at: Date;
  confirmed_at: Date | null;
  ended_at: Date | null;
  total: number;
}

const callCols = `
  select c.id, c.user_id, u.first_name, u.phone, c.advisor_id, a.name as advisor_name, coalesce(ag.name, a.agency, '') as agency,
         c.reason, c.caller_number, ${effStatus} as status, c.created_at, c.confirmed_at, c.ended_at, count(*) over()::int as total
  from certified_calls c join users u on u.id = c.user_id join advisors a on a.id = c.advisor_id left join agencies ag on ag.id = a.agency_id`;

const toCallItem = (r: CallRowX, role: string): CallListItem => ({
  id: r.id,
  client: { userId: r.user_id, firstName: r.first_name, phone: phoneFor(role, r.phone) },
  advisor: { id: r.advisor_id, name: r.advisor_name, agency: r.agency },
  reason: r.reason,
  callerNumber: r.caller_number ? formatPhone(r.caller_number) : null,
  status: r.status,
  createdAt: r.created_at.toISOString(),
  confirmedAt: r.confirmed_at?.toISOString() ?? null,
  endedAt: r.ended_at?.toISOString() ?? null,
});

async function queryCalls(f: Filter, role: string, limit: number, offset = 0) {
  const rows = await many<CallRowX>(`${callCols} where c.bank_id = $1${f.where} order by c.created_at desc limit ${limit} offset ${offset}`, f.params);
  return { items: rows.map((r) => toCallItem(r, role)), total: rows[0]?.total ?? 0 };
}

// ───────────── Clients ─────────────
interface ClientRow {
  user_id: string;
  first_name: string | null;
  phone: string;
  customer_ref: string | null;
  status: BankLinkStatus;
  linked_at: Date | null;
  ref_id: string | null;
  ref_name: string | null;
  ref_agency: string | null;
  last_call_at: Date | null;
  total: number;
}

const clientCols = `
  select u.id as user_id, u.first_name, u.phone, ub.customer_ref, ub.status, ub.linked_at,
         r.id as ref_id, r.name as ref_name, coalesce(rag.name, r.agency, '') as ref_agency,
         (select max(c.created_at) from certified_calls c where c.user_id = u.id and c.bank_id = ub.bank_id) as last_call_at,
         count(*) over()::int as total
  from user_banks ub join users u on u.id = ub.user_id
  left join advisors r on r.id = ub.referent_id and r.bank_id = ub.bank_id left join agencies rag on rag.id = r.agency_id`;

const toClient = (r: ClientRow, role: string): ClientListItem => ({
  userId: r.user_id,
  firstName: r.first_name,
  phone: phoneFor(role, r.phone),
  customerRef: r.customer_ref,
  linkStatus: r.status,
  linkedAt: r.linked_at?.toISOString() ?? null,
  referent: r.ref_id ? { id: r.ref_id, name: r.ref_name ?? "", agency: r.ref_agency ?? "" } : null,
  lastCallAt: r.last_call_at?.toISOString() ?? null,
});

/** Client relié à CETTE banque (en attente ou certifié) : 404 sinon, y compris pour un client d'une autre banque. */
async function ownedClient(bankId: string, userId: string): Promise<ClientRow & { reachable: boolean }> {
  uuidParam(userId, "Client introuvable");
  const base = await one<ClientRow>(`${clientCols} where ub.bank_id = $1 and ub.user_id = $2 and ub.status in ('pending', 'certified')`, [bankId, userId]);
  if (!base) throw notFound("Client introuvable");
  const reach = await one<{ ok: boolean }>("select exists (select 1 from push_tokens where user_id = $1) as ok", [userId]);
  return { ...base, reachable: !!reach?.ok };
}

// ───────────── Notes / journal ─────────────
const noteDto = (r: { id: string; body: string; author_id: string | null; author_name: string; created_at: Date }, who: AdvisorCtx): ClientNote => ({
  id: r.id,
  text: r.body,
  authorId: r.author_id,
  authorName: r.author_name || "Ancien compte",
  createdAt: r.created_at.toISOString(),
  canDelete: who.role === "bank_admin" || r.author_id === who.id,
});

interface AuditRow {
  id: string;
  created_at: Date;
  actor_id: string | null;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  meta: AuditEvent["meta"];
  total: number;
}
const toAudit = (r: AuditRow): AuditEvent => ({
  id: String(r.id),
  at: r.created_at.toISOString(),
  actor: { id: r.actor_id, name: r.actor_name },
  action: r.action,
  target: r.target_type ? { type: r.target_type, id: r.target_id, label: r.target_label } : null,
  meta: r.meta ?? {},
});
const auditCols = `select id, created_at, actor_id, actor_name, action, target_type, target_id, target_label, meta, count(*) over()::int as total from audit_events`;

// ───────────── Invitations ─────────────
interface InviteRow {
  id: string;
  status: InviteStatus;
  client_phone: string | null;
  customer_ref: string | null;
  advisor_name: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
}
const inviteStatus = `case when i.used_at is not null then 'used' when i.cancelled_at is not null then 'cancelled' when i.expires_at <= now() then 'expired' else 'open' end`;

export async function clientRoutes(app: FastifyInstance) {
  // ───────────── Tableau de bord ─────────────
  app.get("/console/dashboard", async (req): Promise<DashboardData> => {
    const staff = await requireAdvisor(req);
    const period = async (since: string): Promise<DashboardPeriod> => {
      const r = await one<DashboardPeriod>(
        `select (select count(*)::int from certified_calls where bank_id = $1 and created_at >= ${since}) as announced,
                (select count(*)::int from certified_calls where bank_id = $1 and created_at >= ${since} and confirmed_at is not null) as confirmed,
                (select count(*)::int from user_banks where bank_id = $1 and status = 'certified' and linked_at >= ${since}) as linked,
                (select count(*)::int from call_reports where bank_id = $1 and action = 'hung_up' and created_at >= ${since}) as reports`,
        [staff.bankId],
      );
      return r!;
    };
    const mine = new Filter(staff.bankId);
    mine.add(`c.status in ('announced','seen') and c.expires_at > now()`);
    if (staff.role !== "bank_admin") mine.add("c.advisor_id = $?", staff.id);
    const latest = new Filter(staff.bankId);
    const [today, week, active, calls, reports] = await Promise.all([
      period("date_trunc('day', now())"),
      period("now() - interval '7 days'"),
      queryCalls(mine, staff.role, 5),
      queryCalls(latest, staff.role, 6),
      listReports(staff.bankId, { limit: 5 }),
    ]);
    return { today, week, activeCalls: active.items, latestCalls: calls.items, latestReports: reports };
  });

  // ───────────── Liste des clients ─────────────
  app.get("/console/customers", async (req): Promise<Page<ClientListItem>> => {
    const staff = await requireAdvisor(req);
    const q = z
      .object({
        q: z.string().trim().max(60).optional(),
        status: z.enum(["certified", "pending"]).optional(),
        agencyId: z.string().uuid().optional(),
        sort: z.enum(["name", "last_call", "linked"]).default("name"),
        dir: z.enum(["asc", "desc"]).default("asc"),
      })
      .extend(pageSchema.shape)
      .parse(req.query);
    const f = new Filter(staff.bankId);
    f.add("ub.status in ('pending', 'certified')");
    if (q.status) f.add("ub.status = $?", q.status);
    if (q.agencyId) f.add("r.agency_id = $?", q.agencyId);
    if (q.q && q.q.length >= 2) {
      const digits = q.q.replace(/\D/g, "");
      f.add(`(u.first_name ilike $? or ub.customer_ref ilike $? or ($? <> '' and u.phone like $?))`, `%${escapeLike(q.q)}%`, `${escapeLike(q.q)}%`, digits.length >= 4 ? "x" : "", `%${digits.slice(-6)}`);
    }
    const dir = q.dir === "desc" ? "desc" : "asc";
    const order = { name: `lower(u.first_name) ${dir} nulls last`, last_call: `last_call_at ${dir} nulls last`, linked: `ub.linked_at ${dir} nulls last` }[q.sort];
    const rows = await many<ClientRow>(
      `${clientCols} where ub.bank_id = $1${f.where} order by ${order}, u.id limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`,
      f.params,
    );
    return { items: rows.map((r) => toClient(r, staff.role)), total: rows[0]?.total ?? 0, page: q.page, pageSize: q.pageSize };
  });

  // ───────────── Fiche client ─────────────
  app.get<{ Params: { userId: string } }>("/console/customers/:userId", async (req): Promise<ClientDetail> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    const counts = await one<{ calls: number; reports: number; notes: number }>(
      `select (select count(*)::int from certified_calls where bank_id = $1 and user_id = $2) as calls,
              (select count(*)::int from call_reports where bank_id = $1 and user_id = $2 and action = 'hung_up') as reports,
              (select count(*)::int from client_notes where bank_id = $1 and user_id = $2) as notes`,
      [staff.bankId, c.user_id],
    );
    return { ...toClient(c, staff.role), reachable: c.reachable, counts: counts! };
  });

  app.get<{ Params: { userId: string } }>("/console/customers/:userId/calls", async (req): Promise<CallListItem[]> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    const f = new Filter(staff.bankId);
    f.add("c.user_id = $?", c.user_id);
    return (await queryCalls(f, staff.role, 100)).items;
  });

  app.get<{ Params: { userId: string } }>("/console/customers/:userId/reports", async (req) => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    return listReports(staff.bankId, { userId: c.user_id, limit: 100 });
  });

  app.get<{ Params: { userId: string } }>("/console/customers/:userId/journal", async (req): Promise<AuditEvent[]> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    const rows = await many<AuditRow>(
      `${auditCols} where bank_id = $1 and target_type = 'client' and target_id = $2 order by created_at desc limit 100`,
      [staff.bankId, c.user_id],
    );
    return rows.map(toAudit);
  });

  // Notes internes (équipe de la banque seulement).
  app.get<{ Params: { userId: string } }>("/console/customers/:userId/notes", async (req): Promise<ClientNote[]> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    const rows = await many<{ id: string; body: string; author_id: string | null; author_name: string; created_at: Date }>(
      "select id, body, author_id, author_name, created_at from client_notes where bank_id = $1 and user_id = $2 order by created_at desc limit 200",
      [staff.bankId, c.user_id],
    );
    return rows.map((r) => noteDto(r, staff));
  });

  app.post<{ Params: { userId: string } }>("/console/customers/:userId/notes", async (req): Promise<ClientNote> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    const { text } = z.object({ text: z.string().trim().min(1, "Écrivez votre note.").max(2000, "2 000 caractères au maximum.") }).parse(req.body);
    const row = await tx(async (db) => {
      const r = await one<{ id: string; body: string; author_id: string | null; author_name: string; created_at: Date }>(
        `insert into client_notes (bank_id, user_id, author_id, author_name, body) values ($1, $2, $3, $4, $5) returning id, body, author_id, author_name, created_at`,
        [staff.bankId, c.user_id, staff.id, staff.name, text], db,
      );
      await audit({ bankId: staff.bankId, actor: staff, action: "note.created", target: { type: "client", id: c.user_id, label: await clientLabel(staff.bankId, c.user_id, db) } }, db);
      return r!;
    });
    return noteDto(row, staff);
  });

  app.delete<{ Params: { userId: string; noteId: string } }>("/console/customers/:userId/notes/:noteId", async (req) => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    uuidParam(req.params.noteId, "Note introuvable");
    const note = await one<{ author_id: string | null }>("select author_id from client_notes where id = $1 and bank_id = $2 and user_id = $3", [req.params.noteId, staff.bankId, c.user_id]);
    if (!note) throw notFound("Note introuvable");
    if (staff.role !== "bank_admin" && note.author_id !== staff.id) throw new HttpError(403, "forbidden", "Seul l'auteur de la note ou le responsable peut la supprimer.");
    await tx(async (db) => {
      await db.query("delete from client_notes where id = $1 and bank_id = $2", [req.params.noteId, staff.bankId]);
      await audit({ bankId: staff.bankId, actor: staff, action: "note.deleted", target: { type: "client", id: c.user_id, label: await clientLabel(staff.bankId, c.user_id, db) } }, db);
    });
    return { ok: true };
  });

  /** « Inviter de nouveau » : nouveau code pour le numéro déjà connu du client (le conseiller ne voit pas le numéro complet). */
  app.post<{ Params: { userId: string } }>("/console/customers/:userId/invite", async (req): Promise<ClientInvite> => {
    const staff = await requireAdvisor(req);
    const c = await ownedClient(staff.bankId, req.params.userId);
    return createInvite(staff, c.phone, c.customer_ref);
  });

  /** Dissocier un client : réservé au responsable. Le client reste dans SmartSecure mais n'est plus relié à la banque. */
  app.post<{ Params: { userId: string } }>("/console/customers/:userId/unlink", async (req) => {
    const admin = await requireBankAdmin(req);
    const c = await ownedClient(admin.bankId, req.params.userId);
    await tx(async (db) => {
      await db.query("select id from users where id = $1 for update", [c.user_id]);
      await db.query("update user_banks set status = 'basic', linked_at = null, referent_id = null, customer_ref = null where user_id = $1 and bank_id = $2", [c.user_id, admin.bankId]);
      await db.query("update certified_calls set status = 'ended', ended_at = now() where user_id = $1 and bank_id = $2 and status in ('announced', 'seen')", [c.user_id, admin.bankId]);
      await db.query("update client_invites set cancelled_at = now() where bank_id = $1 and client_phone = $2 and used_at is null and cancelled_at is null", [admin.bankId, c.phone]);
      await audit({ bankId: admin.bankId, actor: admin, action: "client.unlinked", target: { type: "client", id: c.user_id, label: [c.first_name ?? "Client", c.customer_ref ? `(${c.customer_ref})` : ""].filter(Boolean).join(" ") } }, db);
    });
    return { ok: true };
  });

  // ───────────── Journal des appels ─────────────
  app.get("/console/call-log", async (req): Promise<Page<CallListItem>> => {
    const staff = await requireAdvisor(req);
    const q = z
      .object({
        status: z.enum(["announced", "seen", "confirmed", "ended", "rejected", "expired"]).optional(),
        advisorId: z.string().uuid().optional(),
        agencyId: z.string().uuid().optional(),
        from: day.optional(),
        to: day.optional(),
        q: z.string().trim().max(60).optional(),
      })
      .extend(pageSchema.shape)
      .parse(req.query);
    const f = new Filter(staff.bankId);
    if (q.status) f.add(`${effStatus} = $?`, q.status);
    if (q.advisorId) f.add("c.advisor_id = $?", q.advisorId);
    if (q.agencyId) f.add("a.agency_id = $?", q.agencyId);
    if (q.from) f.add("c.created_at >= $?::date", q.from);
    if (q.to) f.add("c.created_at < ($?::date + 1)", q.to);
    if (q.q && q.q.length >= 2) f.add("(u.first_name ilike $? or c.reason ilike $?)", `%${escapeLike(q.q)}%`, `%${escapeLike(q.q)}%`);
    const r = await queryCalls(f, staff.role, q.pageSize, (q.page - 1) * q.pageSize);
    return { ...r, page: q.page, pageSize: q.pageSize };
  });

  // ───────────── Invitations ─────────────
  app.get("/console/invites", async (req): Promise<InviteListItem[]> => {
    const staff = await requireAdvisor(req);
    const rows = await many<InviteRow>(
      `select i.id, ${inviteStatus} as status, i.client_phone, i.customer_ref, a.name as advisor_name, i.created_at, i.expires_at, i.used_at
       from client_invites i join advisors a on a.id = i.advisor_id
       where i.bank_id = $1 and ($2 or i.advisor_id = $3) and i.created_at > now() - interval '30 days'
       order by i.created_at desc limit 100`,
      [staff.bankId, staff.role === "bank_admin", staff.id],
    );
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      clientPhone: r.client_phone ? phoneFor(staff.role, r.client_phone) : "",
      customerRef: r.customer_ref,
      advisorName: r.advisor_name,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
      usedAt: r.used_at?.toISOString() ?? null,
    }));
  });

  app.delete<{ Params: { id: string } }>("/console/invites/:id", async (req) => {
    const staff = await requireAdvisor(req);
    uuidParam(req.params.id, "Invitation introuvable");
    await tx(async (db) => {
      const row = await one<{ id: string; advisor_id: string; customer_ref: string | null }>(
        `update client_invites set cancelled_at = now()
         where id = $1 and bank_id = $2 and ($3 or advisor_id = $4) and used_at is null and cancelled_at is null and expires_at > now()
         returning id, advisor_id, customer_ref`,
        [req.params.id, staff.bankId, staff.role === "bank_admin", staff.id], db,
      );
      if (!row) throw notFound("Invitation introuvable ou déjà terminée");
      await audit({ bankId: staff.bankId, actor: staff, action: "invite.cancelled", target: { type: "invite", id: row.id, label: row.customer_ref } }, db);
    });
    return { ok: true };
  });

  // ───────────── Journal d'activité (responsable) ─────────────
  app.get("/console/audit", async (req): Promise<Page<AuditEvent>> => {
    const admin = await requireBankAdmin(req);
    const q = z
      .object({
        category: z.enum(["auth", "call", "invite", "client", "note", "staff", "settings"]).optional(),
        actorId: z.string().uuid().optional(),
        from: day.optional(),
        to: day.optional(),
        q: z.string().trim().max(60).optional(),
      })
      .extend(pageSchema.shape)
      .parse(req.query);
    const f = new Filter(admin.bankId);
    if (q.category === "settings") f.add("(action like 'agency.%' or action like 'bank.%')");
    else if (q.category) f.add("action like $?", `${q.category}.%`);
    if (q.actorId) f.add("actor_id = $?", q.actorId);
    if (q.from) f.add("created_at >= $?::date", q.from);
    if (q.to) f.add("created_at < ($?::date + 1)", q.to);
    if (q.q && q.q.length >= 2) f.add("(actor_name ilike $? or target_label ilike $?)", `%${escapeLike(q.q)}%`, `%${escapeLike(q.q)}%`);
    const rows = await many<AuditRow>(`${auditCols} where bank_id = $1${f.where} order by created_at desc, id desc limit ${q.pageSize} offset ${(q.page - 1) * q.pageSize}`, f.params);
    return { items: rows.map(toAudit), total: rows[0]?.total ?? 0, page: q.page, pageSize: q.pageSize };
  });
}
