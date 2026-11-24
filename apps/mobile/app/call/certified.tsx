import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatPhone, type CertifiedCall } from "@vigie/shared";
import { api } from "@/api";
import { callState } from "@/callState";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space } from "@/ui/theme";
import { VerdictScreen } from "@/ui/VerdictScreen";

export default function CallCertified() {
  const { id } = useLocalSearchParams<{ id?: string }>();
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
        if (r.certified && r.call) setCall(r.call);
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
      callState.set({ certified: false, call: null, banks: callState.get()?.banks ?? [] });
      router.replace("/call/uncertified");
    }
  };

  return (
    <VerdictScreen
      tone="positive"
      icon="check"
      label="Appel certifié"
      title={confirmed ? "Bon appel !" : "C'est bien votre banque."}
      subtitle={confirmed ? "Votre conseiller sait que vous avez vérifié son appel." : `${call.bankName} a annoncé cet appel dans Vigie.`}
    >
      <Card style={{ gap: space.md, backgroundColor: palette.paper, shadowOpacity: 0 }}>
        <Row label="Votre conseiller" value={call.advisorName} big />
        <Row label="Agence" value={`${call.bankName} · ${call.agency}`} />
        <Row label="Motif de l'appel" value={call.reason} />
        {call.callerNumber ? <Row label="Numéro qui vous appelle" value={formatPhone(call.callerNumber)} /> : null}
      </Card>

      {confirmed ? (
        <Button label="Revenir à l'accueil" onPress={() => router.replace("/")} />
      ) : (
        <>
          <Button variant="positive" size="hero" icon="check" label="C'est bien cette personne" loading={busy} onPress={() => void answer(true)} />
          <Button variant="secondary" label="Ce n'est pas la personne annoncée" onPress={() => void answer(false)} />
        </>
      )}

      <Text color="soft" style={{ marginTop: space.sm }}>
        Même lors d'un appel certifié, votre conseiller ne vous demandera jamais vos codes secrets ni un virement « de sécurité ».
      </Text>
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
