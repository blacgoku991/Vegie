import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "./api";
import { protection } from "./protection";

/** Affiche les notifications même quand l'app est ouverte. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type Payload = Record<string, unknown>;

/** Données personnalisées d'un push reçu en arrière-plan (la forme varie selon la plateforme et l'état de l'app). */
function backgroundData(raw: unknown): Payload | undefined {
  const obj = (v: unknown): Payload | undefined => (v && typeof v === "object" ? (v as Payload) : undefined);
  const parse = (v: unknown): Payload | undefined => {
    if (typeof v !== "string") return undefined;
    try {
      return obj(JSON.parse(v));
    } catch {
      return undefined;
    }
  };
  const d = obj(raw);
  if (!d) return undefined;
  const candidates = [
    obj(obj(obj(obj(d.notification)?.request)?.content)?.data),
    obj(d.data),
    obj(d.body),
    parse(d.body),
    parse(d.dataString),
    parse(obj(d.data)?.dataString),
    d,
  ];
  return candidates.find((c) => c && typeof c.type === "string");
}

/** Applique un push « appel annoncé » ou « annonce terminée » à l'état natif (étiquette iOS, filtrage Android). */
function applyCallPush(data: Payload | undefined) {
  if (data?.type === "certified_call" && data.callId) {
    protection.setExpectedCall({
      id: String(data.callId),
      callerNumber: (data.callerNumber as string) ?? null,
      bankName: String(data.bankName),
      advisorName: String(data.advisorName),
      agency: String(data.agency),
      expiresAt: String(data.expiresAt),
    });
  } else if (data?.type === "certified_call_ended") {
    // Annonce terminée, consommée ou refusée : l'étiquette « certifié » doit disparaître.
    // Seulement si l'identifiant correspond à l'annonce mémorisée.
    if (data.callId) protection.clearExpectedCall(String(data.callId));
  }
}

/** Tâche d'arrière-plan (push silencieux ou notification reçue app fermée). Définie au niveau global, comme l'exige expo-task-manager. */
const CALL_TASK = "vigie-certified-call-task";
if (Platform.OS !== "web") {
  TaskManager.defineTask(CALL_TASK, async ({ data, error }: { data?: unknown; error?: unknown }) => {
    if (error) return;
    try {
      applyCallPush(backgroundData(data));
    } catch {
      // Jamais d'exception dans la tâche : sans mise à jour, pas d'étiquette (comportement sûr).
    }
  });
}

async function registerCallTask() {
  if (Platform.OS === "web") return;
  try {
    await Notifications.registerTaskAsync(CALL_TASK);
  } catch {
    // Non supporté (Expo Go, aperçu) : l'étiquette ne se met alors à jour qu'au premier plan.
  }
}

async function setupChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("certified-calls", {
    name: "Appels certifiés de ma banque",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: "#0A6B3D",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("alerts", {
    name: "Alertes arnaque",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: "#B3261E",
  });
}

/** Demande l'autorisation, crée les canaux et enregistre l'appareil auprès du serveur. */
export async function registerForPush(): Promise<boolean> {
  if (Platform.OS === "web" || !Device.isDevice) return false;
  await setupChannels();
  await Notifications.setNotificationCategoryAsync("certified-call", [
    { identifier: "open", buttonTitle: "Voir qui m'appelle", options: { opensAppToForeground: true } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
  if (!granted) return false;
  await registerCallTask();
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api.registerDevice(Platform.OS as "ios" | "android", data);
  return true;
}

function route(data: Record<string, unknown> | undefined) {
  if (!data) return;
  if (data.type === "certified_call") router.push({ pathname: "/call/certified", params: { id: String(data.callId ?? "") } });
  else if (data.type === "alert" && data.alertId) router.push(`/alert/${String(data.alertId)}`);
}

/** Écoute les notifications : mémorise l'appel annoncé et ouvre le bon écran au toucher. */
export function listenNotifications(): () => void {
  if (Platform.OS === "web") return () => {};
  const received = Notifications.addNotificationReceivedListener((n) => {
    applyCallPush(n.request.content.data as Payload);
  });
  // Premier plan : retire une annonce expirée (étiquette iOS) puis réinscrit la tâche d'arrière-plan.
  protection.refreshExpectedCall();
  void registerCallTask();
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") protection.refreshExpectedCall();
  });
  const tapped = Notifications.addNotificationResponseReceivedListener((r) => route(r.notification.request.content.data as Record<string, unknown>));
  // App lancée depuis une notification.
  void Notifications.getLastNotificationResponseAsync().then((r) => r && route(r.notification.request.content.data as Record<string, unknown>));
  return () => {
    received.remove();
    tapped.remove();
    appState.remove();
  };
}
