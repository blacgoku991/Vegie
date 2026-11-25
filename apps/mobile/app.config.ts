import type { ExpoConfig } from "expo/config";

// Identifiant définitif (Apple et Play Store), indépendant du nom commercial ; même préfixe que les autres outils
// SmartFixx (fr.smartfixx.smartremote). Les extensions Swift reprennent ces valeurs en dur.
const BUNDLE_ID = "fr.smartfixx.antiarnaque";
const APP_GROUP = `group.${BUNDLE_ID}`;
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiHost = new URL(apiUrl).host;

const config: ExpoConfig = {
  name: "SmartSecure",
  slug: "vigie",
  // smartsecure://join?code=… : lien d'invitation du conseiller (QR code de la console).
  scheme: ["smartsecure", "vigie"],
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  icon: "./assets/icon.png",
  backgroundColor: "#07070C",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    appleTeamId: process.env.APPLE_TEAM_ID,
    entitlements: {
      // Notifications « urgentes » : l'annonce d'un appel certifié passe les modes Concentration.
      "com.apple.developer.usernotifications.time-sensitive": true,
      // Partage du jeton et de l'annuaire avec les extensions (filtre SMS, annuaire d'appels, partage).
      "com.apple.security.application-groups": [APP_GROUP],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Push silencieux « appel annoncé / terminé » : met à jour l'étiquette de l'écran d'appel app fermée.
      UIBackgroundModes: ["remote-notification"],
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundImage: "./assets/adaptive-icon-background.png", backgroundColor: "#B23CF5" },
    // ANSWER_PHONE_CALLS : bouton « Raccrocher » pendant un appel non certifié.
    // SYSTEM_ALERT_WINDOW : grand popup par-dessus l'écran d'appel (optionnel, accordé par l'utilisateur).
    permissions: ["ANSWER_PHONE_CALLS", "POST_NOTIFICATIONS", "SYSTEM_ALERT_WINDOW"],
    blockedPermissions: ["android.permission.READ_CALL_LOG", "android.permission.READ_SMS"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { color: "#6A4DFF", defaultChannel: "alerts" }],
    ["expo-splash-screen", { backgroundColor: "#07070C", image: "./assets/splash.png", imageWidth: 160 }],
    "@bacons/apple-targets",
    ["./plugins/with-vigie-ios.js", { apiHost }],
  ],
  extra: {
    apiUrl,
    appGroup: APP_GROUP,
    eas: {
      // Projet Expo « vigie » (compte blsckgolu). Surchargeable par EAS_PROJECT_ID.
      projectId: process.env.EAS_PROJECT_ID ?? "ad30c03a-7e67-45c4-b712-633694be77f3",
      build: {
        experimental: {
          ios: {
            appExtensions: [
              { targetName: "VigieMessageFilter", bundleIdentifier: `${BUNDLE_ID}.messagefilter`, entitlements: { "com.apple.developer.associated-domains": [`messagefilter:${apiHost}`] } },
              { targetName: "VigieCallDirectory", bundleIdentifier: `${BUNDLE_ID}.calldirectory`, entitlements: { "com.apple.security.application-groups": [APP_GROUP] } },
              { targetName: "VigieNotificationService", bundleIdentifier: `${BUNDLE_ID}.notificationservice`, entitlements: { "com.apple.security.application-groups": [APP_GROUP] } },
              { targetName: "VigieShare", bundleIdentifier: `${BUNDLE_ID}.share`, entitlements: { "com.apple.security.application-groups": [APP_GROUP] } },
            ],
          },
        },
      },
    },
  },
};

export default config;
