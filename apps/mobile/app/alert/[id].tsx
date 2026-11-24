import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { verdictMeta, type CheckKey, type IconName } from "@vigie/shared";
import { api } from "@/api";
import { sourceLabel, when } from "@/format";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { FadeIn } from "@/ui/Orb";
import { Card, CheckStatusBadge, Screen, Section, VerdictBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, radius, space, tones } from "@/ui/theme";

const checkIcons: Record<CheckKey, IconName> = { sender: "user", links: "link", site: "globe", text: "text" };

export default function AlertDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: alert, error } = useLoad(() => api.alert(id), [id]);

  if (!alert) {
    return (
      <Screen back>
        {error ? <Text color="soft">{error}</Text> : null}
      </Screen>
    );
  }

  const meta = verdictMeta(alert.verdict, alert.incomplete);
  const tone = tones[meta.tone];
  const isScam = meta.tone !== "positive";

  return (
    <Screen back footer={<Button label="J'ai compris" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}>
      <FadeIn style={{ gap: space.md }}>
        <VerdictBadge verdict={alert.verdict} incomplete={alert.incomplete} size="lg" />
        <Text variant={alert.explanation.length > 70 ? "heading" : "title"} accessibilityRole="header">
          {alert.explanation}
        </Text>
        <Text variant="caption" color="faint">
          {sourceLabel[alert.source]}
          {alert.sender ? ` de ${alert.sender}` : ""} · {when(alert.receivedAt)}
          {alert.origin ? ` · ${alert.origin}` : ""}
        </Text>
      </FadeIn>

      <FadeIn delay={100}>
        <Card tone={meta.tone} style={{ marginTop: space.lg, flexDirection: "row", gap: space.md }}>
          <Icon name={isScam ? "alert" : "check"} color={tone.fg} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong" color={tone.fg}>
              {isScam ? "Que faire ?" : "Aucun signe d'arnaque détecté"}
            </Text>
            <Text color={tone.fg}>{alert.advice}</Text>
          </View>
        </Card>
      </FadeIn>

      <Section title="Ce que SmartSecure a vérifié">
        <View style={styles.list}>
          {alert.checks.map((c, i) => (
            <FadeIn key={c.key} delay={160 + i * 70}>
              <View style={[styles.check, i > 0 && styles.divider]}>
                <View style={styles.checkIcon}>
                  <Icon name={checkIcons[c.key]} color={palette.ink} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.checkHead}>
                    <Text variant="bodyStrong">{c.title}</Text>
                    <CheckStatusBadge status={c.status} />
                  </View>
                  <Text color="soft">{c.detail}</Text>
                </View>
              </View>
            </FadeIn>
          ))}
        </View>
      </Section>

      {alert.links.length ? (
        <Section title="Liens du message">
          {alert.links.map((l) => (
            <Card key={l.url} style={{ padding: space.md, gap: 4 }}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {l.domain}
              </Text>
              <Text variant="caption" color="soft">
                {l.domainAgeDays !== null
                  ? l.domainAgeDays < 365
                    ? `Site créé il y a ${l.domainAgeDays} jour${l.domainAgeDays > 1 ? "s" : ""}`
                    : `Site existant depuis ${Math.floor(l.domainAgeDays / 365)} an${l.domainAgeDays >= 730 ? "s" : ""}`
                  : "Ancienneté du site inconnue"}
                {isScam ? " · N'ouvrez pas ce lien" : ""}
              </Text>
            </Card>
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: palette.surface, borderRadius: radius.lg, paddingHorizontal: space.md },
  check: { flexDirection: "row", gap: space.md, paddingVertical: space.md + 4 },
  divider: { borderTopWidth: 1, borderTopColor: palette.line },
  checkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.paper, alignItems: "center", justifyContent: "center" },
  checkHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space.sm },
});
