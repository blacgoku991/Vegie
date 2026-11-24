import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { BankLinkStatus, IconName } from "@vigie/shared";
import { api } from "@/api";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, ConfirmRemove, ListRow, Screen, Section, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space, touch, type Tone } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

const statusLook: Record<BankLinkStatus, { tone: Tone; icon: IconName; label: string; text: string }> = {
  certified: {
    tone: "positive",
    icon: "check",
    label: "Compte relié",
    text: "Votre conseiller peut annoncer un appel depuis sa ligne directe.",
  },
  pending: {
    tone: "neutral",
    icon: "clock",
    label: "En attente",
    text: "Votre conseiller confirmera votre identité lors de votre prochain échange. Il pourra ensuite annoncer ses appels.",
  },
  basic: {
    tone: "neutral",
    icon: "shield",
    label: "Protection de base",
    text: "SmartSecure connaît les sites et numéros officiels de cette banque et repère ceux qui l’imitent.",
  },
};

export default function Banks() {
  const { palette, tones } = useTheme();
  const { data, error: loadError, reload } = useLoad(() => Promise.all([api.myBanks(), api.banks()]));
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const [mine, all] = data ?? [[], []];
  const available = all.filter((b) => !mine.some((m) => m.bank.id === b.id));

  const add = async (bankId: string) => {
    try {
      await api.addBank(bankId);
      setAdding(false);
      setError("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string, name: string) => {
    setRemoving(true);
    setError("");
    try {
      await api.removeBank(id);
      setConfirming(null);
      setNotice(`${name} a été retirée.`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Screen back title="Mes banques" footer={!adding ? <Button icon="bank" label="J’ai un code de mon conseiller" onPress={() => router.push("/join")} /> : undefined}>
      <Text color="faint">Avec une banque partenaire, votre conseiller peut annoncer ses appels.</Text>

      {error || loadError ? (
        <Text variant="caption" color={tones.danger.fg} accessibilityLiveRegion="polite" style={{ marginTop: space.sm }}>
          {error || loadError}
        </Text>
      ) : null}
      {notice ? (
        <Text variant="caption" color="soft" accessibilityLiveRegion="polite" style={{ marginTop: space.sm }}>
          {notice}
        </Text>
      ) : null}

      {adding ? (
        <Section
          title="Choisissez votre banque"
          group
          action={
            <Pressable accessibilityRole="button" onPress={() => setAdding(false)} hitSlop={12}>
              <Text variant="caption" color="faint">
                Annuler
              </Text>
            </Pressable>
          }
        >
          {available.map((b) => (
            <ListRow key={b.id} icon="bank" title={b.name} subtitle={b.partner ? "Partenaire · annonces d’appel disponibles" : "Protection de base"} onPress={() => void add(b.id)} />
          ))}
        </Section>
      ) : null}

      <View style={{ marginTop: space.lg, gap: 10 }}>
        {mine.map(({ bank, status }) => {
          const look = statusLook[status];
          return (
            <Card key={bank.id} style={{ gap: 10 }}>
              <View style={styles.head}>
                <View style={[styles.icon, { backgroundColor: palette.surfaceHigh }]}>
                  <Icon name="bank" size={20} color={palette.ink} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subhead">{bank.name}</Text>
                  <ToneBadge tone={look.tone} icon={look.icon} label={look.label} />
                </View>
              </View>
              <Text variant="caption" color="faint">
                {look.text}
              </Text>
              {confirming === bank.id ? (
                <ConfirmRemove
                  title={`Retirer ${bank.name} ?`}
                  text="Ses annonces d’appel ne seront plus disponibles."
                  busy={removing}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => void remove(bank.id, bank.name)}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${bank.name}`}
                  onPress={() => {
                    setNotice("");
                    setConfirming(bank.id);
                  }}
                  style={{ minHeight: touch.min, justifyContent: "center", alignSelf: "flex-start" }}
                >
                  <Text variant="label" color={tones.danger.fg}>
                    Retirer
                  </Text>
                </Pressable>
              )}
            </Card>
          );
        })}
      </View>
      {!adding ? <Button variant="secondary" icon="plus" label="Ajouter une banque" style={{ marginTop: 10 }} onPress={() => setAdding(true)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
