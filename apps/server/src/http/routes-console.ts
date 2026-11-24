import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatPhone, normalizePhone } from "@vigie/shared";
import type { Advisor, ClientSearchResult, ConsoleStats, FakeCallReport } from "@vigie/shared";
import { many, one } from "../db/pool.ts";
import { escapeLike } from "../lib/like.ts";
import { phoneFor } from "../lib/phone-mask.ts";
import { hashPassword, verifyPassword } from "../lib/crypto.ts";
import { listReports } from "../services/reports.ts";
import { audit, clientLabel } from "../services/audit.ts";
import { consoleCall, endCall, recentConsoleCalls, startCall } from "../services/calls.ts";
import { loadStaff, staffDto } from "../services/staff.ts";
import { HttpError, consoleToken, createSession, destroySession, notFound, requireAdvisor, requireStaff, setConsoleCookie } from "./context.ts";

/** Numéro du client masqué pour un conseiller, complet pour le responsable (comme la liste clients). */
const maskCall = <T extends { client: { phone: string } }>(c: T, role: string): T => ({ ...c, client: { ...c.client, phone: phoneFor(role, normalizePhone(c.client.phone) ?? c.client.phone) } });

// Hachage factice : même coût de calcul que le compte existe ou non (pas d'énumération des comptes).
const dummyHash = hashPassword("vigie-dummy-password");

export async function consoleRoutes(app: FastifyInstance) {
  app.post("/console/login", async (req, reply): Promise<Advisor> => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const row = await one<{ id: string; password_hash: string | null; active: boolean }>("select id, password_hash, active from advisors where email = $1", [body.email.toLowerCase()]);
    const ok = await verifyPassword(body.password, row?.password_hash ?? (await dummyHash));
    if (!row || !row.password_hash || !ok) throw new HttpError(401, "bad_credentials", "E-mail ou mot de passe incorrect.");
    if (!row.active) throw new HttpError(403, "account_disabled", "Ce compte est désactivé. Contactez le responsable de votre banque.");
    setConsoleCookie(reply, await createSession("advisor", row.id, 0.5));
    const staff = await loadStaff(row.id);
    if (staff.bankId) await audit({ bankId: staff.bankId, actor: staff, action: "auth.login" });
    return staffDto(staff);
  });

  app.post("/console/logout", async (req, reply) => {
    const token = consoleToken(req);
    if (token) await destroySession(token);
    setConsoleCookie(reply, null);
    return { ok: true };
  });

  app.get("/console/me", async (req): Promise<Advisor> => staffDto(await requireStaff(req)));

  /** Recherche parmi les clients ayant ajouté la banque dans Vigie (téléphone, prénom ou référence client). */
  app.get<{ Querystring: { q?: string } }>("/console/clients", async (req): Promise<ClientSearchResult[]> => {
    const advisor = await requireAdvisor(req);
    const q = (req.query.q ?? "").trim();
    if (q.length < 2) return [];
    const phone = normalizePhone(q);
    const rows = await many<{ user_id: string; first_name: string | null; phone: string; customer_ref: string | null; status: ClientSearchResult["linkStatus"]; reachable: boolean }>(
      `select u.id as user_id, u.first_name, u.phone, ub.customer_ref, ub.status,
              exists (select 1 from push_tokens p where p.user_id = u.id) as reachable
       from user_banks ub join users u on u.id = ub.user_id
       where ub.bank_id = $1 and ub.status in ('pending', 'certified')
         and (u.phone = $2 or ub.customer_ref ilike $3 or u.first_name ilike $3 or ($5 and u.phone like $4))
       order by ub.status = 'certified' desc, u.first_name nulls last limit 20`,
      [advisor.bankId, phone, `${escapeLike(q)}%`, `%${q.replace(/\D/g, "").slice(-6) || "∅"}`, advisor.role === "bank_admin"],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      firstName: r.first_name,
      phone: phoneFor(advisor.role, r.phone),
      customerRef: r.customer_ref,
      linkStatus: r.status,
      reachable: r.reachable,
    }));
  });

  /** Le conseiller confirme que ce compte Vigie appartient bien à son client (après vérification habituelle d'identité). */
  app.post<{ Params: { userId: string } }>("/console/clients/:userId/link", async (req) => {
    const advisor = await requireAdvisor(req);
    const { customerRef } = z.object({ customerRef: z.string().trim().min(1).max(40) }).parse(req.body);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.userId)) throw notFound("Ce client n'a pas ajouté votre banque dans SmartSecure");
    const row = await one(
      `update user_banks set status = 'certified', customer_ref = $3, linked_at = now(), referent_id = $4 where user_id = $1 and bank_id = $2 and status = 'pending' returning 1`,
      [req.params.userId, advisor.bankId, customerRef, advisor.id],
    );
    if (!row) throw notFound("Ce client n'a pas ajouté votre banque dans SmartSecure");
    await audit({ bankId: advisor.bankId, actor: advisor, action: "client.linked", target: { type: "client", id: req.params.userId, label: await clientLabel(advisor.bankId, req.params.userId) } });
    return { ok: true };
  });

  app.post("/console/calls", async (req) => {
    const advisor = await requireAdvisor(req);
    const body = z
      .object({ userId: z.string().uuid(), reason: z.string().trim().min(3).max(120), callerNumber: z.string().nullish() })
      .parse(req.body);
    const callerNumber = body.callerNumber?.trim() ? normalizePhone(body.callerNumber) : null;
    if (body.callerNumber?.trim() && !callerNumber) throw new HttpError(400, "bad_number", "Ce numéro d'appel n'est pas valide.");
    return maskCall(await startCall(advisor, { userId: body.userId, reason: body.reason, callerNumber }), advisor.role);
  });

  app.get("/console/calls", async (req) => {
    const advisor = await requireAdvisor(req);
    return (await recentConsoleCalls(advisor.bankId, 20)).map((c) => maskCall(c, advisor.role));
  });

  app.get<{ Params: { id: string } }>("/console/calls/:id", async (req) => {
    const advisor = await requireAdvisor(req);
    return maskCall(await consoleCall(req.params.id, advisor.bankId), advisor.role);
  });

  app.post<{ Params: { id: string } }>("/console/calls/:id/end", async (req) => {
    const advisor = await requireAdvisor(req);
    await endCall(req.params.id, advisor.bankId);
    const ended = await consoleCall(req.params.id, advisor.bankId);
    await audit({ bankId: advisor.bankId, actor: advisor, action: "call.ended", target: { type: "client", id: ended.client.userId, label: await clientLabel(advisor.bankId, ended.client.userId) }, meta: { callId: ended.id } });
    return maskCall(ended, advisor.role);
  });

  app.get("/console/stats", async (req): Promise<ConsoleStats> => {
    const advisor = await requireAdvisor(req);
    const totals = await one<{ certified: number; confirmed: number; linked: number; fake: number; callbacks: number; period_start: string; period_end: string }>(
      `select
         (select count(*)::int from certified_calls where bank_id = $1 and created_at > now() - interval '30 days') as certified,
         (select count(*)::int from certified_calls where bank_id = $1 and created_at > now() - interval '30 days' and confirmed_at is not null) as confirmed,
         (select count(*)::int from user_banks where bank_id = $1 and status = 'certified') as linked,
         (select count(*)::int from call_reports where bank_id = $1 and action = 'hung_up' and created_at > now() - interval '30 days') as fake,
         (select count(*)::int from call_reports where bank_id = $1 and action = 'called_back' and created_at > now() - interval '30 days') as callbacks,
         to_char(now() - interval '30 days','YYYY-MM-DD') as period_start, to_char(now(),'YYYY-MM-DD') as period_end`,
      [advisor.bankId],
    );
    const daily = await many<{ day: string; certified: number; fake_reported: number }>(
      `select to_char(d, 'YYYY-MM-DD') as day,
              (select count(*)::int from certified_calls c where c.bank_id = $1 and c.created_at::date = d) as certified,
              (select count(*)::int from call_reports r where r.bank_id = $1 and r.action = 'hung_up' and r.created_at::date = d) as fake_reported
       from generate_series(current_date - 13, current_date, interval '1 day') as d order by d`,
      [advisor.bankId],
    );
    const t = totals!;
    return {
      period: { from: t.period_start, to: t.period_end },
      certifiedCalls: t.certified,
      confirmedRate: t.certified ? t.confirmed / t.certified : 0,
      linkedClients: t.linked,
      fakeCallsReported: t.fake,
      callbacksStarted: t.callbacks,
      daily: daily.map((d) => ({ day: d.day, certified: d.certified, fakeReported: d.fake_reported })),
    };
  });

  /** Faux appels signalés par les clients de la banque (numéro affiché, action prise). */
  app.get("/console/reports", async (req): Promise<FakeCallReport[]> => listReports((await requireAdvisor(req)).bankId));
}
