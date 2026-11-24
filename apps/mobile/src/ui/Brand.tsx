import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { brand } from "@vigie/shared";

/** Logo SmartSecure : bouclier + coche sur le dégradé de marque. Seul endroit de l'app où ce dégradé apparaît. */
export function Logo({ size = 72 }: { size?: number }) {
  const id = `lg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="Logo SmartSecure">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={brand.colors[0]} />
          <Stop offset="0.42" stopColor={brand.colors[1]} />
          <Stop offset="0.85" stopColor={brand.colors[2]} />
        </LinearGradient>
      </Defs>
      <Rect width="1024" height="1024" rx="230" fill={`url(#${id})`} />
      <Path
        d="M512 250 C600 300 680 318 740 322 V520 C740 650 640 740 512 790 C384 740 284 650 284 520 V322 C344 318 424 300 512 250 Z M415 522 L488 594 L615 462"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={58}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path fill="#FFFFFF" d="M790 200 Q799 254 852 263 Q799 272 790 326 Q781 272 728 263 Q781 254 790 200 Z" />
    </Svg>
  );
}
