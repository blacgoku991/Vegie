import { useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatPhone, normalizePhone, type Bank } from "@vigie/shared";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, CodeBoxes, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

/**
 * Liaison à la banque par code d'invitation (saisi, ou venu du lien smartsecure://join?code=…).
 * Le code est seulement pré-rempli : le client le valide lui-même, jamais de liaison automatique à l'ouverture d'un lien.
 */
export default function Join() {
  const { status, me } = useAuth();
  const { tones } = useTheme();
  const { code: initial = "" } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => String(initial).replace(/\D/g, "").slice(0, 6));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<Bank | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinBank(code);
      setBank(res.bank);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (status !== "signedIn") {
    if (!code) return <Screen title="Bienvenue"><Button label="Commencer" onPress={() => router.replace("/welcome")} /></Screen>;
    return <Screen title="Invitation de votre banque">
      <Text color="soft">Connectez-vous avec le numéro de téléphone communiqué à votre conseiller. Vous pourrez ensuite valider son invitation.</Text>
      <Button label="Me connecter" style={{ marginTop: space.lg }} onPress={() => router.push({ pathname: "/login", params: { invite: code } })} />
    </Screen>;
  }

  if (bank) {
    return (
      <Screen title="C'est fait" footer={<Button label="Terminer" onPress={() => router.replace("/banks")} />}>
        <Card tone="positive" style={{ gap: space.sm }}>
          <Icon name="check" color={tones.positive.fg} />
          <Text variant="heading" color={tones.positive.fg}>
            {bank.name} est relié à SmartSecure.
          </Text>
          <Text color={tones.positive.fg}>Votre conseiller peut maintenant annoncer ses appels dans votre application.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen back title="Code de votre conseiller" footer={<Button label="Valider" disabled={code.length !== 6} loading={busy} onPress={() => void submit()} />}>
      <View style={{ gap: space.lg }}>
        <Text color="soft">Votre conseiller vous a donné un code à 6 chiffres, ou un QR code à scanner avec l'appareil photo.</Text>
        <CodeBoxes label="Code donné par votre conseiller" value={code} onChange={setCode} error={error} autoFocus />
        <Text variant="caption" color="faint">
          Le code est valable 15 minutes, une seule fois, pour le numéro {me?.phone ? (normalizePhone(me.phone) ? formatPhone(normalizePhone(me.phone)!) : me.phone) : "indiqué à votre conseiller"}.
        </Text>
      </View>
    </Screen>
  );
}
