import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatPhone, type CertifiedCall } from "@vigie/shared";
import { api } from "@/api";
import { callState } from "@/callState";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space, tones } from "@/ui/theme";
import { VerdictScreen } from "@/ui/VerdictScreen";

export default function CallCertified() {
  const { id, verified: verifiedParam } = useLocalSearchParams<{ id?: string; verified?: string }>();
  // « Vérifié » : l'appareil a vu le numéro de l'appelant et il correspond à celui annoncé (Android uniquement).
  // Sinon (iPhone, bouton manuel), on sait seulement que la banque avait prévu un appel : on n'identifie personne.
  // Le vert n'est accepté que si l'écran a été ouvert avec verified=1 (notification Android du filtrage),
  // ou si l'état partagé concerne exactement cette annonce. Tout état périmé reste orange.
  const shared = callState.get();
  const verified = verifiedParam === "1" || (!!id && shared?.certified === true && shared.call?.id === id);
  const [call, setCall] = useState<CertifiedCall | null>(() => {
    const s = callState.get();
    return s?.call && (!id || s.call.id === id) ? s.call : null;
  });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ouvert depuis la notification : on recharge, et on vérifie que l'appel est toujours valable.
  useEffect(() => {
    if (call) return;
    void api
      .callCheck()
      .then((r) => {
        if (r.call && r.match !== "number_mismatch") setCall(r.call);
        else {
          callState.set(r);
          router.replace("/call/uncertified");
        }
      })
      .catch(() => router.replace("/call/uncertified"));
  }, [call]);

  if (!call) return <View style={{ flex: 1, backgroundColor: palette.paper }} />;

  const answer = async (ok: boolean) => {
    setBusy(true);
    await api.confirmCall(call.id, ok).catch(() => {});
    if (ok) {
      setConfirmed(true);
      setBusy(false);
    } else {
      callState.set({ certified: false, match: "number_unknown", call: null, banks: callState.get()?.banks ?? [] });
      router.replace("/call/uncertified");
    }
  };

  return (
    <VerdictScreen
      tone={verified ? "positive" : "warning"}
      icon={verified ? "check" : "alert"}
      label={verified ? "Appel certifié" : "Appel annoncé"}
      title={confirmed ? "Merci." : verified ? "Cet appel vient du numéro annoncé." : "Votre agence avait prévu de vous appeler."}
      subtitle={
        confirmed
          ? "Votre conseiller sait que vous avez vu son annonce."
          : verified
            ? `${call.advisorName} · ${call.bankName} · ${call.agency}`
            : `${call.advisorName} · ${call.bankName} · ${call.agency}. SmartSecure ne peut pas voir qui est au bout du fil.`
      }
    >
      <Card tone="warning" style={{ gap: space.sm }}>
        <Text variant="bodyStrong" color={tones.warning.fg}>
          Même votre banque ne vous demandera jamais un code, un mot de passe ou un virement.
        </Text>
        <Text color={tones.warning.fg}>Si on vous le demande : raccrochez et rappelez votre banque.</Text>
      </Card>

      <Card style={{ gap: space.md, backgroundColor: palette.paper, shadowOpacity: 0 }}>
        <Row label="Votre conseiller" value={call.advisorName} big />
        <Row label="Agence" value={`${call.bankName} · ${call.agency}`} />
        <Row label="Motif de l'appel" value={call.reason} />
        {call.callerNumber ? <Row label="Numéro annoncé par votre agence" value={formatPhone(call.callerNumber)} /> : null}
      </Card>

      {confirmed ? (
        <Button label="Revenir à l'accueil" onPress={() => router.replace("/")} />
      ) : (
        <>
          <Button variant="positive" size="hero" icon="check" label="Je parle à cette personne" loading={busy} onPress={() => void answer(true)} />
          <Button variant="secondary" label="Ce n'est pas la personne annoncée" onPress={() => void answer(false)} />
        </>
      )}
    </VerdictScreen>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" color="faint">
        {label}
      </Text>
      <Text variant={big ? "title" : "bodyStrong"}>{value}</Text>
    </View>
  );
}
