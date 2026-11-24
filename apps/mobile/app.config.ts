import type { ExpoConfig } from "expo/config";

const BUNDLE_ID = "fr.vigie.app";
const APP_GROUP = `group.${BUNDLE_ID}`;
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const apiHost = new URL(apiUrl).host;

const config: ExpoConfig = {
  name: "Vigie",
  slug: "vigie",
  scheme: "vigie",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  backgroundColor: "#F7F5F0",
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
    },
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#F7F5F0" },
    // ANSWER_PHONE_CALLS : bouton « Raccrocher » pendant un appel non certifié.
    permissions: ["ANSWER_PHONE_CALLS", "POST_NOTIFICATIONS"],
    blockedPermissions: ["android.permission.READ_CONTACTS", "android.permission.READ_CALL_LOG", "android.permission.READ_SMS"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { color: "#2B3AD4", defaultChannel: "alerts" }],
    ["expo-splash-screen", { backgroundColor: "#F7F5F0", image: "./assets/splash.png", imageWidth: 160 }],
    "@bacons/apple-targets",
    ["./plugins/with-vigie-ios.js", { apiHost }],
  ],
  extra: {
    apiUrl,
    appGroup: APP_GROUP,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
      build: {
        experimental: {
          ios: {
            appExtensions: [
              { targetName: "VigieMessageFilter", bundleIdentifier: `${BUNDLE_ID}.messagefilter`, entitlements: { "com.apple.developer.associated-domains": [`messagefilter:${apiHost}`] } },
              { targetName: "VigieCallDirectory", bundleIdentifier: `${BUNDLE_ID}.calldirectory`, entitlements: { "com.apple.security.application-groups": [APP_GROUP] } },
              { targetName: "VigieShare", bundleIdentifier: `${BUNDLE_ID}.share`, entitlements: { "com.apple.security.application-groups": [APP_GROUP] } },
            ],
          },
        },
      },
    },
  },
};

export default config;
