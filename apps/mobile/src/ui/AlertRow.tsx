import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { verdicts, type AlertSummary } from "@vigie/shared";
import { sourceIcon, sourceLabel, when } from "../format";
import { Icon } from "./Icon";
import { VerdictBadge } from "./primitives";
import { Text } from "./Text";
import { palette, radius, shadow, space } from "./theme";

/** Une alerte dans une liste : verdict (icône + mot), titre, explication, provenance. */
export function AlertRow({ alert }: { alert: AlertSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${verdicts[alert.verdict].label}. ${sourceLabel[alert.source]} ${alert.sender ? `de ${alert.sender}` : ""}. ${alert.explanation}`}
      onPress={() => router.push(`/alert/${alert.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.top}>
        <VerdictBadge verdict={alert.verdict} />
        {!alert.read ? <View style={[styles.dot, { backgroundColor: palette.accent }]} accessibilityLabel="Non lu" /> : null}
      </View>
      <Text variant="bodyStrong" numberOfLines={2}>
        {alert.title}
      </Text>
      <Text color="soft" numberOfLines={2}>
        {alert.explanation}
      </Text>
      <View style={styles.meta}>
        <Icon name={sourceIcon[alert.source]} size={18} color={palette.inkFaint} />
        <Text variant="caption" color="faint" numberOfLines={1} style={{ flex: 1 }}>
          {sourceLabel[alert.source]}
          {alert.sender ? ` · ${alert.sender}` : ""} · {when(alert.receivedAt)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius.md,
    padding: space.md + 4,
    gap: space.sm,
    ...shadow,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
});
