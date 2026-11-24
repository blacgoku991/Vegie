import { Text as RNText, type TextProps } from "react-native";
import { palette, typo, type TypeVariant } from "./theme";

type Color = "ink" | "soft" | "faint" | "accent" | "inverse" | (string & {});

const colors: Record<string, string> = {
  ink: palette.ink,
  soft: palette.inkSoft,
  faint: palette.inkFaint,
  accent: palette.accent,
  inverse: "#FFFFFF",
};

export function Text({
  variant = "body",
  color = "ink",
  align,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; color?: Color; align?: "left" | "center" | "right" }) {
  return (
    <RNText
      // Le texte suit le réglage de taille du téléphone, avec une limite pour garder la mise en page.
      maxFontSizeMultiplier={1.6}
      style={[typo(variant), { color: colors[color] ?? color, textAlign: align }, style]}
      {...rest}
    />
  );
}
