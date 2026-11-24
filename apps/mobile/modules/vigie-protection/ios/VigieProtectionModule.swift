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

    // Spécifiques Android : sans effet sur iOS.
    Function("setExpectedCall") { (_: String?) in }
    Function("setAutoHangup") { (_: Bool) in }
    Function("openNotificationListenerSettings") {}
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
        ])
      }
    }

    /// Ouvre directement le réglage « Blocage et identification des appels » (iOS 13.4+).
    AsyncFunction("openCallDirectorySettings") { (promise: Promise) in
      CXCallDirectoryManager.sharedInstance.openSettings { _ in promise.resolve(nil) }
    }
  }
}
