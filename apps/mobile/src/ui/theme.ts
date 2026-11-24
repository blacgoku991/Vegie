import type { TextStyle } from "react-native";
import { Platform } from "react-native";
import { brand, controls, controlSeparation, fontFamily, motion, radius, space, tabularVariants, textScales, touch, typeScale, type TextSize, type Tone, type TypeVariant } from "@vigie/shared";

// Les couleurs (palette, tones) dépendent du thème : les lire avec `useTheme()` (voir ThemeProvider.tsx).
export { brand, controls, controlSeparation, fontFamily, motion, radius, space, textScales, touch, typeScale };
export type { TextSize, Tone, TypeVariant };

let fontsFailed = false;
/** Appelé par la racine si Inter n'a pas pu se charger : toute l'app passe sur la police du système. */
export const setSystemFonts = (v: boolean) => {
  fontsFailed = v;
};

let textScale = 1;
/** Réglage « Taille du texte » : le ThemeProvider le pose avant de rendre l'arbre. */
export const setTextScale = (v: number) => {
  textScale = v;
};
export const scaled = (px: number) => Math.round(px * textScale);

const systemWeight: Record<keyof typeof fontFamily, TextStyle["fontWeight"]> = { light: "300", regular: "400", medium: "500", semibold: "600", bold: "700" };

/** Style typographique React Native depuis l'échelle partagée, taille du texte comprise. */
export function typo(variant: TypeVariant): TextStyle {
  const t = typeScale[variant];
  // Les libellés d'onglet ne grossissent pas : la barre a une hauteur fixe.
  const k = variant === "micro" ? 1 : textScale;
  return {
    ...(fontsFailed
      ? { fontFamily: Platform.OS === "web" ? "system-ui, -apple-system, 'Segoe UI', sans-serif" : "System", fontWeight: systemWeight[t.weight] }
      : { fontFamily: fontFamily[t.weight] }),
    fontSize: Math.round(t.size * k),
    lineHeight: Math.round(t.lineHeight * k),
    letterSpacing: t.letterSpacing,
    ...(tabularVariants.includes(variant) ? { fontVariant: ["tabular-nums" as const] } : null),
  };
}

/** Marges latérales de toutes les pages. */
export const gutter = space.md;
