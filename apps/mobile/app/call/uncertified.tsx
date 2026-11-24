import { useEffect, useState } from "react";
import { Linking, Platform } from "react-native";
import { router } from "expo-router";
import * as SMS from "expo-sms";
import { formatPhone, normalizePhone } from "@vigie/shared";
import { api } from "@/api";
import { callState } from "@/callState";
import { protection } from "@/protection";
import { Button, RoundAction } from "@/ui/Button";
import { Group, ListRow } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { controls } from "@/ui/theme";
import { CallActions, VerdictScreen } from "@/ui/VerdictScreen";

export default function CallUncertified() {
  const state = callState.get();
  const [canEnd, setCanEnd] = useState(false);
  const [hungUp, setHungUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void protection
      .status()
      .then((s) => setCanEnd(s.canEndCall))
      .catch(() => {});
  }, []);

  const report = async (bankId: string | null) => {
    setBusy(true);
    try {
      await api.reportCall({ action: "hung_up", bankId });
      setReported(true);
      setMessage("Votre signalement a été enregistré.");
    } catch {
      setMessage("Votre signalement n’a pas pu être transmis.");
    } finally {
      setBusy(false);
    }
  };
  const hangUp = async () => {
    if (canEnd && !(await protection.endCall())) {
      setCanEnd(false);
      setMessage("Utilisez le bouton rouge du téléphone pour raccrocher.");
      return;
    }
    setHungUp(true);
    setMessage("");
    const banks = state?.banks ?? [];
    if (banks.length <= 1) await report(banks[0]?.id ?? null);
  };
  const warn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await api.alertContact("call");
      if (!res.contacts.length) {
        router.push("/contacts");
        return;
      }
      if (res.sent) setMessage(`SMS transmis à ${res.contacts.map((c) => c.name).join(", ")}.`);
      else if (await SMS.isAvailableAsync()) {
        const sms = await SMS.sendSMSAsync(res.contacts.map((c) => c.phone), "J’ai reçu un appel suspect. Peux-tu me rappeler ?");
        setMessage(sms.result === "sent" ? "SMS envoyé." : "Vérifiez l’envoi dans votre messagerie.");
      } else setMessage("L’envoi de SMS est indisponible. Vous pouvez appeler votre proche depuis Mes proches.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const number = state?.number ? formatPhone(normalizePhone(state.number) ?? state.number) : null;
  const bankNames = (state?.banks ?? []).map((b) => b.name);
  const detail = state?.offline
    ? "La connexion ne permet pas de vérifier l’annonce."
    : state?.match === "number_mismatch"
      ? "Votre banque a prévu un appel, mais pas depuis ce numéro."
      : state?.call
        ? "Vous avez indiqué avoir un doute sur cet appel."
        : "Votre banque n’a annoncé aucun appel.";
  return (
    <VerdictScreen
      tone="danger"
      icon="alert"
      label="Appel non certifié"
      headline={number ?? (hungUp ? "Rappelez votre banque" : "Raccrochez")}
      numeric={!!number}
      title={bankNames.length === 1 ? `Se présente peut-être comme ${bankNames[0]}` : undefined}
      subtitle={`${detail} Ne donnez aucun code${hungUp ? "." : " et raccrochez."}`}
      actions={
        hungUp ? (
          <>
            <Button variant="light" icon="bank" label="Rappeler ma banque" onPress={() => router.push("/callback")} />
            <Button variant="ghost" label="Retour à l’accueil" onPress={() => router.replace("/")} />
          </>
        ) : (
          <>
            <CallActions>
              <RoundAction size={controls.call} icon="bank" label="Rappeler ma banque" onPress={() => router.push("/callback")} />
              <RoundAction size={controls.call} tone="danger" icon="phoneOff" label={canEnd ? "Raccrocher" : "J’ai raccroché"} onPress={() => void hangUp()} />
            </CallActions>
            <Button variant="ghost" label="Prévenir un proche" loading={busy} onPress={() => void warn()} />
          </>
        )
      }
    >
      {message ? (
        <Text variant="caption" color="soft" align="center" accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      {hungUp && !reported && (state?.banks.length ?? 0) > 1 ? (
        <>
          <Text variant="subhead">Quelle banque était citée ?</Text>
          {state?.banks.map((bank) => (
            <Button key={bank.id} variant="secondary" icon="bank" label={`Signaler à ${bank.name}`} disabled={busy} onPress={() => void report(bank.id)} />
          ))}
        </>
      ) : null}
      {hungUp ? (
        <Group>
          <ListRow icon="heart" title="Prévenir un proche" onPress={() => void warn()} />
          <ListRow
            icon="message"
            title="Signaler au 33700"
            subtitle="Le numéro officiel contre les appels frauduleux"
            onPress={() =>
              void Linking.openURL(Platform.OS === "ios" ? "sms:33700&body=spam%20vocal%20" : "sms:33700?body=spam%20vocal%20").catch(() => setMessage("Ouvrez votre messagerie et écrivez au 33700."))
            }
          />
        </Group>
      ) : null}
    </VerdictScreen>
  );
}
