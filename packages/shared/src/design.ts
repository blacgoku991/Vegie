/**
 * Design system Vigie — tokens partagés (app mobile + console banque).
 *
 * Principes :
 *  - Calme et lisible : fond papier chaud, encre presque noire, une seule couleur d'accent.
 *  - Pensé pour 75 ans : texte ≥ 17 px, cibles tactiles ≥ 56 px, contraste AA minimum
 *    (vérifié par `design.test.ts`).
 *  - Les verdicts ont chacun une couleur, une icône et un mot. Jamais la couleur seule.
 */

export const palette = {
  /** Encre principale (titres, texte courant). */
  ink: "#14151B",
  /** Texte secondaire. */
  inkSoft: "#4A4D59",
  /** Texte tertiaire (horodatages, aides). Reste AA sur `paper`. */
  inkFaint: "#5F6370",
  /** Fond de l'app — papier chaud, moins éblouissant qu'un blanc pur. */
  paper: "#F7F5F0",
  /** Surfaces posées sur le fond (cartes, feuilles). */
  surface: "#FFFFFF",
  /** Filets et séparateurs. */
  line: "#E5E1D8",
  /** L'unique couleur d'accent : le bleu Vigie. */
  accent: "#2B3AD4",
  accentPressed: "#1F2BAA",
  accentSoft: "#ECEEFC",
  onAccent: "#FFFFFF",
} as const;

export type Tone = "positive" | "warning" | "danger" | "neutral";

/** Couleurs par tonalité. `fg` sur `bg` et `onSolid` sur `solid` respectent l'AA. */
export const tones: Record<Tone, { fg: string; bg: string; solid: string; onSolid: string; ring: string }> = {
  positive: { fg: "#0A6B3D", bg: "#E3F2E8", solid: "#0A6B3D", onSolid: "#FFFFFF", ring: "#9CD3B2" },
  warning: { fg: "#8A4300", bg: "#FCEEDB", solid: "#A14E00", onSolid: "#FFFFFF", ring: "#F2C58E" },
  danger: { fg: "#A8201A", bg: "#FCEAE8", solid: "#B3261E", onSolid: "#FFFFFF", ring: "#F0A9A3" },
  neutral: { fg: "#4A4D59", bg: "#EFEDE7", solid: "#4A4D59", onSolid: "#FFFFFF", ring: "#D6D2C8" },
};

export const fontFamily = {
  /** Atkinson Hyperlegible Next — dessinée par le Braille Institute pour les personnes malvoyantes. */
  regular: "AtkinsonHyperlegibleNext_400Regular",
  medium: "AtkinsonHyperlegibleNext_500Medium",
  semibold: "AtkinsonHyperlegibleNext_600SemiBold",
  bold: "AtkinsonHyperlegibleNext_700Bold",
  extrabold: "AtkinsonHyperlegibleNext_800ExtraBold",
  /** Nom de la famille côté web (Google Fonts). */
  web: "'Atkinson Hyperlegible Next', system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

export type TypeVariant = "display" | "title" | "heading" | "body" | "bodyStrong" | "label" | "caption";

/** Échelle typographique (px). Le plus petit texte fait 17 px. */
export const typeScale: Record<
  TypeVariant,
  { size: number; lineHeight: number; weight: keyof typeof fontFamily; letterSpacing: number }
> = {
  display: { size: 44, lineHeight: 50, weight: "extrabold", letterSpacing: -0.8 },
  title: { size: 32, lineHeight: 38, weight: "bold", letterSpacing: -0.4 },
  heading: { size: 24, lineHeight: 30, weight: "bold", letterSpacing: -0.2 },
  body: { size: 20, lineHeight: 29, weight: "regular", letterSpacing: 0 },
  bodyStrong: { size: 20, lineHeight: 29, weight: "semibold", letterSpacing: 0 },
  label: { size: 18, lineHeight: 24, weight: "semibold", letterSpacing: 0.1 },
  caption: { size: 17, lineHeight: 23, weight: "regular", letterSpacing: 0.1 },
};

/** Espacements sur une base de 4. */
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 72 } as const;

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 } as const;

/** Tailles de cibles tactiles. WCAG demande 44, Android 48 : on vise plus large. */
export const touch = { min: 56, button: 64, hero: 72 } as const;

/** Mouvements doux : rien de brusque, rien qui clignote. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 480,
  /** Respiration lente de l'orbe d'état sur l'accueil. */
  breath: 3600,
  /** Courbe « standard » (cubic-bezier). */
  easing: [0.2, 0, 0, 1] as const,
} as const;

export const elevation = {
  card: { shadowColor: "#14151B", shadowOpacity: 0.06, shadowRadius: 24, shadowOffsetY: 8 },
} as const;

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
