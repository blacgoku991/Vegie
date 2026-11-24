import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { formatPhone, normalizePhone } from "@vigie/shared";
import type { Advisor, ClientSearchResult, ConsoleStats, FakeCallReport } from "@vigie/shared";
import { many, one } from "../db/pool.ts";
import { hashPassword, verifyPassword } from "../lib/crypto.ts";
import { consoleCall, endCall, recentConsoleCalls, startCall } from "../services/calls.ts";
import { HttpError, consoleToken, createSession, destroySession, notFound, requireAdvisor, setConsoleCookie } from "./context.ts";

const maskPhone = (e164: string) => {
  const f = formatPhone(e164);
  return `${f.slice(0, 2)} •• •• •• ${f.slice(-2)}`;
};

// Hachage factice : même coût de calcul que le compte existe ou non (pas d'énumération des comptes).
const dummyHash = hashPassword("vigie-dummy-password");

export async function consoleRoutes(app: FastifyInstance) {
  app.post("/console/login", async (req, reply): Promise<Advisor> => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const row = await one<{ id: string; password_hash: string }>("select id, password_hash from advisors where email = $1", [body.email.toLowerCase()]);
    const ok = await verifyPassword(body.password, row?.password_hash ?? (await dummyHash));
    if (!row || !ok) throw new HttpError(401, "bad_credentials", "E-mail ou mot de passe incorrect.");
    setConsoleCookie(reply, await createSession("advisor", row.id, 0.5));
    return advisorDto(await requireAdvisorById(row.id));
  });

  app.post("/console/logout", async (req, reply) => {
    const token = consoleToken(req);
    if (token) await destroySession(token);
    setConsoleCookie(reply, null);
    return { ok: true };
  });

  app.get("/console/me", async (req) => advisorDto(await requireAdvisor(req)));

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
       where ub.bank_id = $1
         and (u.phone = $2 or ub.customer_ref ilike $3 or u.first_name ilike $3 or u.phone like $4)
       order by ub.status = 'certified' desc, u.first_name nulls last limit 20`,
      [advisor.bankId, phone, `${q}%`, `%${q.replace(/\D/g, "").slice(-6) || "∅"}`],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      firstName: r.first_name,
      phone: formatPhone(r.phone),
      customerRef: r.customer_ref,
      linkStatus: r.status,
      reachable: r.reachable,
    }));
  });

  /** Le conseiller confirme que ce compte Vigie appartient bien à son client (après vérification habituelle d'identité). */
  app.post<{ Params: { userId: string } }>("/console/clients/:userId/link", async (req) => {
    const advisor = await requireAdvisor(req);
    const { customerRef } = z.object({ customerRef: z.string().trim().min(1).max(40) }).parse(req.body);
    const row = await one(
      `update user_banks set status = 'certified', customer_ref = $3, linked_at = now() where user_id = $1 and bank_id = $2 returning 1`,
      [req.params.userId, advisor.bankId, customerRef],
    );
    if (!row) throw notFound("Ce client n'a pas ajouté votre banque dans Vigie");
    return { ok: true };
  });

  app.post("/console/calls", async (req) => {
    const advisor = await requireAdvisor(req);
    const body = z
      .object({ userId: z.string().uuid(), reason: z.string().trim().min(3).max(120), callerNumber: z.string().nullish() })
      .parse(req.body);
    const callerNumber = body.callerNumber?.trim() ? normalizePhone(body.callerNumber) : null;
    if (body.callerNumber?.trim() && !callerNumber) throw new HttpError(400, "bad_number", "Ce numéro d'appel n'est pas valide.");
    return startCall(advisor, { userId: body.userId, reason: body.reason, callerNumber });
  });

  app.get("/console/calls", async (req) => {
    const advisor = await requireAdvisor(req);
    return recentConsoleCalls(advisor.bankId, 20);
  });

  app.get<{ Params: { id: string } }>("/console/calls/:id", async (req) => {
    const advisor = await requireAdvisor(req);
    return consoleCall(req.params.id, advisor.bankId);
  });

  app.post<{ Params: { id: string } }>("/console/calls/:id/end", async (req) => {
    const advisor = await requireAdvisor(req);
    await endCall(req.params.id, advisor.bankId);
    return consoleCall(req.params.id, advisor.bankId);
  });

  app.get("/console/stats", async (req): Promise<ConsoleStats> => {
    const advisor = await requireAdvisor(req);
    const totals = await one<{ certified: number; confirmed: number; linked: number; fake: number }>(
      `select
         (select count(*)::int from certified_calls where bank_id = $1 and created_at > now() - interval '30 days') as certified,
         (select count(*)::int from certified_calls where bank_id = $1 and created_at > now() - interval '30 days' and confirmed_at is not null) as confirmed,
         (select count(*)::int from user_banks where bank_id = $1 and status = 'certified') as linked,
         (select count(*)::int from call_reports where bank_id = $1 and action <> 'confirmed' and created_at > now() - interval '30 days') as fake`,
      [advisor.bankId],
    );
    const daily = await many<{ day: string; certified: number; fake_reported: number }>(
      `select to_char(d, 'YYYY-MM-DD') as day,
              (select count(*)::int from certified_calls c where c.bank_id = $1 and c.created_at::date = d) as certified,
              (select count(*)::int from call_reports r where r.bank_id = $1 and r.action <> 'confirmed' and r.created_at::date = d) as fake_reported
       from generate_series(current_date - 13, current_date, interval '1 day') as d order by d`,
      [advisor.bankId],
    );
    const t = totals!;
    return {
      period: { from: daily[0]?.day ?? "", to: daily.at(-1)?.day ?? "" },
      certifiedCalls: t.certified,
      confirmedRate: t.certified ? t.confirmed / t.certified : 0,
      linkedClients: t.linked,
      fakeCallsReported: t.fake,
      daily: daily.map((d) => ({ day: d.day, certified: d.certified, fakeReported: d.fake_reported })),
    };
  });

  /** Faux appels signalés par les clients de la banque (numéro affiché, action prise). */
  app.get("/console/reports", async (req): Promise<FakeCallReport[]> => {
    const advisor = await requireAdvisor(req);
    const rows = await many<{ id: string; number: string | null; created_at: Date; action: FakeCallReport["action"]; first_name: string | null; phone: string; spoofed: boolean }>(
      `select r.id, r.number, r.created_at, r.action, u.first_name, u.phone, coalesce(r.number = any(b.official_numbers), false) as spoofed
       from call_reports r join users u on u.id = r.user_id join banks b on b.id = r.bank_id
       where r.bank_id = $1 and r.action <> 'confirmed' order by r.created_at desc limit 100`,
      [advisor.bankId],
    );
    return rows.map((r) => ({
      id: r.id,
      number: r.number ? formatPhone(r.number) : null,
      spoofedOfficial: r.spoofed,
      reportedAt: r.created_at.toISOString(),
      action: r.action,
      client: { firstName: r.first_name, phoneMasked: maskPhone(r.phone) },
    }));
  });
}

async function requireAdvisorById(id: string) {
  const a = await one<{ id: string; name: string; email: string; agency: string; bankId: string; bankName: string; outboundNumber: string | null }>(
    `select a.id, a.name, a.email, a.agency, a.bank_id as "bankId", b.name as "bankName", a.outbound_number as "outboundNumber"
     from advisors a join banks b on b.id = a.bank_id where a.id = $1`,
    [id],
  );
  if (!a) throw notFound();
  return a;
}

function advisorDto(a: { id: string; name: string; email: string; agency: string; bankId: string; bankName: string; outboundNumber: string | null }): Advisor {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    agency: a.agency,
    bankId: a.bankId,
    bankName: a.bankName,
    outboundNumber: a.outboundNumber ? formatPhone(a.outboundNumber) : null,
  };
}

