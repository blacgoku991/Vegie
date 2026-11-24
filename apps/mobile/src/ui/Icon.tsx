import Svg, { Circle, Path } from "react-native-svg";
import { iconPaths, type IconName } from "@vigie/shared";
import { palette } from "./theme";

/** Icône du jeu Vigie (tracés partagés avec la console, voir @vigie/shared/icons). */
export function Icon({ name, size = 24, color = palette.ink, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const p = iconPaths[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {p.circles?.map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} stroke={color} strokeWidth={strokeWidth} />
      ))}
      {p.d.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}
