import { useState } from "react";
import { router } from "expo-router";
import { normalizePhone } from "@vigie/shared";
import { api } from "@/api";
import { Button } from "@/ui/Button";
import { Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = !!normalizePhone(phone)?.startsWith("+");

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.startAuth(phone);
      router.push({ pathname: "/code", params: { phone } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back title="Votre numéro de portable" footer={<Button label="Recevoir mon code" disabled={!valid} loading={busy} onPress={() => void send()} />}>
      <Text color="soft" style={{ marginBottom: space.lg }}>
        SmartSecure vous envoie un code par SMS pour vérifier que ce téléphone est bien le vôtre.
      </Text>
      <Field
        label="Numéro de portable"
        placeholder="06 12 34 56 78"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        error={error}
        autoFocus
      />
    </Screen>
  );
}
