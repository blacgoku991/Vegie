// Filtre SMS iOS (IdentityLookup) : SMS d'expéditeurs inconnus uniquement.
// Le serveur est interrogé de façon anonyme par iOS (domaine associé « messagefilter: »).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "message-filter",
  name: "VigieMessageFilter",
  displayName: "SmartSecure",
  bundleIdentifier: ".messagefilter",
  deploymentTarget: "16.0",
  frameworks: ["IdentityLookup"],
  entitlements: {
    "com.apple.developer.associated-domains": [`messagefilter:${new URL(apiUrl).host}`],
  },
});
