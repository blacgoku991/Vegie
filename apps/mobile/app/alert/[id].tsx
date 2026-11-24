import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { verdictMeta, type CheckKey, type IconName } from "@vigie/shared";
import { api } from "@/api";
import { sourceLabel, when } from "@/format";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, CheckStatusBadge, Group, Screen, Section, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

const checkIcons: Record<CheckKey, IconName> = { sender: "user", links: "link", site: "globe", text: "text" };

export default function AlertDetail() {
  const { palette, tones } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: alert, error } = useLoad(() => api.alert(id), [id]);

  if (!alert) {
    return (
      <Screen back>
        <Text color="faint" accessibilityLiveRegion="polite">
          {error ?? "Chargement de l’alerte…"}
        </Text>
      </Screen>
    );
  }

  const meta = verdictMeta(alert.verdict, alert.incomplete);
  const isScam = meta.tone !== "positive";
  const fg = meta.tone === "neutral" ? palette.inkSoft : tones[meta.tone].fg;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  return (
    <Screen back footer={<Button label="J’ai compris" onPress={back} />}>
      <View style={{ gap: 10, marginTop: space.sm }}>
        <ToneBadge tone={meta.tone} icon={meta.icon} label={meta.label} size="lg" />
        <Text variant="heading" accessibilityRole="header">
          {alert.explanation}
        </Text>
        <Text variant="caption" color="faint">
          {sourceLabel[alert.source]}
          {alert.sender ? ` de ${alert.sender}` : ""} · {when(alert.receivedAt)}
          {alert.origin ? ` · ${alert.origin}` : ""}
        </Text>
      </View>

      <Card style={{ marginTop: space.lg, gap: 6 }}>
        <Text variant="subhead" color={fg}>
          {isScam ? "Que faire ?" : "Aucun signe d’arnaque détecté"}
        </Text>
        <Text>{alert.advice}</Text>
      </Card>

      {isScam ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <Button icon="bank" variant="secondary" label="J’ai donné un code ou payé" onPress={() => router.push("/callback")} />
          <Button icon="heart" variant="secondary" label="Joindre un proche" onPress={() => router.push("/contacts")} />
        </View>
      ) : null}

      <Section title="Ce qui a été vérifié">
        <Group>
          {alert.checks.map((c) => (
            <View key={c.key} style={styles.check}>
              <View style={[styles.checkIcon, { backgroundColor: palette.surfaceHigh }]}>
                <Icon name={checkIcons[c.key]} size={20} color={palette.ink} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.checkHead}>
                  <Text variant="bodyStrong">{c.title}</Text>
                  <CheckStatusBadge status={c.status} />
                </View>
                <Text variant="caption" color="faint">
                  {c.detail}
                </Text>
              </View>
            </View>
          ))}
        </Group>
      </Section>

      {alert.links.length ? (
        <Section title="Liens du message">
          <Group>
            {alert.links.map((l, i) => (
              <View key={`${l.domain}-${i}`} style={{ paddingHorizontal: space.md, paddingVertical: 12, gap: 2 }}>
                <Text variant="bodyStrong" selectable>
                  {l.domain}
                </Text>
                <Text variant="caption" color="faint">
                  {l.domainAgeDays !== null
                    ? l.domainAgeDays < 365
                      ? `Site créé il y a ${l.domainAgeDays} jour${l.domainAgeDays > 1 ? "s" : ""}`
                      : `Site existant depuis ${Math.floor(l.domainAgeDays / 365)} an${l.domainAgeDays >= 730 ? "s" : ""}`
                    : "Ancienneté du site inconnue"}
                  {isScam ? " · N’ouvrez pas ce lien" : ""}
                </Text>
              </View>
            ))}
          </Group>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: "row", gap: 12, paddingHorizontal: space.md, paddingVertical: 12 },
  checkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  checkHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space.sm },
});
