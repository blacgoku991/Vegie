import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";
import { controls, space, touch } from "./theme";

type Variant = "primary" | "danger" | "positive" | "secondary" | "ghost" | "light";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  size?: "md" | "hero";
  loading?: boolean;
  disabled?: boolean;
  /** Précision lue par le lecteur d'écran. */
  hint?: string;
  style?: ViewStyle;
}

const tap = () => {
  if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

/**
 * Bouton : 50 px de haut, coins de 14, texte 16 semi-gras.
 * primary = blanc sur noir (noir sur blanc en thème clair) ; secondary = gris ; danger = rouge ; ghost = texte seul.
 */
export function Button({ label, onPress, variant = "primary", icon, size = "md", loading, disabled, hint, style }: ButtonProps) {
  const { palette, tones } = useTheme();
  const looks: Record<Variant, { bg: string; fg: string }> = {
    primary: { bg: palette.accentSolid, fg: palette.onAccent },
    danger: { bg: tones.danger.solid, fg: tones.danger.onSolid },
    positive: { bg: tones.positive.solid, fg: tones.positive.onSolid },
    secondary: { bg: palette.surfaceHigh, fg: palette.ink },
    ghost: { bg: "transparent", fg: palette.ink },
    light: { bg: "#FFFFFF", fg: "#000000" },
  };
  const look = looks[variant];
  const fg = disabled ? palette.inkFaint : look.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: size === "hero" ? controls.hero : controls.button, backgroundColor: disabled && variant !== "ghost" ? palette.surface : look.bg, opacity: pressed ? 0.72 : 1 },
        variant === "ghost" && { minHeight: touch.min },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} color={fg} size={20} strokeWidth={2} /> : null}
          <Text variant="action" color={fg} align="center" style={{ flexShrink: 1 }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Action ronde avec son libellé dessous (accueil : 56 px ; écran d'appel : 72 px). `tone` colore le rond. */
export function RoundAction({ icon, label, onPress, tone = "neutral", size = controls.round, hint }: {
  icon: IconName; label: string; onPress?: () => void; tone?: "neutral" | "primary" | "danger" | "positive"; size?: number; hint?: string;
}) {
  const { palette, tones } = useTheme();
  const look = {
    neutral: { bg: palette.surface, fg: palette.ink },
    primary: { bg: palette.accentSolid, fg: palette.onAccent },
    danger: { bg: tones.danger.solid, fg: tones.danger.onSolid },
    positive: { bg: tones.positive.solid, fg: tones.positive.onSolid },
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.round, { opacity: pressed ? 0.72 : 1 }]}
    >
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: look.bg, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={look.fg} size={Math.round(size * 0.43)} strokeWidth={size >= 72 ? 1.9 : 1.8} />
      </View>
      <Text variant="footnote" color="soft" align="center" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: space.md, paddingVertical: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  round: { flex: 1, alignItems: "center", gap: space.sm, minWidth: 0 },
});

