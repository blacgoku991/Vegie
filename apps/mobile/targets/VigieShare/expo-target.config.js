// Extension « Partager » : vérifier n'importe quel message (WhatsApp, Mail, Messages…).
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "share",
  name: "VigieShare",
  displayName: "SmartSecure",
  bundleIdentifier: ".share",
  deploymentTarget: "16.0",
  frameworks: ["SwiftUI", "UniformTypeIdentifiers"],
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
