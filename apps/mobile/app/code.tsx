import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { formatPhone, normalizePhone } from "@vigie/shared";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space, tones } from "@/ui/theme";

export default function Code() {
  const { phone = "" } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.verify(phone, code);
      await signIn(token, user);
      router.replace(user.firstName ? "/" : "/name");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const e164 = normalizePhone(phone);

  return (
    <Screen back title="Entrez le code reçu" footer={<Button label="Valider" disabled={code.length !== 6} loading={busy} onPress={() => void verify()} />}>
      <Text color="soft" style={{ marginBottom: space.lg }}>
        Envoyé par SMS au {e164 ? formatPhone(e164) : phone}.
      </Text>
      <Field
        label="Code à 6 chiffres"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        error={error}
        style={{ letterSpacing: 10, fontSize: 32, textAlign: "center" }}
        autoFocus
      />
      <Card tone="warning" style={{ flexDirection: "row", gap: space.md, marginTop: space.lg }}>
        <Icon name="alert" color={tones.warning.fg} />
        <Text color={tones.warning.fg} style={{ flex: 1 }}>
          Ce code est secret. Ne le donnez jamais à personne, même à quelqu'un qui dit travailler pour SmartSecure ou votre banque.
        </Text>
      </Card>
      <Button
        variant="ghost"
        label={resent ? "Code renvoyé" : "Je n'ai pas reçu le code"}
        disabled={resent}
        onPress={() => void api.startAuth(phone).then(() => setResent(true), (e: Error) => setError(e.message))}
        style={{ marginTop: space.md }}
      />
    </Screen>
  );
}
