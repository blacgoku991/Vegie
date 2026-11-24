import { useCallback, useState } from "react";
import { AppState, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { formatPhone, type CertifiedCall } from "@vigie/shared";
import { api } from "@/api";
import { callState } from "@/callState";
import { Button, RoundAction } from "@/ui/Button";
import { Group, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { controls, space } from "@/ui/theme";
import { CallActions, VerdictScreen } from "@/ui/VerdictScreen";

export default function CallCertified() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [call, setCall] = useState<CertifiedCall | null>(null);
  const [verified, setVerified] = useState(false);
  const [banks, setBanks] = useState<NonNullable<ReturnType<typeof callState.get>>["banks"]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (confirmed) return;
    let alive = true;
    let sequence = 0;
    let expiry: ReturnType<typeof setTimeout>;
    // Seul le résultat du contrôle précédent sur cet appareil fournit la correspondance.
    const match = callState.get();
    callState.set(null);
    const unavailable = (offline: boolean) => {
      callState.set({ certified: false, match: "number_unknown", call: null, banks: [], offline });
      router.replace("/call/uncertified");
    };
    const refresh = async () => {
      const current = ++sequence;
      try {
        const result = await api.callCheck();
        if (!alive || current !== sequence) return;
        if (!id || !result.call || result.call.id !== id) return unavailable(false);
        const remaining = Date.parse(result.call.expiresAt) - Date.now();
        if (remaining <= 0) return unavailable(false);
        setCall(result.call);
        setBanks(result.banks);
        setVerified(match?.certified === true && match.call?.id === id);
        clearTimeout(expiry);
        expiry = setTimeout(() => { if (alive) unavailable(false); }, remaining);
      } catch { if (alive && current === sequence) unavailable(true); }
    };
    setCall(null);
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
      else { sequence++; setCall(null); }
    });
    return () => { alive = false; clearTimeout(expiry); clearInterval(timer); sub.remove(); };
  }, [id, confirmed]));

  const answer = async (accepted: boolean) => {
    if (!call || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.confirmCall(call.id, accepted);
      if (accepted) setConfirmed(true);
      else {
        callState.set({ certified: false, match: "number_unknown", call, banks });
        router.replace("/call/uncertified");
      }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  if (!call)
    return (
      <Screen back>
        <Text color="faint" accessibilityLiveRegion="polite">
          Vérification de l’annonce…
        </Text>
      </Screen>
    );
  // Le vert ne vient QUE de la concordance du numéro (callState). Lire l'annonce ne prouve rien : « Annonce lue » reste orange.
  const read = confirmed && !verified;
  return (
    <VerdictScreen
      tone={verified ? "positive" : "warning"}
      icon={verified ? "check" : read ? "message" : "phoneIn"}
      label={verified ? "Appel certifié" : read ? "Annonce lue" : "Appel annoncé"}
      headline={call.advisorName}
      title={[call.bankName, call.agency].filter(Boolean).join(" · ")}
      subtitle={
        confirmed && verified
          ? "Votre conseiller a reçu votre réponse."
          : verified
            ? "Le numéro correspond à l’annonce de votre banque. Même votre conseiller ne vous demandera jamais un code."
            : read
              ? "Votre conseiller a reçu votre réponse. Le numéro de l’appel n’a pas été reconnu : si on vous demande un code ou un paiement, raccrochez."
              : "Votre agence a prévu de vous appeler. Si la personne en ligne vous demande un code ou un paiement, raccrochez."
      }
      info={
        <Group>
          <Fact label="Motif" value={call.reason} />
          {call.callerNumber ? <Fact label="Ligne annoncée" value={formatPhone(call.callerNumber)} /> : null}
        </Group>
      }
      actions={
        confirmed ? (
          <Button variant="light" label="Revenir à l’accueil" onPress={() => router.replace("/")} />
        ) : (
          <CallActions>
            <RoundAction size={controls.call} icon="bank" label="Rappeler ma banque" onPress={() => router.push("/callback")} />
            <RoundAction size={controls.call} tone="danger" icon="alert" label="Appel suspect" onPress={() => void answer(false)} />
            <RoundAction size={controls.call} tone={verified ? "positive" : "primary"} icon="check" label="J’ai lu l’annonce" onPress={() => void answer(true)} />
          </CallActions>
        )
      }
    >
      {error ? (
        <Text variant="caption" color="soft" align="center" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </VerdictScreen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, minHeight: 48, paddingHorizontal: space.md, paddingVertical: 10 }}>
      <Text variant="caption" color="faint">
        {label}
      </Text>
      <Text variant="bodyStrong" align="right" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}
