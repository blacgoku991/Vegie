/**
 * Design system SmartSecure — jetons de l'app mobile (direction « Noir », choisie par le propriétaire le 24/11/2026).
 * La console banque a ses propres couleurs (apps/console/app/globals.css).
 *
 * Principes :
 *  - Noir et blanc, façon app bancaire moderne. La couleur ne sert qu'aux verdicts (vert, orange, rouge).
 *  - Tailles d'une vraie app (texte 16, boutons 50). Un réglage « Texte plus grand » agrandit tout pour ceux qui en ont besoin.
 *  - Contraste AA partout (vérifié par `design.test.ts`). Un verdict = icône + mot + couleur, jamais la couleur seule.
 */

export interface Palette {
  /** Texte principal. */
  ink: string;
  /** Texte secondaire appuyé. */
  inkSoft: string;
  /** Texte atténué (sous-titres, horodatages). Reste AA sur toutes les surfaces. */
  inkFaint: string;
  /** Fond de l'app. */
  paper: string;
  /** Cartes et groupes posés sur le fond. */
  surface: string;
  /** Éléments posés sur une carte (pastilles d'icône, boutons secondaires). */
  surfaceHigh: string;
  /** Filets et séparateurs. */
  line: string;
  /** Contour des champs : ≥ 3:1 sur chaque surface. */
  control: string;
  /** Accent pour le texte et les icônes : c'est l'encre elle-même (design monochrome). */
  accent: string;
  /** Bouton principal : texte `onAccent` dessus. */
  accentSolid: string;
  accentPressed: string;
  /** Fond des pastilles d'icône. */
  accentSoft: string;
  onAccent: string;
}

/** Thème sombre (par défaut) : noir pur, cartes gris anthracite. */
export const paletteDark: Palette = {
  ink: "#FFFFFF",
  inkSoft: "#D1D1D6",
  inkFaint: "#98989F",
  paper: "#000000",
  surface: "#1C1C1E",
  surfaceHigh: "#2C2C2E",
  line: "#38383A",
  control: "#7C7C80",
  accent: "#FFFFFF",
  accentSolid: "#FFFFFF",
  accentPressed: "#D1D1D6",
  accentSoft: "#2C2C2E",
  onAccent: "#000000",
};

/** Thème clair : le même, inversé. */
export const palette: Palette = {
  ink: "#000000",
  inkSoft: "#3A3A3C",
  inkFaint: "#5F5F64",
  paper: "#FFFFFF",
  surface: "#F2F2F7",
  surfaceHigh: "#E5E5EA",
  line: "#D1D1D6",
  control: "#7C7C80",
  accent: "#000000",
  accentSolid: "#000000",
  accentPressed: "#3A3A3C",
  accentSoft: "#E5E5EA",
  onAccent: "#FFFFFF",
};

/** Couleurs de la marque SmartFixx : réservées au logo. */
export const brand = { colors: ["#6A4DFF", "#B23CF5", "#FF6A3D"] as const } as const;

export type Tone = "positive" | "warning" | "danger" | "neutral";

/** Couleurs par tonalité. `fg` sur `bg` et sur les surfaces, `onSolid` sur `solid` : AA. */
export type ToneSet = Record<Tone, { fg: string; bg: string; solid: string; onSolid: string; ring: string }>;

export const tonesDark: ToneSet = {
  positive: { fg: "#30D158", bg: "#0F2A18", solid: "#1A7F37", onSolid: "#FFFFFF", ring: "#1F5A30" },
  warning: { fg: "#FF9F0A", bg: "#33240A", solid: "#A35200", onSolid: "#FFFFFF", ring: "#6B4A12" },
  danger: { fg: "#FF6B61", bg: "#3A1512", solid: "#D92D20", onSolid: "#FFFFFF", ring: "#7A2A24" },
  neutral: { fg: "#D1D1D6", bg: "#2C2C2E", solid: "#48484A", onSolid: "#FFFFFF", ring: "#48484A" },
};

export const tones: ToneSet = {
  positive: { fg: "#146C2E", bg: "#E3F4E8", solid: "#146C2E", onSolid: "#FFFFFF", ring: "#A8D8B5" },
  warning: { fg: "#8A4B00", bg: "#FCEFD9", solid: "#A35200", onSolid: "#FFFFFF", ring: "#EFC98A" },
  danger: { fg: "#B3261E", bg: "#FDECEA", solid: "#D92D20", onSolid: "#FFFFFF", ring: "#F1AAA4" },
  neutral: { fg: "#3A3A3C", bg: "#E5E5EA", solid: "#3A3A3C", onSolid: "#FFFFFF", ring: "#C7C7CC" },
};

export type ThemeName = "light" | "dark";
export const themes = {
  light: { palette, tones },
  dark: { palette: paletteDark, tones: tonesDark },
} as const;

/** Inter : proche de la police système de l'iPhone, identique sur Android et dans le navigateur. */
export const fontFamily = {
  light: "Inter_300Light",
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type TypeVariant =
  | "display"
  | "title"
  | "heading"
  | "subhead"
  | "body"
  | "bodyStrong"
  | "label"
  | "caption"
  | "footnote"
  | "micro"
  | "action"
  | "input"
  | "numeric"
  | "number";

/** Échelle typographique (px), calée sur celle d'iOS. */
export const typeScale: Record<TypeVariant, { size: number; lineHeight: number; weight: keyof typeof fontFamily; letterSpacing: number }> = {
  /** Le mot d'état de l'accueil. */
  display: { size: 40, lineHeight: 46, weight: "bold", letterSpacing: -0.8 },
  /** Grand titre d'écran. */
  title: { size: 28, lineHeight: 34, weight: "bold", letterSpacing: -0.4 },
  /** Titre de section. */
  heading: { size: 20, lineHeight: 25, weight: "semibold", letterSpacing: -0.3 },
  /** En-tête de carte, titre de barre de navigation. */
  subhead: { size: 16, lineHeight: 21, weight: "semibold", letterSpacing: -0.1 },
  body: { size: 16, lineHeight: 22, weight: "regular", letterSpacing: 0 },
  /** Titre d'une ligne de liste. */
  bodyStrong: { size: 16, lineHeight: 22, weight: "medium", letterSpacing: 0 },
  /** Libellé appuyé : verdicts, pastilles, puces. */
  label: { size: 14, lineHeight: 19, weight: "semibold", letterSpacing: 0 },
  /** Sous-titre d'une ligne, aide. */
  caption: { size: 14, lineHeight: 19, weight: "regular", letterSpacing: 0 },
  footnote: { size: 13, lineHeight: 18, weight: "regular", letterSpacing: 0 },
  /** Libellés de la barre d'onglets uniquement. */
  micro: { size: 11, lineHeight: 13, weight: "medium", letterSpacing: 0.1 },
  action: { size: 16, lineHeight: 22, weight: "semibold", letterSpacing: 0 },
  input: { size: 16, lineHeight: 22, weight: "regular", letterSpacing: 0 },
  /** Saisie du numéro et du code : chiffres tabulaires. */
  numeric: { size: 22, lineHeight: 28, weight: "semibold", letterSpacing: 0.5 },
  /** Le numéro qui appelle, sur l'écran d'appel. */
  number: { size: 34, lineHeight: 41, weight: "light", letterSpacing: 0.3 },
};

/** Les styles qui demandent des chiffres de même largeur. */
export const tabularVariants: readonly TypeVariant[] = ["numeric", "number"];

/** Réglage « Taille du texte » (Profil) : facteur appliqué à toute l'échelle. */
export const textScales = { normal: 1, large: 1.15, larger: 1.3 } as const;
export type TextSize = keyof typeof textScales;

/** Espacements sur une base de 4. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 72 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

/** Cible tactile minimale (zone d'appui comprise) : 44 px, comme iOS. */
export const touch = { min: 44 } as const;

/** Hauteurs des commandes (px). Aucune sous 40 ; la zone d'appui fait toujours au moins 44. */
export const controls = { button: 50, hero: 56, chip: 40, segment: 40, option: 48, field: 50, codeBox: 56, tab: 49, row: 60, link: 44, round: 56, call: 72 } as const;
export const controlSeparation = 8;

export const motion = { fast: 160, base: 240, slow: 420, easing: [0.2, 0, 0, 1] as const } as const;

/** Contraste WCAG entre deux couleurs hexadécimales (#RRGGBB). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
