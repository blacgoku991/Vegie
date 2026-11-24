// Annuaire d'appels iOS (CallKit) : étiquette les numéros signalés et ceux des banques.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "call-directory",
  name: "VigieCallDirectory",
  displayName: "SmartSecure",
  bundleIdentifier: ".calldirectory",
  deploymentTarget: "15.1",
  frameworks: ["CallKit"],
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
