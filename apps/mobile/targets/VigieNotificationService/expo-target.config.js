// Extension de service de notification iOS : à la réception du push « appel certifié », écrit l'annonce
// dans l'App Group et demande le rechargement de l'annuaire d'appels (étiquette sur l'écran d'appel).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "notification-service",
  name: "VigieNotificationService",
  displayName: "SmartSecure",
  bundleIdentifier: ".notificationservice",
  deploymentTarget: "15.1",
  frameworks: ["CallKit", "UserNotifications"],
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
