import CallKit
import Foundation

/// Annuaire d'appels Vigie (CallKit).
/// - Numéros signalés par la communauté : étiquetés pour que la personne puisse choisir de décrocher.
/// - Numéros officiels des banques : étiquetés « vérifiez dans Vigie », car un escroc peut
///   usurper le vrai numéro d'une banque. L'étiquette invite à appuyer sur
///   « On m'appelle de ma banque » dans l'app.
/// - Appel annoncé (expected.json) : étiquette temporaire « ✓ Certifié <Banque> · HH:mm » sur la ligne annoncée
///   tant que l'annonce n'est pas expirée (HH:mm = fin de validité). Elle l'emporte sur toute autre liste.
///   Limite : le serveur envoie un push silencieux « certified_call_ended » à l'échéance, à la consommation, au refus
///   et à la fin par la banque. S'il n'est pas délivré (app fermée de force, réseau, limites iOS), l'étiquette subsiste
///   jusqu'à la prochaine ouverture de l'app, d'où l'heure de fin « HH:mm » dans le libellé. L'extension ignore de toute
///   façon une annonce dont la fin est passée au prochain rechargement.
///   Une annonce expirée est ignorée ET supprimée du fichier à chaque rechargement.
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
      labels[n] = Self.limit("⚠ \(b.bankName), aucun appel annoncé", 40)
    }
    // Annonce valide : gagne sur les listes ci-dessus (même clé du dictionnaire, donc sans doublon).
    if let e = loadValidExpected(), let n = Self.numeric(e.callerNumber) {
      labels[n] = Self.certifiedLabel(bank: e.bankName, until: e.expiry)
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

  private struct Expected: Decodable {
    let callerNumber: String
    let bankName: String
    let expiresAt: String
  }

  /// Lit expected.json. Si l'annonce est expirée (ou illisible), le fichier est supprimé et rien n'est renvoyé.
  /// Une fin de validité à plus de 11 min est refusée (fenêtre serveur : 10 min).
  private func loadValidExpected() -> (callerNumber: String, bankName: String, expiry: Date)? {
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?.appendingPathComponent("expected.json"),
          let data = try? Data(contentsOf: url)
    else { return nil }
    if let e = try? JSONDecoder().decode(Expected.self, from: data), let expiry = Self.parseDate(e.expiresAt),
       expiry > Date(), expiry < Date().addingTimeInterval(11 * 60) {
      return (e.callerNumber, e.bankName, expiry)
    }
    try? FileManager.default.removeItem(at: url)
    return nil
  }

  /// « ✓ Certifié <Banque> · HH:mm », 40 caractères au plus : le nom de la banque est tronqué si besoin.
  static func certifiedLabel(bank: String, until: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "fr_FR")
    f.dateFormat = "HH:mm"
    let prefix = "✓ Certifié "
    let suffix = " · " + f.string(from: until)
    return prefix + limit(bank, 40 - prefix.count - suffix.count) + suffix
  }

  static func limit(_ s: String, _ max: Int) -> String {
    s.count <= max ? s : String(s.prefix(max - 1)) + "…"
  }

  private static func parseDate(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: s) { return d }
    f.formatOptions = [.withInternetDateTime]
    return f.date(from: s)
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
