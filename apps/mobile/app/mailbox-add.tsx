import { useMemo, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api, ApiError } from "@/api";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

const outlookDomains = ["outlook.fr", "outlook.com", "hotmail.fr", "hotmail.com", "live.fr", "live.com", "msn.com"];
const gmailDomains = ["gmail.com", "googlemail.com"];

/**
 * Une seule question d'abord : l'adresse. Vigie reconnaît le fournisseur tout seul
 * et ne demande le mot de passe que si c'est nécessaire.
 */
export default function MailboxAdd() {
  const { palette, tones } = useTheme();
  const { data: providers } = useLoad(() => api.providers());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const kind = useMemo(() => {
    if (!domain.includes(".")) return null;
    if (outlookDomains.includes(domain)) return { type: "outlook" as const, label: "Outlook" };
    if (gmailDomains.includes(domain)) return { type: "gmail" as const, label: "Gmail" };
    const preset = providers?.imapPresets.find((p) => p.domains.includes(domain));
    return preset ? { type: "imap" as const, label: preset.label, preset } : { type: "unknown" as const, label: "" };
  }, [domain, providers]);

  const connectOAuth = async (provider: "outlook" | "gmail") => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.startOAuth(provider);
      const res = await WebBrowser.openAuthSessionAsync(url, "vigie://mailboxes");
      if (res.type === "success") router.replace(res.url.includes("error") ? "/mailboxes?error=1" : "/mailboxes?added=1");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connectImap = async () => {
    if (kind?.type !== "imap") return;
    setBusy(true);
    setError(null);
    try {
      await api.addImap(kind.preset.id, email.trim(), password);
      router.replace("/mailboxes?added=1");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  let footer: React.ReactNode = null;
  if (kind?.type === "outlook") {
    footer = providers?.outlook ? (
      <Button icon="mail" label="Se connecter avec Microsoft" loading={busy} onPress={() => void connectOAuth("outlook")} />
    ) : (
      <Button label="Bientôt disponible" disabled />
    );
  } else if (kind?.type === "gmail") {
    footer = providers?.gmail ? (
      <Button icon="mail" label="Se connecter avec Google" loading={busy} onPress={() => void connectOAuth("gmail")} />
    ) : (
      <Button label="Gmail arrive bientôt" disabled />
    );
  } else if (kind?.type === "imap") {
    footer = <Button icon="check" label={`Connecter ma boîte ${kind.label}`} loading={busy} disabled={!password} onPress={() => void connectImap()} />;
  }

  return (
    <Screen back title="Ajouter une boîte mail" footer={footer}>
      <View style={{ gap: space.lg }}>
        <Field
          label="Votre adresse mail"
          placeholder="prenom.nom@orange.fr"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          autoCorrect={false}
        />

        {kind?.type === "imap" ? (
          <>
            <Card tone="positive" style={{ flexDirection: "row", gap: space.sm, alignItems: "center", padding: space.md }}>
              <Icon name="check" color={tones.positive.fg} />
              <Text color={tones.positive.fg}>Messagerie {kind.label} reconnue</Text>
            </Card>
            <Field
              label={`Mot de passe de votre messagerie ${kind.label}`}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              help={kind.preset.help ?? "Le mot de passe que vous utilisez pour lire vos mails."}
              error={error}
            />
          </>
        ) : null}

        {kind?.type === "outlook" || kind?.type === "gmail" ? (
          <Text color="soft">Une page {kind.label} va s'ouvrir pour autoriser SmartSecure à lire vos nouveaux mails. SmartSecure ne verra jamais votre mot de passe.</Text>
        ) : null}

        {kind?.type === "unknown" ? (
          <Card tone="neutral">
            <Text>Cette messagerie n'est pas encore prise en charge. SmartSecure protège Outlook, Hotmail, Orange, Free, SFR, La Poste et Bouygues.</Text>
          </Card>
        ) : null}

        {error && kind?.type !== "imap" ? <Text color={tones.danger.fg}>{error}</Text> : null}

        <Text variant="caption" color="faint">
          SmartSecure lit vos nouveaux mails uniquement pour repérer les arnaques. Votre mot de passe est chiffré et n'est jamais affiché.
        </Text>
        <View style={{ height: 1, backgroundColor: palette.line }} />
      </View>
    </Screen>
  );
}
