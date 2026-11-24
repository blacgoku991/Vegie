import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import type { HomeResponse, IconName } from "@vigie/shared";
import { api } from "@/api";
import { protection, type ProtectionStatus } from "@/protection";
import { useLoad } from "@/useLoad";
import { AlertRow } from "@/ui/AlertRow";
import { Button, RoundAction } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { FadeIn } from "@/ui/Orb";
import { Avatar, Card, Empty, Group, ListRow, NavButton, Screen, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

export default function Home() {
  const { tones, palette } = useTheme();
  const { data, error, reload } = useLoad(() => api.home());

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
  const channels = computeChannels(error ? null : data, device);
  const todo = channels.filter((c) => c.state === "todo").length;
  const allActive = channels.every((c) => c.state === "active");
  // Rien n'est affirmé sans preuve : « Active » seulement si chaque protection est confirmée.
  const status: { tone: "positive" | "warning" | "neutral"; icon: IconName; word: string; summary: string } = checking
    ? { tone: "neutral", icon: "clock", word: "Vérification…", summary: "Contrôle en cours" }
    : error
      ? { tone: "warning", icon: "alert", word: "À vérifier", summary: "Connexion impossible" }
      : allActive
        ? { tone: "positive", icon: "check", word: "Active", summary: "Appels · Messages · Mails" }
        : todo
          ? { tone: "warning", icon: "alert", word: "À vérifier", summary: todo > 1 ? `${todo} protections à activer` : "1 protection à activer" }
          : { tone: "warning", icon: "alert", word: "À vérifier", summary: "Réglages à contrôler sur le téléphone" };
  const activeCall = data?.activeCall;
  const [detail, setDetail] = useState(false);
  const toneColor = status.tone === "neutral" ? palette.inkFaint : tones[status.tone].fg;

  return (
    <Screen>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mon profil" onPress={() => router.push("/settings")} hitSlop={4}>
          <Avatar name={data?.firstName} />
        </Pressable>
        <Text variant="subhead" accessibilityRole="header">
          SmartSecure
        </Text>
        <NavButton icon="bell" label="Historique des alertes" onPress={() => router.push("/history")} />
      </View>

      {activeCall && Date.parse(activeCall.expiresAt) > Date.now() && !error ? (
        <View style={{ marginTop: space.md }}>
          <ListRow
            icon="phoneIn"
            iconTone="warning"
            title="Votre banque va vous appeler"
            subtitle={`${activeCall.advisorName} · ${activeCall.bankName}`}
            onPress={() => router.push({ pathname: "/call/certified", params: { id: activeCall.id } })}
          />
        </View>
      ) : null}

      <FadeIn style={styles.status}>
        <Text variant="caption" color="faint">
          Protection
        </Text>
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={`Protection : ${status.word}. ${status.summary}`}>
          <Text variant="display" align="center">
            {status.word}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status.summary}. ${detail ? "Masquer le détail" : "Voir le détail"}`}
          accessibilityState={{ expanded: detail }}
          disabled={checking}
          onPress={() => setDetail((v) => !v)}
          hitSlop={8}
          style={({ pressed }) => [styles.pill, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name={status.icon} size={14} color={toneColor} strokeWidth={2.4} />
          <Text variant="footnote" color="soft">
            {status.summary}
          </Text>
          {!checking ? (
            <View style={{ transform: [{ rotate: detail ? "-90deg" : "90deg" }] }}>
              <Icon name="chevron" size={12} color={palette.inkFaint} strokeWidth={2.2} />
            </View>
          ) : null}
        </Pressable>
      </FadeIn>

      {detail ? (
        <View style={{ marginTop: space.md }}>
          <Group>
            {channels.map((channel) => (
              <ChannelRow key={channel.key} channel={channel} />
            ))}
          </Group>
        </View>
      ) : null}

      <View style={styles.actions}>
        <RoundAction tone="primary" icon="phoneIn" label="Appel banque" hint="Vérifier si votre conseiller a annoncé cet appel" onPress={() => router.push("/call/check")} />
        <RoundAction icon="bank" label="Rappeler" hint="Retrouver le numéro officiel de votre banque" onPress={() => router.push("/callback")} />
        <RoundAction icon="message" label="Message" hint="Faire vérifier un SMS, un mail ou un lien" onPress={() => router.push("/check-message")} />
        <RoundAction icon="heart" label="Proches" onPress={() => router.push("/contacts")} />
      </View>

      <View style={{ marginTop: space.lg + 4 }}>
        {error ? (
          <Card tone="warning" style={{ gap: 10 }}>
            <Text color={tones.warning.fg}>{error}</Text>
            <Button variant="secondary" label="Réessayer" onPress={() => void reload()} />
          </Card>
        ) : (
          <Group
            header={
              <View style={styles.boxHead}>
                <Text variant="subhead" accessibilityRole="header">
                  Récent
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Tout voir dans l’historique" onPress={() => router.push("/history")} hitSlop={12}>
                  <Text variant="caption" color="faint">
                    Tout voir
                  </Text>
                </Pressable>
              </View>
            }
          >
            {!data ? (
              <View style={{ padding: space.md }}>
                <Text variant="caption" color="faint" accessibilityLiveRegion="polite">
                  Chargement…
                </Text>
              </View>
            ) : data.latestAlerts.length ? (
              data.latestAlerts.slice(0, 4).map((alert) => <AlertRow key={alert.id} alert={alert} />)
            ) : (
              <Empty icon="message" title="Rien à signaler" text="Les appels et messages vérifiés apparaîtront ici." />
            )}
          </Group>
        )}
      </View>
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
      detail: calls === "active" ? (ios ? "L’annuaire signale les numéros connus." : "Le filtrage des appels est activé.") : calls === "todo" ? "Le réglage du téléphone n’est pas activé." : "À contrôler dans les réglages du téléphone.",
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
            ? "L’accès aux notifications n’est pas activé."
            : ios
              ? "Sur iPhone, le filtre SMS se contrôle dans les réglages."
              : "À contrôler dans les réglages du téléphone.",
    },
    { key: "mails", icon: "mail", label: "Mails", state: mails, to: "/mailboxes", detail: mailDetail },
  ];
}

const stateLook: Record<ChannelState, { tone: "positive" | "warning" | "neutral"; icon: IconName; label: string }> = {
  active: { tone: "positive", icon: "check", label: "Actif" },
  todo: { tone: "warning", icon: "alert", label: "À activer" },
  unknown: { tone: "neutral", icon: "clock", label: "À contrôler" },
};

function ChannelRow({ channel }: { channel: Channel }) {
  return <ListRow icon={channel.icon} title={channel.label} subtitle={channel.detail} right={<ToneBadge {...stateLook[channel.state]} />} onPress={() => router.push(channel.to)} />;
}

const styles = StyleSheet.create({
  nav: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xs },
  status: { alignItems: "center", marginTop: space.xl, gap: 2 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 30, paddingHorizontal: 12, borderRadius: 15, marginTop: 10 },
  actions: { flexDirection: "row", alignItems: "flex-start", marginTop: space.xl, gap: 4 },
  boxHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.md, paddingTop: 14, paddingBottom: 4 },
});
