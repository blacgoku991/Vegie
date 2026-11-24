import type { ReactNode } from "react";
import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { FadeIn } from "./Orb";
import { BackButton } from "./primitives";
import { Text } from "./Text";
import { DarkScope, useTheme } from "./ThemeProvider";
import { gutter, space, type Tone } from "./theme";

/**
 * Écran de verdict, construit comme l'écran d'appel du téléphone : toujours noir.
 * En haut, le verdict (icône + mot + couleur), puis la grande ligne (`headline` : le numéro ou le nom), une précision,
 * et le message. Les informations (`info`) et le contenu secondaire (`children`) défilent au milieu.
 * En bas, les actions (`actions`) : des ronds comme « Raccrocher », ou des boutons.
 */
export function VerdictScreen({ tone, icon, label, headline, numeric = false, title, subtitle, info, actions, children, back = true }: {
  tone: Tone;
  icon: IconName;
  label: string;
  /** Grande ligne sous le verdict : le numéro qui appelle (`numeric`) ou un nom. */
  headline?: string;
  numeric?: boolean;
  /** Précision sous la grande ligne. */
  title?: string;
  /** Message : ce qu'il faut comprendre et faire. */
  subtitle?: string;
  info?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  back?: boolean;
}) {
  return (
    <DarkScope>
      <StatusBar style="light" />
      <Body {...{ tone, icon, label, headline, numeric, title, subtitle, info, actions, children, back }} />
    </DarkScope>
  );
}

function Body({ tone, icon, label, headline, numeric, title, subtitle, info, actions, children, back }: Parameters<typeof VerdictScreen>[0]) {
  const { palette, tones } = useTheme();
  const fg = tones[tone].fg;
  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.column}>
            <View style={{ minHeight: 44, justifyContent: "center", alignItems: "flex-start" }}>{back ? <BackButton /> : null}</View>
            <FadeIn style={{ alignItems: "center", marginTop: space.lg }}>
              <View accessible accessibilityRole="header" accessibilityLabel={label} style={styles.verdict}>
                <Icon name={icon} size={17} color={fg} strokeWidth={2.2} />
                <Text variant="subhead" color={fg}>
                  {label}
                </Text>
              </View>
              {headline ? (
                <Text variant={numeric ? "number" : "title"} align="center" style={{ marginTop: 10 }}>
                  {headline}
                </Text>
              ) : null}
              {title ? (
                <Text variant="caption" color="faint" align="center" style={{ marginTop: 6 }}>
                  {title}
                </Text>
              ) : null}
            </FadeIn>
            {subtitle ? (
              <FadeIn delay={60} style={[styles.message, { backgroundColor: palette.surface }]}>
                <Text>{subtitle}</Text>
              </FadeIn>
            ) : null}
            {info ? (
              <FadeIn delay={100} style={{ marginTop: 12 }}>
                {info}
              </FadeIn>
            ) : null}
            {children ? <View style={{ marginTop: 12, gap: 10 }}>{children}</View> : null}
          </View>
        </ScrollView>
        {actions ? (
          <SafeAreaView edges={["bottom"]} style={styles.actions}>
            <View style={[styles.column, { gap: 10 }]}>{actions}</View>
          </SafeAreaView>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/** Rangée de ronds en bas de l'écran d'appel (deux ou trois `RoundAction` de 72 px). */
export function CallActions({ children }: { children: ReactNode }) {
  return <View style={styles.call}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: gutter, paddingBottom: space.lg },
  column: { width: "100%", maxWidth: 520, alignSelf: "center" },
  verdict: { flexDirection: "row", alignItems: "center", gap: 6 },
  message: { marginTop: space.xl, borderRadius: 16, padding: space.md },
  actions: { paddingHorizontal: gutter, paddingTop: 12, paddingBottom: 12 },
  call: { flexDirection: "row", justifyContent: "space-around", alignItems: "flex-start", paddingHorizontal: space.lg, paddingBottom: space.sm },
});
