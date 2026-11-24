import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** api | worker | all — permet de séparer les rôles en production. */
  ROLE: z.enum(["api", "worker", "all"]).default("all"),
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().default("postgres://vigie:vigie@localhost:5432/vigie"),
  /** URL publique HTTPS du serveur (webhooks Microsoft/Google, callbacks OAuth). */
  PUBLIC_URL: z.string().default("http://localhost:4000"),
  /** Schéma de deep link de l'app (vigie://). */
  APP_SCHEME: z.string().default("vigie"),
  /** Clé AES-256 en base64 (32 octets) pour chiffrer les secrets des boîtes mail. */
  ENCRYPTION_KEY: z.string().optional(),

  // IA — en production, Vertex AI région UE pour garder les données en Europe.
  AI_PROVIDER: z.enum(["anthropic", "vertex", "none"]).default("none"),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().default("europe-west1"),

  // Navigateur headless isolé
  SCANNER_URL: z.string().optional(),
  SCANNER_SECRET: z.string().optional(),

  // Réputation des liens
  WEB_RISK_API_KEY: z.string().optional(),
  URLHAUS_AUTH_KEY: z.string().optional(),

  // Microsoft Graph (Outlook / Hotmail / Live)
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_TENANT: z.string().default("common"),
  MS_WEBHOOK_SECRET: z.string().default("dev-graph-client-state"),

  // Gmail — désactivé tant que l'audit CASA n'est pas passé.
  FEATURE_GMAIL: bool,
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GMAIL_PUBSUB_TOPIC: z.string().optional(),
  GMAIL_PUSH_SECRET: z.string().optional(),

  // SMS des codes de connexion
  SMS_PROVIDER: z.enum(["console", "brevo"]).default("console"),
  BREVO_API_KEY: z.string().optional(),
  SMS_SENDER: z.string().default("Vigie"),

  // Notifications push
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /** Code OTP fixe, accepté uniquement hors production (démos, tests). */
  DEV_FIXED_OTP: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);

export const isProd = config.NODE_ENV === "production";

if (isProd) {
  const missing = (["ENCRYPTION_KEY", "PUBLIC_URL"] as const).filter((k) => !config[k]);
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}`);
  if (config.DEV_FIXED_OTP) throw new Error("DEV_FIXED_OTP est interdit en production");
}
