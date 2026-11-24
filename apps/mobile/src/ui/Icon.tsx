import { Platform } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { iconPaths, type IconName } from "@vigie/shared";
import { useTheme } from "./ThemeProvider";

/** Icône du jeu Vigie (tracés partagés avec la console, voir @vigie/shared/icons). */
const hiddenA11y: Record<string, unknown> =
  Platform.OS === "web" ? { "aria-hidden": true } : { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" };

export function Icon({ name, size = 24, color, strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const { palette } = useTheme();
  color = color ?? palette.ink;
  const p = iconPaths[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...hiddenA11y}>
      {p.circles?.map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} />
      ))}
      {p.d.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
