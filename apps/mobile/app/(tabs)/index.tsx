import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { HomeResponse, IconName } from "@vigie/shared";
import { api } from "@/api";
import { protection, type ProtectionStatus } from "@/protection";
import { useLoad } from "@/useLoad";
import { AlertRow } from "@/ui/AlertRow";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { FadeIn, Orb } from "@/ui/Orb";
import { Card, Empty, Screen, Section, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space, tones } from "@/ui/theme";

export default function Home() {
  const { data, error } = useLoad(() => api.home());

  // État réel du téléphone : rôle de filtrage d'appels, accès aux notifications, extension d'annuaire iOS.
  const [device, setDevice] = useState<ProtectionStatus | "error" | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      protection
        .status()
        .then((s) => alive && setDevice(s))
        .catch(() => alive && setDevice("error"));
      return () => {
        alive = false;
      };
    }, []),
  );

  // L'annonce est confiée au filtrage Android, qui ne la validera que si le numéro correspond.
  // Quand il n'y a plus d'annonce valable, on l'efface du téléphone.
  useEffect(() => {
    if (data) protection.setExpectedCall(data.activeCall);
  }, [data?.activeCall]); // eslint-disable-line react-hooks/exhaustive-deps

  const checking = !error && (!data || !device);
  const channels = computeChannels(data, device);
  const summary: Summary = checking ? "checking" : summarize(channels);
  const hello = data?.firstName ? `Bonjour ${data.firstName}` : "Bonjour";
  const calm = summary === "active" || summary === "checking";

  return (
    <Screen
      footer={<Button size="hero" icon="phone" label="On m'appelle de ma banque" onPress={() => router.push("/call/check")} hint="Vérifie si l'appel en cours a été annoncé par votre banque" />}
    >
      {data?.activeCall ? (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/call/certified", params: { id: data.activeCall!.id } })}>
          <Card tone="warning" style={styles.callCard}>
            <View style={[styles.callIcon, { backgroundColor: tones.warning.solid }]}>
              <Icon name="phone" color="#FFFFFF" size={26} strokeWidth={2.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" color={tones.warning.fg}>
                Appel annoncé par votre banque
              </Text>
              <Text variant="bodyStrong">
                {data.activeCall.advisorName} · {data.activeCall.bankName}
              </Text>
            </View>
            <Icon name="chevron" color={tones.warning.fg} />
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.hero}>
        <Text variant="label" color="soft" style={{ alignSelf: "flex-start" }}>
          {hello}
        </Text>
        <FadeIn style={{ alignItems: "center" }}>
          <Orb size={176} tone={calm ? "accent" : "warning"} icon={calm ? "shield" : "alert"} />
        </FadeIn>
        <FadeIn delay={120} style={{ alignItems: "center", gap: space.sm }}>
          <Text variant="display" align="center" accessibilityRole="header" accessibilityLiveRegion="polite">
            {summaryTitle[summary]}
          </Text>
          <Text color="soft" align="center" style={{ maxWidth: 320 }}>
            {summaryText[summary]}
          </Text>
        </FadeIn>
        <FadeIn delay={220} style={{ alignSelf: "stretch", gap: space.sm }}>
          {channels.map((c) => (
            <ChannelRow key={c.key} channel={c} checking={checking} />
          ))}
        </FadeIn>
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
            {data.blockedCount > 1 ? "arnaques signalées" : "arnaque signalée"} par SmartSecure depuis votre inscription
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
          <Empty icon="check" title="Rien à signaler" text="Aucun message douteux ces derniers jours." />
        ) : null}
      </Section>
    </Screen>
  );
}

type ChannelState = "active" | "todo" | "unknown";

interface Channel {
  key: "calls" | "messages" | "mails";
  icon: IconName;
  label: string;
  state: ChannelState;
  /** Une phrase qui dit pourquoi. */
  detail: string;
  /** Écran de réglage correspondant. */
  to: "/protections" | "/mailboxes";
}

const fromFeature = (s: string | undefined): ChannelState => (s === "enabled" ? "active" : s === "disabled" ? "todo" : "unknown");

/** Un état par canal, d'après la réalité du téléphone et du serveur. Rien n'est affirmé sans preuve. */
function computeChannels(data: HomeResponse | null, device: ProtectionStatus | "error" | null): Channel[] {
  const st = device && device !== "error" ? device : null;
  const android = protection.isAndroid;
  const ios = protection.isIos;

  const calls: ChannelState = !st ? "unknown" : android ? fromFeature(st.callScreening) : ios ? fromFeature(st.callDirectory) : "unknown";
  // iPhone : l'état du filtre SMS n'est pas lisible par une app.
  const messages: ChannelState = !st ? "unknown" : android ? fromFeature(st.notificationListener) : "unknown";
  let mails: ChannelState = "unknown";
  if (data) mails = data.sources.mails > 0 && data.sources.mailsInError === 0 ? "active" : "todo";

  const mailDetail = !data
    ? "Impossible de vérifier pour le moment."
    : data.sources.mailsInError > 0
      ? "Une boîte mail ne répond plus : reconnectez-la."
      : data.sources.mails > 1
        ? `${data.sources.mails} boîtes mail surveillées.`
        : data.sources.mails === 1
          ? "Votre boîte mail est surveillée."
          : "Aucune boîte mail connectée.";

  return [
    {
      key: "calls",
      icon: "phone",
      label: "Appels",
      state: calls,
      to: "/protections",
      detail: calls === "active" ? "Les appels sont vérifiés." : calls === "todo" ? "Le réglage du téléphone n'est pas activé." : "SmartSecure ne peut pas lire ce réglage.",
    },
    {
      key: "messages",
      icon: "message",
      label: "SMS et messageries",
      state: messages,
      to: "/protections",
      detail:
        messages === "active"
          ? "Les messages avec un lien sont vérifiés."
          : messages === "todo"
            ? "L'accès aux notifications n'est pas activé."
            : ios
              ? "Sur iPhone, SmartSecure ne peut pas voir si le filtre SMS est activé. Vérifiez dans les réglages."
              : "SmartSecure ne peut pas lire ce réglage.",
    },
    { key: "mails", icon: "mail", label: "Mails", state: mails, to: "/mailboxes", detail: mailDetail },
  ];
}

type Summary = "checking" | "active" | "partial" | "unverified";

/** « Protection active » seulement si tous les canaux disponibles le sont. */
function summarize(channels: Channel[]): Summary {
  if (channels.every((c) => c.state === "active")) return "active";
  if (channels.some((c) => c.state === "todo")) return "partial";
  return "unverified";
}

const summaryTitle: Record<Summary, string> = {
  checking: "Vérification…",
  active: "Protection active",
  partial: "Protection partielle",
  unverified: "Protection à vérifier",
};

const summaryText: Record<Summary, string> = {
  checking: "SmartSecure regarde ce qui est activé sur votre téléphone.",
  active: "Vos appels, vos messages et vos mails sont surveillés.",
  partial: "Activez les protections ci-dessous pour être protégé partout.",
  unverified: "SmartSecure ne peut pas confirmer toutes les protections. Ouvrez les réglages pour les vérifier.",
};

const stateLook: Record<ChannelState, { tone: "positive" | "warning" | "neutral"; icon: IconName; label: string }> = {
  active: { tone: "positive", icon: "check", label: "Actif" },
  todo: { tone: "warning", icon: "alert", label: "À activer" },
  unknown: { tone: "neutral", icon: "clock", label: "État inconnu" },
};

function ChannelRow({ channel, checking }: { channel: Channel; checking: boolean }) {
  const look = checking ? { tone: "neutral" as const, icon: "clock" as IconName, label: "Vérification…" } : stateLook[channel.state];
  return (
    <Card style={{ gap: space.sm }}>
      <View style={styles.channelHead} accessible accessibilityLabel={`${channel.label} : ${look.label}. ${checking ? "" : channel.detail}`}>
        <Icon name={channel.icon} size={26} color={palette.accent} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {channel.label}
        </Text>
        <ToneBadge tone={look.tone} icon={look.icon} label={look.label} />
      </View>
      {checking ? null : (
        <>
          <Text color="soft">{channel.detail}</Text>
          {channel.state === "active" ? null : (
            <Button
              variant={channel.state === "todo" ? "primary" : "secondary"}
              label={channel.state === "todo" ? "Activer" : "Vérifier les réglages"}
              onPress={() => router.push(channel.to)}
            />
          )}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.md + 4, paddingTop: space.sm, paddingBottom: space.lg },
  channelHead: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  callCard: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md, marginBottom: space.sm },
  callIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  stat: { flexDirection: "row", alignItems: "center", gap: space.lg, marginTop: space.md },
});
