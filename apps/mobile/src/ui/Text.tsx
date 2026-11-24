import { Text as RNText, type TextProps } from "react-native";
import { useTheme } from "./ThemeProvider";
import { typo, type TypeVariant } from "./theme";

type Color = "ink" | "soft" | "faint" | "accent" | "inverse" | (string & {});

export function Text({
  variant = "body",
  color = "ink",
  align,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; color?: Color; align?: "left" | "center" | "right" }) {
  const { palette } = useTheme();
  const colors: Record<string, string> = {
    ink: palette.ink,
    soft: palette.inkSoft,
    faint: palette.inkFaint,
    accent: palette.accent,
    inverse: "#FFFFFF",
  };
  return (
    <RNText
      style={[typo(variant), { color: colors[color] ?? color, textAlign: align }, style]}
      {...rest}
    />
  );
}
