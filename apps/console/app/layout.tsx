import type { Metadata } from "next";
import localFont from "next/font/local";
import { palette, radius, space, tones } from "@vigie/shared";
import "./globals.css";

// Atkinson Hyperlegible Next, servie localement (pas d'appel à un CDN tiers).
const atkinson = localFont({
  src: [
    { path: "./fonts/AtkinsonHyperlegibleNext_400Regular.ttf", weight: "400" },
    { path: "./fonts/AtkinsonHyperlegibleNext_600SemiBold.ttf", weight: "600" },
    { path: "./fonts/AtkinsonHyperlegibleNext_700Bold.ttf", weight: "700" },
    { path: "./fonts/AtkinsonHyperlegibleNext_800ExtraBold.ttf", weight: "800" },
  ],
  variable: "--font",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vigie · Console conseiller",
  description: "Certifiez vos appels clients et suivez les faux appels signalés.",
  robots: { index: false, follow: false },
};

/** Les jetons du design system partagé deviennent des variables CSS : une seule source de vérité. */
const tokens = {
  "--ink": palette.ink,
  "--ink-soft": palette.inkSoft,
  "--ink-faint": palette.inkFaint,
  "--paper": palette.paper,
  "--surface": palette.surface,
  "--line": palette.line,
  "--accent": palette.accent,
  "--accent-pressed": palette.accentPressed,
  "--accent-soft": palette.accentSoft,
  ...Object.fromEntries(
    Object.entries(tones).flatMap(([name, t]) => [
      [`--${name}-fg`, t.fg],
      [`--${name}-bg`, t.bg],
      [`--${name}-solid`, t.solid],
    ]),
  ),
  "--r-sm": `${radius.sm}px`,
  "--r-md": `${radius.md}px`,
  "--r-lg": `${radius.lg}px`,
  "--s-sm": `${space.sm}px`,
  "--s-md": `${space.md}px`,
  "--s-lg": `${space.lg}px`,
  "--s-xl": `${space.xl}px`,
  "--s-xxl": `${space.xxl}px`,
};
const css = `:root{${Object.entries(tokens)
  .map(([k, v]) => `${k}:${v}`)
  .join(";")}}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={atkinson.variable}>
      <head>
        <style>{css}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
