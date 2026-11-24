import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { FadeIn, useReducedMotion } from "./Orb";
import { Text } from "./Text";
import { gutter, palette, radius, space, tones, type Tone } from "./theme";

/**
 * Écran de verdict plein cadre : bandeau de couleur (vert certifié, rouge non certifié),
 * pastille icône + mot, titre géant, puis une feuille blanche avec les actions.
 * Même structure pour tous les verdicts : on apprend l'écran une fois.
 */
export function VerdictScreen({
  tone,
  icon,
  label,
  title,
  subtitle,
  children,
}: {
  tone: Tone;
  icon: IconName;
  label: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = tones[tone];
  const reduced = useReducedMotion();
  const pop = useRef(new Animated.Value(reduced ? 1 : 0.6)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: Platform.OS !== "web" }).start();
  }, [pop, reduced]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.solid }} contentContainerStyle={{ flexGrow: 1 }}>
      <SafeAreaView edges={["top"]} style={styles.top}>
        {/* Verdict : icône + mot, toujours ensemble. */}
        <View style={styles.verdictRow} accessible accessibilityLabel={label}>
          <Animated.View style={[styles.mark, { transform: [{ scale: pop }] }]}>
            <Icon name={icon} color={t.solid} size={32} strokeWidth={2.8} />
          </Animated.View>
          <Text variant="heading" color="inverse">
            {label}
          </Text>
        </View>
        <FadeIn style={{ gap: space.md }} delay={80}>
          <Text variant="display" color="inverse" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text color="inverse" style={{ opacity: 0.95 }}>
              {subtitle}
            </Text>
          ) : null}
        </FadeIn>
      </SafeAreaView>
      <View style={styles.sheet}>
        <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
          <FadeIn delay={180} style={{ gap: space.sm + 4, padding: gutter, paddingTop: space.lg }}>
            {children}
          </FadeIn>
        </SafeAreaView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: gutter, paddingTop: space.lg, paddingBottom: space.xl, gap: space.lg },
  verdictRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  mark: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  sheet: { flex: 1, backgroundColor: palette.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
