import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
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
    const data = n.request.content.data as Record<string, unknown>;
    if (data?.type === "certified_call") {
      protection.setExpectedCall({
        id: String(data.callId),
        callerNumber: (data.callerNumber as string) ?? null,
        bankName: String(data.bankName),
        advisorName: String(data.advisorName),
        agency: String(data.agency),
        expiresAt: String(data.expiresAt),
      });
    }
  });
  const tapped = Notifications.addNotificationResponseReceivedListener((r) => route(r.notification.request.content.data as Record<string, unknown>));
  // App lancée depuis une notification.
  void Notifications.getLastNotificationResponseAsync().then((r) => r && route(r.notification.request.content.data as Record<string, unknown>));
  return () => {
    received.remove();
    tapped.remove();
  };
}
