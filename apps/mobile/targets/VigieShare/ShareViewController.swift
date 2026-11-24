import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// Extension « Partager » : l'utilisateur partage un message (texte ou lien) vers Vigie
/// depuis n'importe quelle app, et reçoit le verdict en quelques secondes, sans quitter l'app.
final class ShareViewController: UIViewController {
  private let model = ShareModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    let host = UIHostingController(rootView: ShareView(model: model, close: { [weak self] in
      self?.extensionContext?.completeRequest(returningItems: nil)
    }))
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)
    Task { await model.run(items: extensionContext?.inputItems as? [NSExtensionItem] ?? []) }
  }
}

@MainActor
final class ShareModel: ObservableObject {
  enum State {
    case loading
    case result(verdict: String, explanation: String, advice: String)
    case failed(String)
  }

  @Published var state: State = .loading

  func run(items: [NSExtensionItem]) async {
    let text = await Self.extractText(items)
    guard !text.isEmpty else { state = .failed("Aucun texte à vérifier."); return }
    let defaults = UserDefaults(suiteName: "group.fr.vigie.app")
    guard let api = defaults?.string(forKey: "apiUrl"), let token = defaults?.string(forKey: "token"),
          let url = URL(string: "\(api)/v1/me/scan")
    else { state = .failed("Ouvrez d'abord l'application Vigie pour vous connecter."); return }

    var req = URLRequest(url: url, timeoutInterval: 25)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["source": "share", "text": String(text.prefix(5000))])
    do {
      let (data, response) = try await URLSession.shared.data(for: req)
      guard (response as? HTTPURLResponse)?.statusCode == 200,
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      else { state = .failed("Vigie n'a pas pu vérifier ce message. Réessayez."); return }
      state = .result(
        verdict: json["verdict"] as? String ?? "suspicious",
        explanation: json["explanation"] as? String ?? "",
        advice: json["advice"] as? String ?? ""
      )
    } catch {
      state = .failed("Pas de connexion internet.")
    }
  }

  private static func extractText(_ items: [NSExtensionItem]) async -> String {
    var parts: [String] = []
    for item in items {
      if let t = item.attributedContentText?.string, !t.isEmpty { parts.append(t) }
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
           let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
          parts.append(url.absoluteString)
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                  let t = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
          parts.append(t)
        }
      }
    }
    return parts.joined(separator: "\n")
  }
}

/// Mêmes codes visuels que l'app : couleur + icône + mot pour chaque verdict.
struct ShareView: View {
  @ObservedObject var model: ShareModel
  let close: () -> Void

  private func look(_ verdict: String) -> (Color, String, String) {
    switch verdict {
    case "scam": return (Color(red: 0.70, green: 0.15, blue: 0.12), "xmark.octagon.fill", "Arnaque")
    case "suspicious": return (Color(red: 0.63, green: 0.31, blue: 0.0), "exclamationmark.triangle.fill", "Douteux")
    default: return (Color(red: 0.04, green: 0.42, blue: 0.24), "checkmark.circle.fill", "Sûr")
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      switch model.state {
      case .loading:
        Spacer()
        ProgressView().scaleEffect(1.6).frame(maxWidth: .infinity)
        Text("Vigie vérifie ce message…").font(.title2.bold()).frame(maxWidth: .infinity)
        Spacer()
      case let .result(verdict, explanation, advice):
        let (color, icon, label) = look(verdict)
        Label(label, systemImage: icon).font(.title.bold()).foregroundColor(color)
        Text(explanation).font(.title2.weight(.semibold))
        Text(advice).font(.title3).foregroundColor(.secondary)
        Spacer()
      case let .failed(message):
        Label("Vérification impossible", systemImage: "wifi.exclamationmark").font(.title2.bold())
        Text(message).font(.title3)
        Spacer()
      }
      Button(action: close) {
        Text("Fermer").font(.title2.bold()).frame(maxWidth: .infinity, minHeight: 64)
      }
      .buttonStyle(.borderedProminent)
      .tint(Color(red: 0.17, green: 0.23, blue: 0.83))
    }
    .padding(24)
    .background(Color(red: 0.97, green: 0.96, blue: 0.94))
  }
}
