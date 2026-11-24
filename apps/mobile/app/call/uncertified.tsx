import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as SMS from "expo-sms";
import { formatPhone, type Bank } from "@vigie/shared";
import { api } from "@/api";
import { callState } from "@/callState";
import { protection } from "@/protection";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space, tones } from "@/ui/theme";
import { VerdictScreen } from "@/ui/VerdictScreen";

export default function CallUncertified() {
  const state = callState.get();
  const [banks, setBanks] = useState<Bank[]>(state?.banks ?? []);
  const [canEnd, setCanEnd] = useState(false);
  const [hungUp, setHungUp] = useState(false);
  const [showBanks, setShowBanks] = useState(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);

  useEffect(() => {
    void protection.status().then((s) => setCanEnd(s.canEndCall));
    if (!banks.length) void api.myBanks().then((b) => setBanks(b.map((x) => x.bank))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hangUp = async () => {
    if (canEnd) await protection.endCall();
    setHungUp(true);
    await api.reportCall({ action: "hung_up", bankId: banks.length === 1 ? banks[0]!.id : null }).catch(() => {});
  };

  const callBack = (bank: Bank) => {
    void api.reportCall({ action: "called_back", bankId: bank.id }).catch(() => {});
    if (bank.officialPhone) void Linking.openURL(`tel:${bank.officialPhone}`);
  };

  const warnContact = async () => {
    try {
      const res = await api.alertContact("call");
      if (res.sent) {
        const names = res.contacts.map((c) => c.name).join(", ");
        return setContactMsg(`${names} ${res.contacts.length > 1 ? "ont été prévenus" : "a été prévenu(e)"} par SMS.`);
      }
      if (!res.contacts.length) return router.push("/contacts");
      if (await SMS.isAvailableAsync()) {
        await SMS.sendSMSAsync(
          res.contacts.map((c) => c.phone),
          "Je reçois un appel suspect de quelqu'un qui dit être de ma banque. Peux-tu m'appeler ?",
        );
      }
    } catch {
      setContactMsg("Impossible de prévenir votre proche pour le moment.");
    }
  };

  const withPhone = banks.filter((b) => b.officialPhone);

  return (
    <VerdictScreen
      tone="danger"
      icon="stop"
      label="Appel non certifié"
      title={hungUp ? "Bien joué." : "Raccrochez."}
      subtitle={
        state?.offline
          ? "SmartSecure n'a pas pu vérifier cet appel. Par prudence, raccrochez et rappelez vous-même votre banque."
          : "Votre banque n'a annoncé aucun appel. C'est peut-être un escroc qui se fait passer pour elle."
      }
    >
      {!hungUp ? (
        <Button
          variant="danger"
          size="hero"
          icon="phoneOff"
          label={canEnd ? "Raccrocher maintenant" : "J'ai raccroché"}
          onPress={() => void hangUp()}
          hint={canEnd ? "Termine l'appel en cours" : "Indique à SmartSecure que vous avez raccroché"}
        />
      ) : (
        <Card tone="positive" style={{ flexDirection: "row", gap: space.md, alignItems: "center", padding: space.md }}>
          <Icon name="check" color={tones.positive.fg} strokeWidth={2.6} />
          <Text color={tones.positive.fg} style={{ flex: 1 }}>
            Numéro signalé. Merci, vous protégez aussi les autres.
          </Text>
        </Card>
      )}

      <Button variant="secondary" icon="phone" label="Rappeler ma banque" onPress={() => (withPhone.length === 1 ? callBack(withPhone[0]!) : setShowBanks((v) => !v))} />
      {showBanks ? (
        <Card style={{ gap: space.sm, backgroundColor: palette.paper, shadowOpacity: 0 }}>
          <Text variant="caption" color="soft">
            Attendez une minute après avoir raccroché, puis appelez le numéro officiel.
          </Text>
          {withPhone.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Appeler ${b.name}`} onPress={() => callBack(b)} style={styles.bankRow}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {b.name}
              </Text>
              <Text variant="bodyStrong" color="accent">
                {formatPhone(b.officialPhone!)}
              </Text>
            </Pressable>
          ))}
          {banks.some((b) => !b.officialPhone) ? (
            <Text>{withPhone.length ? "Pour vos autres banques : " : ""}utilisez le numéro inscrit au dos de votre carte bancaire.</Text>
          ) : null}
        </Card>
      ) : null}

      <Button variant="secondary" icon="heart" label="Prévenir un proche" onPress={() => void warnContact()} />
      {contactMsg ? (
        <Text variant="caption" color="soft" align="center" accessibilityLiveRegion="polite">
          {contactMsg}
        </Text>
      ) : null}

      <Card style={{ marginTop: space.sm, backgroundColor: palette.paper, shadowOpacity: 0 }}>
        <Text variant="bodyStrong">Une banque ne vous demande jamais</Text>
        <Text color="soft" style={{ marginTop: 4 }}>
          vos codes secrets, un virement « pour sécuriser votre argent », ou d'installer une application.
        </Text>
      </Card>

      <View style={styles.links}>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(Platform.OS === "ios" ? "sms:33700&body=spam%20vocal%20" : "sms:33700?body=spam%20vocal%20")}
          style={styles.link}
        >
          <Text variant="label" color="accent">
            Signaler au 33700
          </Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.replace("/")} style={styles.link}>
          <Text variant="label" color="accent">
            Accueil
          </Text>
        </Pressable>
      </View>
    </VerdictScreen>
  );
}

const styles = StyleSheet.create({
  bankRow: { flexDirection: "row", alignItems: "center", minHeight: 56, gap: space.md },
  links: { flexDirection: "row", justifyContent: "space-between", marginTop: space.sm },
  link: { minHeight: 48, justifyContent: "center" },
});
