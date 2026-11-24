import CallKit
import Foundation

/// Annuaire d'appels Vigie (CallKit).
/// - Numéros signalés par la communauté : étiquetés pour que la personne puisse choisir de décrocher.
/// - Numéros officiels des banques : étiquetés « vérifiez dans Vigie », car un escroc peut
///   usurper le vrai numéro d'une banque. L'étiquette invite à appuyer sur
///   « On m'appelle de ma banque » dans l'app.
/// Les données viennent de l'app via l'App Group (directory.json), rechargées à chaque synchronisation.
final class CallDirectoryHandler: CXCallDirectoryProvider {
  private let appGroup = "group.fr.smartfixx.antiarnaque"

  private struct Directory: Decodable {
    struct BankNumber: Decodable { let number: String; let bankName: String }
    struct Reported: Decodable { let number: String; let reports: Int }
    let bankNumbers: [BankNumber]
    let reportedNumbers: [Reported]
  }

  override func beginRequest(with context: CXCallDirectoryExtensionContext) {
    context.delegate = self
    let directory = loadDirectory()

    // CallKit exige des numéros triés par ordre croissant, sans doublon.
    var labels: [CXCallDirectoryPhoneNumber: String] = [:]

    for r in directory?.reportedNumbers ?? [] {
      guard let n = Self.numeric(r.number) else { continue }
      labels[n] = "⚠︎ Numéro signalé (SmartSecure)"
    }
    for b in directory?.bankNumbers ?? [] {
      guard let n = Self.numeric(b.number) else { continue }
      labels[n] = "\(b.bankName) ? Vérifiez dans SmartSecure"
    }

    if context.isIncremental { context.removeAllBlockingEntries(); context.removeAllIdentificationEntries() }
    for n in labels.keys.sorted() { context.addIdentificationEntry(withNextSequentialPhoneNumber: n, label: labels[n]!) }
    context.completeRequest()
  }

  private func loadDirectory() -> Directory? {
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("directory.json"),
          let data = try? Data(contentsOf: url)
    else { return nil }
    return try? JSONDecoder().decode(Directory.self, from: data)
  }

  /// « +33612345678 » → 33612345678 (format attendu par CallKit).
  private static func numeric(_ e164: String) -> CXCallDirectoryPhoneNumber? {
    let digits = e164.filter(\.isNumber)
    return digits.count >= 8 ? CXCallDirectoryPhoneNumber(digits) : nil
  }
}

extension CallDirectoryHandler: CXCallDirectoryExtensionContextDelegate {
  func requestFailed(for extensionContext: CXCallDirectoryExtensionContext, withError error: Error) {}
}
