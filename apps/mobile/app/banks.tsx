import { useState } from "react";
import { Pressable, View } from "react-native";
import type { BankLinkStatus, IconName } from "@vigie/shared";
import { api } from "@/api";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Card, ListRow, Screen, Section, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space, type Tone } from "@/ui/theme";

const statusLook: Record<BankLinkStatus, { tone: Tone; icon: IconName; label: string; text: string }> = {
  certified: {
    tone: "positive",
    icon: "check",
    label: "Appels certifiés",
    text: "Chaque appel de votre conseiller est annoncé dans Vigie. Un appel non annoncé est signalé.",
  },
  pending: {
    tone: "neutral",
    icon: "clock",
    label: "En attente de votre banque",
    text: "Votre conseiller confirmera votre identité lors de votre prochain échange. Ensuite, ses appels seront certifiés.",
  },
  basic: {
    tone: "neutral",
    icon: "shield",
    label: "Protection de base",
    text: "Vigie connaît les sites et numéros officiels de cette banque et repère ceux qui l'imitent.",
  },
};

export default function Banks() {
  const { data, reload } = useLoad(() => Promise.all([api.myBanks(), api.banks()]));
  const [adding, setAdding] = useState(false);
  const [mine, all] = data ?? [[], []];
  const available = all.filter((b) => !mine.some((m) => m.bank.id === b.id));

  const add = async (bankId: string) => {
    await api.addBank(bankId);
    setAdding(false);
    await reload();
  };

  return (
    <Screen back title="Mes banques" footer={!adding ? <Button icon="plus" label="Ajouter une banque" onPress={() => setAdding(true)} /> : undefined}>
      <Text color="soft">Ajoutez toutes vos banques. Avec une banque partenaire de Vigie, les appels de votre conseiller sont certifiés.</Text>

      {adding ? (
        <Section title="Choisissez votre banque" action={<Pressable accessibilityRole="button" onPress={() => setAdding(false)} style={{ minHeight: 48, justifyContent: "center" }}><Text variant="label" color="accent">Annuler</Text></Pressable>}>
          {available.map((b) => (
            <ListRow key={b.id} icon="bank" title={b.name} subtitle={b.partner ? "Partenaire Vigie : appels certifiés" : "Protection de base"} onPress={() => void add(b.id)} />
          ))}
        </Section>
      ) : null}

      <View style={{ marginTop: space.xl, gap: space.md }}>
        {mine.map(({ bank, status }) => {
          const look = statusLook[status];
          return (
            <Card key={bank.id} style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
                <Text variant="heading">{bank.name}</Text>
                <ToneBadge tone={look.tone} icon={look.icon} label={look.label} />
              </View>
              <Text color="soft">{look.text}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${bank.name}`}
                onPress={() => void api.removeBank(bank.id).then(reload)}
                style={{ minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }}
              >
                <Text variant="label" color="accent">
                  Retirer
                </Text>
              </Pressable>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
