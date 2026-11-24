import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { config, isProd } from "../config.ts";
import { log } from "../lib/log.ts";
import { HttpError } from "./context.ts";
import { adminRoutes } from "./routes-admin.ts";
import { appRoutes } from "./routes-app.ts";
import { clientRoutes } from "./routes-clients.ts";
import { activationRoutes } from "./routes-activations.ts";
import { consoleRoutes } from "./routes-console.ts";
import { mailRoutes } from "./routes-mail.ts";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: false,
    bodyLimit: 512 * 1024,
    // Nombre de proxys de confiance devant l'API. À 0, `req.ip` est l'adresse de la connexion : un client ne peut pas
    // la falsifier avec X-Forwarded-For, ce qui protège les limites par IP (codes, liens d'activation).
    trustProxy: config.TRUST_PROXY > 0 ? (_address: string, hop: number) => hop < config.TRUST_PROXY : false,
  });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("cache-control", "no-store");
  });

  // CORS : uniquement pour l'aperçu web de l'app en développement (les apps natives n'en ont pas besoin,
  // la console passe par le même domaine).
  if (!isProd) {
    app.addHook("onRequest", async (req, reply) => {
      const origin = req.headers.origin;
      // Réseau local privé autorisé aussi : aperçu web ouvert depuis un téléphone sur le même Wi-Fi.
      if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+$/.test(origin)) return;
      reply.header("access-control-allow-origin", origin);
      reply.header("access-control-allow-headers", "authorization, content-type");
      reply.header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
      if (req.method === "OPTIONS") return reply.code(204).send();
    });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_request", message: err.issues[0]?.message ?? "Requête invalide" });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: "bad_request", message: (err as Error).message });
    log.error("http.error", { url: req.url, error: (err as Error).message, stack: isProd ? undefined : (err as Error).stack });
    return reply.code(500).send({ error: "server_error", message: "Une erreur est survenue. Réessayez dans un instant." });
  });

  app.get("/health", async () => ({ ok: true }));
  app.register(appRoutes, { prefix: "/v1" });
  app.register(mailRoutes, { prefix: "/v1" });
  app.register(consoleRoutes, { prefix: "/v1" });
  app.register(adminRoutes, { prefix: "/v1" });
  app.register(clientRoutes, { prefix: "/v1" });
  app.register(activationRoutes, { prefix: "/v1" });
  return app;
}
