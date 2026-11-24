import { useState } from "react";
import { View } from "react-native";
import type { AlertSource, AlertSummary, Verdict } from "@vigie/shared";
import { api } from "@/api";
import { dayLabel } from "@/format";
import { useLoad } from "@/useLoad";
import { AlertRow } from "@/ui/AlertRow";
import { ChoiceField, Empty, Group, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { controlSeparation, space } from "@/ui/theme";

type VerdictFilter = Verdict | "incomplete" | "all";
const verdictFilters: Array<{ label: string; value: VerdictFilter }> = [
  { label: "Tout", value: "all" },
  { label: "Arnaques", value: "scam" },
  { label: "Douteux", value: "suspicious" },
  { label: "À vérifier", value: "incomplete" },
  { label: "Aucun signe détecté", value: "safe" },
];
const sourceFilters: Array<{ label: string; value: AlertSource | "all"; icon?: "mail" | "message" | "share" }> = [
  { label: "Toutes", value: "all" },
  { label: "Mails", value: "mail", icon: "mail" },
  { label: "SMS", value: "sms", icon: "message" },
  { label: "WhatsApp", value: "whatsapp", icon: "message" },
  { label: "Partagés", value: "share", icon: "share" },
];

export default function History() {
  const [verdict, setVerdict] = useState<VerdictFilter>("all");
  const [source, setSource] = useState<AlertSource | "all">("all");
  const { data, error, loading } = useLoad(() => api.alerts({ verdict: verdict === "all" ? undefined : verdict, source: source === "all" ? undefined : source }), [verdict, source]);

  const groups: Array<[string, AlertSummary[]]> = [];
  for (const a of data ?? []) {
    const label = dayLabel(a.receivedAt);
    const g = groups.at(-1);
    if (g && g[0] === label) g[1].push(a);
    else groups.push([label, [a]]);
  }

  return (
    <Screen title="Historique">
      <View style={{ gap: controlSeparation }}>
        <ChoiceField title="Verdict" options={verdictFilters} value={verdict} onChange={setVerdict} />
        <ChoiceField title="Source" options={sourceFilters} value={source} onChange={setSource} />
      </View>

      {error || loading ? (
        <Text variant="caption" color="faint" accessibilityLiveRegion="polite" style={{ marginTop: space.md }}>
          {error || "Chargement de l’historique…"}
        </Text>
      ) : null}
      {!loading && !error && data && !data.length ? <Empty icon="search" title="Rien à afficher" text="Aucun message ne correspond à ce filtre." /> : null}

      {groups.map(([label, items]) => (
        <View key={label} style={{ marginTop: space.lg }}>
          <Text variant="caption" color="faint" accessibilityRole="header" style={{ marginBottom: space.sm, marginLeft: space.xs }}>
            {label}
          </Text>
          <Group>
            {items.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </Group>
        </View>
      ))}
    </Screen>
  );
}
