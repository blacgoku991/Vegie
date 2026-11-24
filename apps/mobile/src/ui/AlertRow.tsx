import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { verdictMeta, type AlertSummary } from "@vigie/shared";
import { sourceIcon, sourceLabel, when } from "../format";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";
import { controls, space } from "./theme";

/**
 * Une alerte, sur une ligne : pastille de la source, titre, provenance et heure, et le verdict à droite
 * (icône + mot + couleur). À placer dans un `Group`.
 */
export function AlertRow({ alert }: { alert: AlertSummary; width?: number }) {
  const { palette, tones } = useTheme();
  const v = verdictMeta(alert.verdict, alert.incomplete);
  // Dans une ligne, le verdict tient en un ou deux mots ; le libellé complet reste lu par le lecteur d'écran et affiché dans le détail.
  const quiet = alert.verdict === "safe" && !alert.incomplete;
  const short = alert.verdict === "scam" ? "Arnaque" : alert.verdict === "suspicious" ? "Douteux" : alert.incomplete ? "À vérifier" : "Rien à signaler";
  const fg = quiet || v.tone === "neutral" ? palette.inkFaint : tones[v.tone].fg;
  const source = sourceLabel[alert.source];
  const title = alert.title.replace(/(\d)\s+€/g, "$1 €");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${v.label}. ${sourceLabel[alert.source]} ${alert.sender ? `de ${alert.sender}` : ""}. ${alert.title}. ${alert.explanation}`}
      onPress={() => router.push(`/alert/${alert.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.icon, { backgroundColor: palette.surfaceHigh }]}>
        <Icon name={sourceIcon[alert.source]} size={20} color={palette.ink} />
        {!alert.read ? <View accessibilityLabel="Non lu" style={[styles.dot, { backgroundColor: palette.ink, borderColor: palette.surface }]} /> : null}
      </View>
      <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="faint" numberOfLines={1}>
          {title === source ? when(alert.receivedAt) : `${source} · ${when(alert.receivedAt)}`}
        </Text>
      </View>
      <View style={styles.verdict}>
        <Icon name={v.icon} size={14} color={fg} strokeWidth={2.3} />
        <Text variant="label" color={fg} numberOfLines={1}>
          {short}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: controls.row + 4, paddingHorizontal: space.md, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: -1, right: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  verdict: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: "42%" },
});
