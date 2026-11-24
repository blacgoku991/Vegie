import { config } from "../config.ts";
import { log } from "./log.ts";

/** Envoi des codes de connexion par SMS. Brevo (fournisseur français) en production. */
export async function sendSms(to: string, text: string): Promise<void> {
  if (config.SMS_PROVIDER === "console") {
    log.info("sms.console", { to: to.slice(0, -4) + "••••", text });
    return;
  }
  const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": config.BREVO_API_KEY ?? "" },
    body: JSON.stringify({ sender: config.SMS_SENDER, recipient: to.replace("+", ""), content: text, type: "transactional" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Envoi SMS impossible (${res.status})`);
}
