import { config } from "../config.ts";
import { many, pool } from "../db/pool.ts";
import { log } from "./log.ts";

/**
 * Notifications push via le service Expo (FCM/APNs derrière).
 * Minimisation : le contenu des notifications ne contient jamais le texte d'un mail
 * ni de données bancaires, seulement le verdict et la marque imitée.
 */
export interface PushMessage {
  /** Absents pour un push silencieux (réveil en arrière-plan, rien n'est affiché). */
  title?: string;
  body?: string;
  data: Record<string, unknown>;
  /** Canal Android (créé par l'app) : "certified-calls" | "alerts". */
  channelId: "certified-calls" | "alerts";
  /** iOS : "time-sensitive" pour passer les modes Concentration (appel certifié, arnaque). */
  interruptionLevel?: "active" | "time-sensitive";
  categoryId?: string;
  /** iOS : réveille l'app en arrière-plan (content-available). Requiert UIBackgroundModes: remote-notification. */
  contentAvailable?: boolean;
  /** iOS : permet à la Notification Service Extension de traiter la notification avant affichage. */
  mutableContent?: boolean;
  /** Push silencieux : pas de son, priorité normale. */
  silent?: boolean;
}

/** Corps envoyé à Expo pour un jeton (extrait pour être testé). */
export function buildExpoPayload(token: string, msg: PushMessage): Record<string, unknown> {
  return {
    to: token,
    ...(msg.title !== undefined ? { title: msg.title } : {}),
    ...(msg.body !== undefined ? { body: msg.body } : {}),
    data: msg.data,
    ...(msg.silent ? {} : { sound: "default" }),
    priority: msg.silent ? "normal" : "high",
    channelId: msg.channelId,
    interruptionLevel: msg.interruptionLevel ?? "active",
    categoryId: msg.categoryId,
    ...(msg.contentAvailable ? { _contentAvailable: true } : {}),
    ...(msg.mutableContent ? { mutableContent: true } : {}),
  };
}

export async function pushToUser(userId: string, msg: PushMessage): Promise<number> {
  const tokens = await many<{ token: string }>("select token from push_tokens where user_id = $1", [userId]);
  if (!tokens.length) return 0;
  const payload = tokens.map(({ token }) => buildExpoPayload(token, msg));
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(config.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${config.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    let sent = 0;
    for (const [i, ticket] of (json.data ?? []).entries()) {
      if (ticket.status === "ok") sent++;
      else if (ticket.details?.error === "DeviceNotRegistered") {
        await pool.query("delete from push_tokens where token = $1", [tokens[i]!.token]);
      }
    }
    return sent;
  } catch (err) {
    log.warn("push.failed", { userId, error: (err as Error).message });
    return 0;
  }
}
