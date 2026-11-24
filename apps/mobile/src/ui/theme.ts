import type { TextStyle } from "react-native";
import { fontFamily, palette, radius, space, tones, touch, typeScale, motion, type Tone, type TypeVariant } from "@vigie/shared";

export { fontFamily, palette, radius, space, tones, touch, typeScale, motion };
export type { Tone, TypeVariant };

/** Style typographique React Native depuis l'échelle partagée. */
export function typo(variant: TypeVariant): TextStyle {
  const t = typeScale[variant];
  return {
    fontFamily: fontFamily[t.weight],
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
}

export const shadow = {
  shadowColor: palette.ink,
  shadowOpacity: 0.06,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

/** Marges latérales de toutes les pages. */
export const gutter = space.lg;
