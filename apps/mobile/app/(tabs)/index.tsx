import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { IconName } from "@vigie/shared";
import { api } from "@/api";
import { protection } from "@/protection";
import { useLoad } from "@/useLoad";
import { AlertRow } from "@/ui/AlertRow";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { FadeIn, Orb } from "@/ui/Orb";
import { Card, Empty, Screen, Section } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, radius, space, tones } from "@/ui/theme";

export default function Home() {
  const { data, error } = useLoad(() => api.home());

  // L'appel annoncé est confié au filtrage Android, qui le reconnaîtra à la sonnerie.
  useEffect(() => {
    if (data?.activeCall) protection.setExpectedCall(data.activeCall);
  }, [data?.activeCall]);

  const complete = !!data && data.sources.calls && data.sources.mails > 0;
  const hello = data?.firstName ? `Bonjour ${data.firstName}` : "Bonjour";

  return (
    <Screen
      footer={<Button size="hero" icon="phone" label="On m'appelle de ma banque" onPress={() => router.push("/call/check")} hint="Vérifie si l'appel en cours a été annoncé par votre banque" />}
    >
      {data?.activeCall ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/call/certified", params: { id: data.activeCall!.id } })}>
          <Card tone="positive" style={styles.callCard}>
            <View style={[styles.callIcon, { backgroundColor: tones.positive.solid }]}>
              <Icon name="check" color="#FFFFFF" size={26} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" color={tones.positive.fg}>
                Appel certifié annoncé
              </Text>
              <Text variant="bodyStrong">
                {data.activeCall.advisorName} · {data.activeCall.bankName}
              </Text>
            </View>
            <Icon name="chevron" color={tones.positive.fg} />
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.hero}>
        <Text variant="label" color="soft" style={{ alignSelf: "flex-start" }}>
          {hello}
        </Text>
        <FadeIn style={{ alignItems: "center" }}>
          <Orb size={176} tone={data && !complete ? "warning" : "accent"} icon={data && !complete ? "alert" : "shield"} />
        </FadeIn>
        <FadeIn delay={120} style={{ alignItems: "center", gap: space.sm }}>
          <Text variant="display" align="center" accessibilityRole="header">
            {data && !complete ? "Protection partielle" : "Protection active"}
          </Text>
          <Text color="soft" align="center" style={{ maxWidth: 320 }}>
            {data && !complete
              ? "Ajoutez votre banque et vos mails pour être protégé partout."
              : "Vigie veille sur vos appels, vos mails et vos messages."}
          </Text>
        </FadeIn>
        {data ? (
          <FadeIn delay={220} style={styles.sources}>
            <SourcePill icon="phone" label="Appels" on={data.sources.calls} />
            <SourcePill icon="mail" label={data.sources.mails > 1 ? `${data.sources.mails} boîtes mail` : data.sources.mails === 1 ? "1 boîte mail" : "Mails"} on={data.sources.mails > 0} />
            <SourcePill icon="message" label="Messages" on={data.sources.messages} />
          </FadeIn>
        ) : null}
        {data && !complete ? <Button variant="secondary" label="Terminer la configuration" onPress={() => router.push("/protections")} style={{ alignSelf: "stretch" }} /> : null}
      </View>

      {error ? (
        <Card tone="warning">
          <Text color={tones.warning.fg}>{error}</Text>
        </Card>
      ) : null}

      {data ? (
        <Card style={styles.stat}>
          <Text variant="display" color="accent" style={{ fontSize: 52, lineHeight: 56 }}>
            {data.blockedCount}
          </Text>
          <Text color="soft" style={{ flex: 1 }}>
            {data.blockedCount > 1 ? "arnaques arrêtées" : "arnaque arrêtée"} par Vigie depuis votre inscription
          </Text>
        </Card>
      ) : null}

      <Section
        title="Dernières alertes"
        action={
          <Pressable accessibilityRole="button" onPress={() => router.push("/history")} hitSlop={12} style={{ minHeight: 48, justifyContent: "center" }}>
            <Text variant="label" color="accent">
              Tout voir
            </Text>
          </Pressable>
        }
      >
        {data?.latestAlerts.length ? (
          data.latestAlerts.map((a, i) => (
            <FadeIn key={a.id} delay={260 + i * 80}>
              <AlertRow alert={a} />
            </FadeIn>
          ))
        ) : data ? (
          <Empty icon="check" title="Tout est calme" text="Aucun message dangereux ces derniers jours." />
        ) : null}
      </Section>
    </Screen>
  );
}

function SourcePill({ icon, label, on }: { icon: IconName; label: string; on: boolean }) {
  return (
    <View style={styles.pill} accessible accessibilityLabel={`${label} : ${on ? "protégé" : "non protégé"}`}>
      <Icon name={icon} size={20} color={on ? palette.accent : palette.inkFaint} />
      <Text variant="label" color={on ? "ink" : "faint"}>
        {label}
      </Text>
      <Icon name={on ? "check" : "plus"} size={18} color={on ? tones.positive.fg : palette.inkFaint} strokeWidth={2.6} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.md + 4, paddingTop: space.sm, paddingBottom: space.lg },
  sources: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
  },
  callCard: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md, marginBottom: space.sm },
  callIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  stat: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.md },
});
