import { useState } from "react";
import { ScrollView, View } from "react-native";
import type { AlertSource, AlertSummary, Verdict } from "@vigie/shared";
import { api } from "@/api";
import { dayLabel } from "@/format";
import { useLoad } from "@/useLoad";
import { AlertRow } from "@/ui/AlertRow";
import { Chip, Empty, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { gutter, space } from "@/ui/theme";

const verdictFilters: Array<{ label: string; value?: Verdict }> = [
  { label: "Tout" },
  { label: "Arnaques", value: "scam" },
  { label: "Douteux", value: "suspicious" },
  { label: "Rien d'anormal", value: "safe" },
];
const sourceFilters: Array<{ label: string; value?: AlertSource; icon?: "mail" | "message" | "share" }> = [
  { label: "Toutes sources" },
  { label: "Mails", value: "mail", icon: "mail" },
  { label: "SMS", value: "sms", icon: "message" },
  { label: "WhatsApp", value: "whatsapp", icon: "message" },
  { label: "Partagés", value: "share", icon: "share" },
];

export default function History() {
  const [verdict, setVerdict] = useState<Verdict | undefined>();
  const [source, setSource] = useState<AlertSource | undefined>();
  const { data } = useLoad(() => api.alerts({ verdict, source }), [verdict, source]);

  const groups: Array<[string, AlertSummary[]]> = [];
  for (const a of data ?? []) {
    const label = dayLabel(a.receivedAt);
    const g = groups.at(-1);
    if (g && g[0] === label) g[1].push(a);
    else groups.push([label, [a]]);
  }

  return (
    <Screen title="Historique">
      <View style={{ gap: space.sm + 4 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -gutter }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }}>
          {verdictFilters.map((f) => (
            <Chip key={f.label} label={f.label} selected={verdict === f.value} onPress={() => setVerdict(f.value)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -gutter }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: gutter }}>
          {sourceFilters.map((f) => (
            <Chip key={f.label} label={f.label} icon={f.icon} selected={source === f.value} onPress={() => setSource(f.value)} />
          ))}
        </ScrollView>
      </View>

      {data && !data.length ? <Empty icon="search" title="Rien à afficher" text="Aucun message ne correspond à ce filtre." /> : null}

      {groups.map(([label, items]) => (
        <View key={label} style={{ marginTop: space.xl, gap: space.sm + 4 }}>
          <Text variant="label" color="soft" accessibilityRole="header">
            {label}
          </Text>
          {items.map((a) => (
            <AlertRow key={a.id} alert={a} />
          ))}
        </View>
      ))}
    </Screen>
  );
}
