import { useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { formatPhone, normalizePhone } from "@vigie/shared";
import { api, ApiError } from "@/api";
import { RESEND_DELAY, useCountdown } from "@/useCountdown";
import { useAuth } from "@/auth";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, CodeBoxes, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

// Sans numéro (ouverture directe, ou redirection par défaut d'expo-router quand on est déconnecté),
// cet écran n'a pas de sens : on repart de l'accueil.
export default function Code() {
  const { phone = "", invite, activate, wait } = useLocalSearchParams<{ phone: string; invite?: string; activate?: string; wait?: string }>();
  if (!phone) return <Redirect href="/welcome" />;
  return <CodeForm phone={phone} invite={invite} activate={activate} wait={Number(wait) > 0 ? Math.min(Number(wait), RESEND_DELAY) : RESEND_DELAY} />;
}

function CodeForm({ phone, invite, activate, wait: initialWait }: { phone: string; invite?: string; activate?: string; wait: number }) {
  const { tones } = useTheme();
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const resend = useCountdown(initialWait);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api.verify(phone, code);
      await signIn(token, user);
      if (activate) {
        // Lien d'activation de la banque : relié seulement si ce compte porte bien le numéro de l'activation.
        const linked = await api.activateLink(activate).then(() => true, () => false);
        router.replace(linked ? "/banks" : user.firstName ? "/" : "/name");
      } else if (invite && /^\d{6}$/.test(invite)) router.dismissTo({ pathname: "/join", params: { code: invite } });
      else router.replace(user.firstName ? "/" : "/name");
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
      <CodeBoxes label="Code à 6 chiffres" value={code} onChange={setCode} error={error} autoFocus />
      <Card style={{ flexDirection: "row", gap: 12, marginTop: space.lg }}>
        <Icon name="alert" size={20} color={tones.warning.fg} />
        <Text variant="caption" color="soft" style={{ flex: 1 }}>
          Ce code est secret. Ne le donnez jamais à personne, même à quelqu'un qui dit travailler pour SmartSecure ou votre banque.
        </Text>
      </Card>
      {notice ? <Text accessibilityLiveRegion="polite" color="soft" style={{ marginTop: space.md }}>{notice}</Text> : null}
      <Button
        variant="ghost"
        label={resend.left > 0 ? `Renvoyer le code dans ${resend.left} s` : "Je n'ai pas reçu le code"}
        disabled={resend.left > 0}
        onPress={() => {
          setError(null);
          void api.startAuth(phone).then(
            () => { resend.start(RESEND_DELAY); setNotice("Un nouveau code vient d’être envoyé."); },
            (e: Error) => {
              if (e instanceof ApiError && e.code === "too_soon") { resend.start(RESEND_DELAY); setNotice("Un code vient d’être envoyé. Saisissez-le ci-dessus."); }
              else setError(e.message);
            },
          );
        }}
        style={{ marginTop: space.md }}
      />
    </Screen>
  );
}
