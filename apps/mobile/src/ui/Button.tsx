import { useRef } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { motion, palette, radius, space, tones, touch } from "./theme";

type Variant = "primary" | "danger" | "positive" | "secondary" | "ghost";

const looks: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: palette.accent, fg: palette.onAccent },
  danger: { bg: tones.danger.solid, fg: tones.danger.onSolid },
  positive: { bg: tones.positive.solid, fg: tones.positive.onSolid },
  secondary: { bg: palette.surface, fg: palette.ink, border: palette.line },
  ghost: { bg: "transparent", fg: palette.accent },
};

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

/** Bouton : 64 px de haut (72 px en « hero »), texte 20 px, retour haptique doux. */
export function Button({ label, onPress, variant = "primary", icon, size = "md", loading, disabled, hint, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const look = looks[variant];
  const animate = (to: number) =>
    Animated.timing(scale, { toValue: to, duration: motion.fast, useNativeDriver: Platform.OS !== "web" }).start();

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.45 : 1 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        disabled={disabled || loading}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        onPress={() => {
          if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={({ pressed }) => [
          styles.base,
          {
            minHeight: size === "hero" ? touch.hero : touch.button,
            backgroundColor: pressed && variant === "primary" ? palette.accentPressed : look.bg,
            borderColor: look.border ?? "transparent",
            borderWidth: look.border ? 2 : 0,
            paddingHorizontal: variant === "ghost" ? space.sm : space.lg,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={look.fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Icon name={icon} color={look.fg} size={size === "hero" ? 28 : 24} /> : null}
            <Text variant={size === "hero" ? "heading" : "bodyStrong"} color={look.fg} align="center" style={{ fontSize: size === "hero" ? 22 : 20, flexShrink: 1 }}>
              {label}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm + 4 },
});
