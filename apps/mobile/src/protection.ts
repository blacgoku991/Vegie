import { Platform, Linking } from "react-native";
import { requireOptionalNativeModule } from "expo";
import type { CertifiedCall, PhoneDirectory } from "@vigie/shared";

/**
 * Pont vers le module natif local `modules/vigie-protection` :
 * - Android : filtrage d'appels (CallScreeningService), lecture des notifications SMS/WhatsApp
 *   (NotificationListenerService), raccrochage.
 * - iOS : annuaire d'appels (Call Directory), filtre SMS et extension Partager via App Group.
 * Sur le web (aperçu) ou si le module manque, tout est inactif.
 */
type FeatureState = "enabled" | "disabled" | "unknown" | "unsupported";

export interface ProtectionStatus {
  callScreening: FeatureState;
  notificationListener: FeatureState;
  callDirectory: FeatureState;
  canEndCall: boolean;
}

interface NativeModule {
  setSession(apiUrl: string, token: string | null): void;
  syncDirectory(json: string): Promise<void>;
  setExpectedCall(json: string | null): void;
  setAutoHangup(enabled: boolean): void;
  getStatus(): Promise<ProtectionStatus>;
  requestCallScreening(): Promise<boolean>;
  openNotificationListenerSettings(): void;
  openCallDirectorySettings(): Promise<void>;
  endCall(): Promise<boolean>;
}

const Native = requireOptionalNativeModule<NativeModule>("VigieProtection");

const unsupported: ProtectionStatus = { callScreening: "unsupported", notificationListener: "unsupported", callDirectory: "unsupported", canEndCall: false };

export const protection = {
  available: !!Native,
  isAndroid: Platform.OS === "android",
  isIos: Platform.OS === "ios",

  /** Transmet le jeton aux services natifs (ils interrogent le serveur même app fermée). */
  setSession(apiUrl: string, token: string | null) {
    Native?.setSession(apiUrl, token);
  },

  async syncDirectory(dir: PhoneDirectory) {
    await Native?.syncDirectory(JSON.stringify(dir));
  },

  /** Appel annoncé par la banque : le filtrage Android le reconnaîtra même hors ligne. */
  setExpectedCall(call: Pick<CertifiedCall, "id" | "callerNumber" | "bankName" | "advisorName" | "agency" | "expiresAt"> | null) {
    Native?.setExpectedCall(call ? JSON.stringify(call) : null);
  },

  setAutoHangup(enabled: boolean) {
    Native?.setAutoHangup(enabled);
  },

  async status(): Promise<ProtectionStatus> {
    return Native ? Native.getStatus() : unsupported;
  },

  async enableCallScreening(): Promise<boolean> {
    return Native ? Native.requestCallScreening() : false;
  },

  openMessageAccess() {
    if (Platform.OS === "android") Native?.openNotificationListenerSettings();
    else void Linking.openSettings();
  },

  async openCallSettings() {
    if (Platform.OS === "ios" && Native) await Native.openCallDirectorySettings();
    else void Linking.openSettings();
  },

  /** Android uniquement : raccroche l'appel en cours. Renvoie false si impossible. */
  async endCall(): Promise<boolean> {
    if (Platform.OS !== "android" || !Native) return false;
    try {
      return await Native.endCall();
    } catch {
      return false;
    }
  },
};
