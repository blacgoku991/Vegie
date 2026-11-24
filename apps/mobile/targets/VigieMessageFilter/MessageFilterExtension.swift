import IdentityLookup

/// Filtre SMS de Vigie.
/// iOS ne lui transmet que les SMS d'expéditeurs inconnus (jamais les contacts ni iMessage).
/// 1. Règles locales immédiates (aucune donnée ne sort du téléphone).
/// 2. Sinon, iOS interroge anonymement le serveur Vigie (ILMessageFilterExtensionNetworkURL).
/// Un SMS jugé « arnaque » est rangé dans « Indésirables », loin des messages de la personne.
/// L'extension ne peut pas envoyer de notification : c'est une limite d'iOS.
final class MessageFilterExtension: ILMessageFilterExtension {}

extension MessageFilterExtension: ILMessageFilterQueryHandling {
  func handle(
    _ queryRequest: ILMessageFilterQueryRequest,
    context: ILMessageFilterExtensionContext,
    completion: @escaping (ILMessageFilterQueryResponse) -> Void
  ) {
    let body = queryRequest.messageBody ?? ""

    if LocalRules.isObviousScam(body) {
      completion(Self.response(.junk))
      return
    }
    guard LocalRules.worthChecking(body) else {
      completion(Self.response(.none))
      return
    }

    context.deferQueryRequestToNetwork { networkResponse, error in
      guard error == nil,
            let data = networkResponse?.data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let action = json["action"] as? String
      else {
        completion(Self.response(.none))
        return
      }
      completion(Self.response(action == "junk" ? .junk : .none))
    }
  }

  private static func response(_ action: ILMessageFilterAction) -> ILMessageFilterQueryResponse {
    let r = ILMessageFilterQueryResponse()
    r.action = action
    return r
  }
}

/// Règles hors ligne, volontairement prudentes (aucun faux positif sur un SMS ordinaire).
enum LocalRules {
  private static func matches(_ text: String, _ pattern: String) -> Bool {
    text.range(of: pattern, options: [.regularExpression, .caseInsensitive, .diacriticInsensitive]) != nil
  }

  /// Un lien, un numéro ou une demande d'argent : à faire vérifier par le serveur.
  static func worthChecking(_ text: String) -> Bool {
    matches(text, #"(https?://|www\.|\b[a-z0-9-]+\.(fr|com|net|info|xyz|top|online|site|shop|live|app|cc|icu|vip|link|click)\b)"#)
      || matches(text, #"(€|virement|paiement|payer|regler|frais|carte bancaire|amende|colis|nouveau numero)"#)
  }

  /// Combinaisons quasi certaines : petits frais + lien, ou demande de code à transmettre.
  static func isObviousScam(_ text: String) -> Bool {
    let hasLink = matches(text, #"(https?://|\b[a-z0-9-]+\.(xyz|top|online|site|shop|live|icu|vip|click|info)\b)"#)
    let smallFee = matches(text, #"frais (de )?(livraison|reexpedition|douane|port)|\b[0-4][,.]\d{2} ?(€|eur)"#)
    let askCode = matches(text, #"(communiquez|donnez|transmettez)[- ]?(nous|moi)?[^.]{0,25}code"#)
    return (hasLink && smallFee) || askCode
  }
}
