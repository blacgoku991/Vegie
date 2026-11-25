import CallKit
import ExpoModulesCore
import UIKit

/// Groupe d'apps partagé avec les extensions (doit correspondre à app.config.ts).
let vigieAppGroup = "group.fr.smartfixx.antiarnaque"
let vigieCallDirectoryId = "fr.smartfixx.antiarnaque.calldirectory"

/// Pont JavaScript ⇄ iOS : partage la session et l'annuaire avec les extensions
/// (annuaire d'appels, extension Partager) via l'App Group.
public class VigieProtectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VigieProtection")

    Function("setSession") { (apiUrl: String, token: String?) in
      let defaults = UserDefaults(suiteName: vigieAppGroup)
      defaults?.set(apiUrl, forKey: "apiUrl")
      defaults?.set(token, forKey: "token")
    }

    AsyncFunction("syncDirectory") { (json: String) in
      guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: vigieAppGroup) else { return }
      try json.data(using: .utf8)?.write(to: dir.appendingPathComponent("directory.json"), options: .atomic)
      CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: vigieCallDirectoryId) { _ in }
    }

    /// Appel annoncé : écrit expected.json (identifiant, numéro E.164, banque, fin de validité) puis recharge l'annuaire d'appels,
    /// qui étiquette ce numéro « ✓ Certifié … » sur l'écran d'appel natif. `nil` retire l'annonce.
    /// Une annonce expirée ou invalide n'est jamais écrite (et supprime l'éventuelle précédente).
    Function("setExpectedCall") { (json: String?) in
      Self.writeExpected(json)
    }

    /// Fin d'annonce : retire l'annonce seulement si l'identifiant stocké est celui de `callId`.
    Function("clearExpectedCall") { (callId: String) in
      guard let url = Self.expectedURL(), let data = try? Data(contentsOf: url),
            let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            o["id"] as? String == callId
      else { return }
      try? FileManager.default.removeItem(at: url)
      CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: vigieCallDirectoryId) { _ in }
    }

    /// Resynchronisation au premier plan : retire une annonce expirée de expected.json et recharge l'annuaire.
    Function("refreshExpectedCall") {
      guard let url = Self.expectedURL() else { return }
      if let data = try? Data(contentsOf: url), Self.validExpected(data) { return }
      if FileManager.default.fileExists(atPath: url.path) {
        try? FileManager.default.removeItem(at: url)
        CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: vigieCallDirectoryId) { _ in }
      }
    }

    // Spécifiques Android : sans effet sur iOS.
    Function("setAutoHangup") { (_: Bool) in }
    Function("setUnknownCallBanner") { (_: Bool) in }
    Function("setContactCallBanner") { (_: Bool) in }
    Function("openNotificationListenerSettings") {}
    Function("requestOverlay") {}
    Function("requestContacts") {}
    Function("requestPhonePermissions") {}
    AsyncFunction("requestCallScreening") { () -> Bool in false }
    AsyncFunction("endCall") { () -> Bool in false }

    AsyncFunction("getStatus") { (promise: Promise) in
      CXCallDirectoryManager.sharedInstance.getEnabledStatusForExtension(withIdentifier: vigieCallDirectoryId) { status, _ in
        let state: String
        switch status {
        case .enabled: state = "enabled"
        case .disabled: state = "disabled"
        default: state = "unknown"
        }
        promise.resolve([
          "callScreening": "unsupported",
          "notificationListener": "unsupported",
          "callDirectory": state,
          "canEndCall": false,
          "overlay": "unsupported",
          "phoneState": "unsupported",
          "contacts": "unsupported",
        ])
      }
    }

    /// Ouvre directement le réglage « Blocage et identification des appels » (iOS 13.4+).
    AsyncFunction("openCallDirectorySettings") { (promise: Promise) in
      CXCallDirectoryManager.sharedInstance.openSettings { _ in promise.resolve(nil) }
    }
  }

  private static func expectedURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: vigieAppGroup)?.appendingPathComponent("expected.json")
  }

  private static func parseDate(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
  }

  /// Annonce exploitable : numéro, banque et fin de validité future (au plus 11 min, fenêtre serveur de 10 min).
  private static func validExpected(_ data: Data) -> Bool {
    guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = o["id"] as? String, !id.isEmpty,
          let number = o["callerNumber"] as? String, number.hasPrefix("+"),
          let bank = o["bankName"] as? String, !bank.isEmpty,
          let exp = o["expiresAt"] as? String, let expiry = parseDate(exp)
    else { return false }
    return expiry > Date() && expiry < Date().addingTimeInterval(11 * 60)
  }

  private static func writeExpected(_ json: String?) {
    guard let url = expectedURL() else { return }
    if let json, let data = json.data(using: .utf8), validExpected(data),
       let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      // On ne garde que les quatre champs utiles (pas de nom de conseiller ni de motif dans l'App Group).
      let kept: [String: Any] = ["id": o["id"]!, "callerNumber": o["callerNumber"]!, "bankName": o["bankName"]!, "expiresAt": o["expiresAt"]!]
      if let bytes = try? JSONSerialization.data(withJSONObject: kept) { try? bytes.write(to: url, options: .atomic) }
    } else {
      try? FileManager.default.removeItem(at: url)
    }
    CXCallDirectoryManager.sharedInstance.reloadExtension(withIdentifier: vigieCallDirectoryId) { _ in }
  }
}
