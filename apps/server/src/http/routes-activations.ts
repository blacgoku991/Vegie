/** Liaison d'un client par lien d'activation : la banque crée le compte, le client appuie sur le lien reçu par SMS. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { normalizePhone } from "@vigie/shared";
import type { ActivationSent, ClientActivation } from "@vigie/shared";
import { cancelActivation, createActivation, listActivations, resendActivation } from "../services/activations.ts";
import { requireAdvisor } from "./context.ts";

const phoneField = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) {
    ctx.addIssue({ code: "custom", message: "Ce numéro de téléphone n'est pas valide." });
    return z.NEVER;
  }
  return p;
});

export async function activationRoutes(app: FastifyInstance) {
  app.post("/console/customers", async (req): Promise<ActivationSent> => {
    const staff = await requireAdvisor(req);
    const body = z
      .object({
        firstName: z.string().trim().min(1, "Indiquez le prénom du client.").max(40),
        phone: phoneField,
        customerRef: z.string().trim().max(40).nullish(),
      })
      .parse(req.body);
    return createActivation(staff, { firstName: body.firstName, phone: body.phone, customerRef: body.customerRef || null });
  });

  app.get("/console/activations", async (req): Promise<ClientActivation[]> => listActivations(await requireAdvisor(req)));

  app.post<{ Params: { id: string } }>("/console/activations/:id/resend", async (req): Promise<ActivationSent> =>
    resendActivation(await requireAdvisor(req), req.params.id));

  app.delete<{ Params: { id: string } }>("/console/activations/:id", async (req) => {
    await cancelActivation(await requireAdvisor(req), req.params.id);
    return { ok: true };
  });
}
