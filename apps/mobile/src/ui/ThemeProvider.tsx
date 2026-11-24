import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { textScales, themes, type Palette, type TextSize, type ToneSet } from "@vigie/shared";
import { secure } from "@/storage";
import { setTextScale } from "./theme";

export type ThemePreference = "system" | "light" | "dark";

export interface Theme {
  dark: boolean;
  palette: Palette;
  tones: ToneSet;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Réglage « Taille du texte » (Profil). */
  textSize: TextSize;
  setTextSize: (s: TextSize) => void;
}

const THEME_KEY = "theme-preference";
const TEXT_KEY = "text-size";

const build = (dark: boolean, rest: Omit<Theme, "dark" | "palette" | "tones">): Theme => ({ ...rest, dark, ...(dark ? themes.dark : themes.light) });

const ThemeContext = createContext<Theme>(build(true, { preference: "dark", setPreference: () => {}, textSize: "normal", setTextSize: () => {} }));

/** Thème : noir par défaut ; choix Système / Clair / Sombre et taille du texte mémorisés (Profil). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>("dark");
  const [textSize, setSize] = useState<TextSize>("normal");

  useEffect(() => {
    void secure.get(THEME_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setPref(v);
    });
    void secure.get(TEXT_KEY).then((v) => {
      if (v === "normal" || v === "large" || v === "larger") setSize(v);
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    void secure.set(THEME_KEY, p).catch(() => {});
  }, []);
  const setTextSize = useCallback((s: TextSize) => {
    setSize(s);
    void secure.set(TEXT_KEY, s).catch(() => {});
  }, []);

  // Posé pendant le rendu : chaque <Text> le lit en se redessinant (ils dépendent tous de ce contexte).
  setTextScale(textScales[textSize]);

  const value = useMemo<Theme>(() => {
    const dark = preference === "system" ? system !== "light" : preference === "dark";
    return build(dark, { preference, setPreference, textSize, setTextSize });
  }, [preference, system, setPreference, textSize, setTextSize]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Force le thème sombre pour un sous-arbre (écrans d'appel). */
export function DarkScope({ children }: { children: ReactNode }) {
  const parent = useContext(ThemeContext);
  const value = useMemo(() => build(true, parent), [parent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
