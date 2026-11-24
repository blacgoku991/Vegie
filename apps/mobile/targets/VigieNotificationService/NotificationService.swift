import CallKit
import Foundation
import UserNotifications

/// Notification Service Extension : reçoit le push « certified_call » (mutable-content) avant son affichage,
/// écrit `expected.json` dans l'App Group et tente de recharger l'annuaire d'appels.
///
/// À VÉRIFIER SUR UN VRAI iPHONE : quand l'app a été fermée de force (balayée), iOS n'exécute plus ses tâches
/// d'arrière-plan ; cette extension tourne quand même pour une notification affichée, mais iOS peut refuser
/// `reloadExtension` depuis une extension. Si le rechargement échoue, l'étiquette n'apparaît qu'au prochain
/// lancement de l'app (resynchronisation au premier plan). Sans étiquette : jamais de vert, le comportement reste sûr.
///
/// Sécurité : l'annonce est ignorée si elle est expirée ou si sa fin de validité dépasse 11 min (fenêtre serveur : 10 min).
final class NotificationService: UNNotificationServiceExtension {
  private let appGroup = "group.fr.smartfixx.antiarnaque"
  private let callDirectoryId = "fr.smartfixx.antiarnaque.calldirectory"
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    self.contentHandler = contentHandler
    bestAttempt = request.content.mutableCopy() as? UNMutableNotificationContent
    guard let data = Self.payload(request.content.userInfo), data["type"] as? String == "certified_call",
          let callId = data["callId"] as? String, !callId.isEmpty,
          let number = data["callerNumber"] as? String,
          let bank = data["bankName"] as? String,
          let expiresAt = data["expiresAt"] as? String,
          let expiry = Self.parseDate(expiresAt),
          expiry > Date(), expiry < Date().addingTimeInterval(11 * 60),
          let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    else { return finish() }

    let json: [String: Any] = ["id": callId, "callerNumber": number, "bankName": bank, "expiresAt": expiresAt]
    guard let bytes = try? JSONSerialization.data(withJSONObject: json) else { return finish() }
    try? bytes.write(to: dir.appendingPathComponent("expected.json"), options: .atomic)
    CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: callDirectoryId) { [weak self] _ in
      self?.finish()
    }
  }

  override func serviceExtensionTimeWillExpire() { finish() }

  private func finish() {
    guard let handler = contentHandler, let content = bestAttempt else { return }
    contentHandler = nil
    handler(content)
  }

  /// Expo place les données personnalisées sous la clé « body » ; repli sur la racine du payload.
  private static func payload(_ userInfo: [AnyHashable: Any]) -> [String: Any]? {
    if let body = userInfo["body"] as? [String: Any] { return body }
    if let str = userInfo["body"] as? String, let d = str.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { return o }
    return userInfo as? [String: Any]
  }

  private static func parseDate(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
  }
}
