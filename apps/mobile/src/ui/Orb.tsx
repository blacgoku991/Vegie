import { useEffect, useId, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { motion, palette, tones, type Tone } from "./theme";

const native = Platform.OS !== "web";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

const orbColors: Record<"accent" | Tone, { core: string; glow: string; halo: string }> = {
  accent: { core: palette.accent, glow: "#5563EE", halo: palette.accentSoft },
  positive: { core: tones.positive.solid, glow: "#2E9A63", halo: tones.positive.bg },
  warning: { core: tones.warning.solid, glow: "#C9741E", halo: tones.warning.bg },
  danger: { core: tones.danger.solid, glow: "#D6473F", halo: tones.danger.bg },
  neutral: { core: tones.neutral.solid, glow: "#6B6E7A", halo: tones.neutral.bg },
};

/**
 * Orbe d'état : un cœur lumineux qui « respire » lentement, entouré de halos.
 * Le mouvement est coupé si l'utilisateur a activé « Réduire les animations ».
 */
export function Orb({ size = 220, tone = "accent", icon = "shield", halo }: { size?: number; tone?: "accent" | Tone; icon?: IconName; halo?: string }) {
  const reduced = useReducedMotion();
  // Identifiant unique : plusieurs orbes peuvent coexister (écrans empilés sur le web).
  const gradientId = `orb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const breath = useRef(new Animated.Value(0)).current;
  const c = { ...orbColors[tone], ...(halo ? { halo } : {}) };

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: motion.breath / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(breath, { toValue: 0, duration: motion.breath / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, breath]);

  const haloScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const coreScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const core = size * 0.5;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: c.halo, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
      />
      <View style={{ position: "absolute", width: size * 0.74, height: size * 0.74, borderRadius: size, backgroundColor: c.halo }} />
      <Animated.View style={{ width: core, height: core, transform: [{ scale: coreScale }] }}>
        <Svg width={core} height={core}>
          <Defs>
            <RadialGradient id={gradientId} cx="38%" cy="32%" r="75%">
              <Stop offset="0" stopColor={c.glow} />
              <Stop offset="1" stopColor={c.core} />
            </RadialGradient>
          </Defs>
          <Circle cx={core / 2} cy={core / 2} r={core / 2} fill={`url(#${gradientId})`} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <Icon name={icon} size={core * 0.46} color="#FFFFFF" strokeWidth={1.8} />
        </View>
      </Animated.View>
    </View>
  );
}

/** Apparition douce (fondu + léger glissement) pour les blocs d'un écran. */
export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: motion.slow, delay, easing: Easing.bezier(...motion.easing), useNativeDriver: native }).start();
  }, [v, delay]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pulsation (vérification en cours). */
export function Pulse({ size = 180, color = palette.accent }: { size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    if (reduced) return;
    const loops = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 700),
          Animated.timing(r, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: native }),
          Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: native }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: size / 2,
              borderWidth: 3,
              borderColor: color,
              opacity: r.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }],
            },
          ]}
        />
      ))}
      <View style={{ width: size * 0.42, height: size * 0.42, borderRadius: size, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        <Icon name="phone" size={size * 0.18} color="#FFFFFF" />
      </View>
    </View>
  );
}
