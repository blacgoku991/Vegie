import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, View } from "react-native";
import { useTheme } from "./ThemeProvider";
import { motion } from "./theme";

const native = Platform.OS !== "web";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

/** Apparition douce (fondu + léger glissement). Coupée si « Réduire les animations ». */
export function FadeIn({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const animation = Animated.timing(v, { toValue: 1, duration: motion.base, delay, easing: Easing.bezier(...motion.easing), useNativeDriver: native });
    animation.start();
    return () => animation.stop();
  }, [v, delay, reduced]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>{children}</Animated.View>
  );
}

/** Vérification en cours : un point central et deux ondes qui s'éloignent, comme un appel qui sonne. */
export function Pulse({ size = 160, color: colorProp }: { size?: number; color?: string }) {
  const { palette } = useTheme();
  const color = colorProp ?? palette.ink;
  const reduced = useReducedMotion();
  const waves = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    if (reduced) return;
    const loops = waves.map((w, i) =>
      Animated.loop(
        Animated.sequence([Animated.delay(i * 700), Animated.timing(w, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: native })]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  const core = Math.round(size * 0.4);
  return (
    <View accessible={false} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      {waves.map((w, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: core,
            height: core,
            borderRadius: core / 2,
            borderWidth: 1.5,
            borderColor: color,
            opacity: reduced ? (i === 0 ? 0.25 : 0) : w.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: reduced ? 1.6 : w.interpolate({ inputRange: [0, 1], outputRange: [1, size / core] }) }],
          }}
        />
      ))}
      <View style={{ width: core, height: core, borderRadius: core / 2, backgroundColor: palette.surface, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      </View>
    </View>
  );
}
