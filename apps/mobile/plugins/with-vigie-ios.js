// Ajoute le domaine associé « messagefilter: » à l'app principale (Apple le demande aussi
// côté app pour autoriser l'extension de filtrage SMS à interroger le serveur Vigie).
const { withEntitlementsPlist } = require("expo/config-plugins");

module.exports = function withVigieIos(config, { apiHost }) {
  return withEntitlementsPlist(config, (cfg) => {
    const key = "com.apple.developer.associated-domains";
    const domains = new Set(cfg.modResults[key] ?? []);
    domains.add(`messagefilter:${apiHost}`);
    cfg.modResults[key] = [...domains];
    return cfg;
  });
};
