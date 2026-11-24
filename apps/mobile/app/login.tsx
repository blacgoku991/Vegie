import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { normalizePhone } from "@vigie/shared";
import { api, ApiError } from "@/api";
import { groupPhoneInput } from "@/format";
import { RESEND_DELAY, useCountdown } from "@/useCountdown";
import { Button } from "@/ui/Button";
import { Card, Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

export default function Login() {
  const { invite, activate } = useLocalSearchParams<{ invite?: string; activate?: string }>();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wait = useCountdown();
  const valid = !!normalizePhone(phone)?.startsWith("+");

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.startAuth(phone);
      router.push({ pathname: "/code", params: { phone, invite, activate } });
    } catch (err) {
      // « Un code vient d'être envoyé » n'est pas une faute de saisie : on propose de saisir le code déjà reçu.
      if (err instanceof ApiError && err.code === "too_soon") wait.start(RESEND_DELAY);
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Votre numéro de portable" footer={<Button label="Recevoir mon code" disabled={!valid || wait.left > 0} loading={busy} onPress={() => void send()} />}>
      <Text color="soft" style={{ marginBottom: space.lg }}>
        SmartSecure vous envoie un code par SMS pour vérifier que ce téléphone est bien le vôtre.
      </Text>
      <Field
        label="Numéro de portable"
        numeric
        placeholder="06 12 34 56 78"
        value={phone}
        onChangeText={(v) => setPhone(groupPhoneInput(v))}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={error}
        autoFocus
      />
      {wait.left > 0 ? (
        <Card style={{ gap: space.md, marginTop: space.lg }}>
          <Text accessibilityLiveRegion="polite">
            Un code vient déjà d’être envoyé à ce numéro. Vous pourrez en demander un autre dans {wait.left} s.
          </Text>
          <Button
            variant="secondary"
            label="Saisir le code déjà reçu"
            onPress={() => router.push({ pathname: "/code", params: { phone, invite, activate, wait: String(wait.left) } })}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
