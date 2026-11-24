import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { verdicts, type CheckStatus, type IconName, type Verdict } from "@vigie/shared";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { gutter, palette, radius, shadow, space, tones, touch, typo, type Tone } from "./theme";

// ───────────── Page ─────────────

export function Screen({
  children,
  title,
  back = false,
  footer,
  scroll = true,
  background = palette.paper,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  /** Action principale, collée en bas de l'écran. */
  footer?: ReactNode;
  scroll?: boolean;
  background?: string;
}) {
  const content = (
    <>
      {back || title ? <Header title={title} back={back} /> : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{content}</View>
      )}
      {footer ? <SafeAreaView edges={["bottom"]} style={[styles.footer, { backgroundColor: background }]}>{footer}</SafeAreaView> : null}
    </SafeAreaView>
  );
}

export function Header({ title, back }: { title?: string; back?: boolean }) {
  return (
    <View style={styles.header}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={12}
          style={styles.back}
        >
          <Icon name="back" size={28} color={palette.accent} />
          <Text variant="label" color="accent">
            Retour
          </Text>
        </Pressable>
      ) : null}
      {title ? (
        <Text variant="title" accessibilityRole="header" style={{ marginTop: back ? space.md : 0 }}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={styles.sectionHead}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      <View style={{ gap: space.sm + 4 }}>{children}</View>
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: Tone }) {
  return (
    <View style={[styles.card, tone ? { backgroundColor: tones[tone].bg, shadowOpacity: 0 } : null, style]}>{children}</View>
  );
}

// ───────────── Verdicts ─────────────

/** Verdict : toujours icône + mot + couleur. */
export function VerdictBadge({ verdict, size = "md", onTint }: { verdict: Verdict; size?: "md" | "lg"; onTint?: boolean }) {
  const v = verdicts[verdict];
  return <ToneBadge tone={v.tone} icon={v.icon} label={v.label} size={size} onTint={onTint} />;
}

/** `onTint` : posé sur un fond déjà teinté (carte de verdict), le badge passe en blanc pour rester visible. */
export function ToneBadge({ tone, icon, label, size = "md", onTint }: { tone: Tone; icon: IconName; label: string; size?: "md" | "lg"; onTint?: boolean }) {
  const t = tones[tone];
  const lg = size === "lg";
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: onTint ? palette.surface : t.bg, paddingVertical: lg ? 10 : 6, paddingHorizontal: lg ? 18 : 12 }]}
    >
      <Icon name={icon} size={lg ? 24 : 20} color={t.fg} strokeWidth={2.4} />
      <Text variant={lg ? "bodyStrong" : "label"} color={t.fg}>
        {label}
      </Text>
    </View>
  );
}

const checkLook: Record<CheckStatus, { tone: Tone; icon: IconName; label: string }> = {
  ok: { tone: "positive", icon: "check", label: "Normal" },
  warning: { tone: "warning", icon: "alert", label: "Attention" },
  danger: { tone: "danger", icon: "stop", label: "Danger" },
  unknown: { tone: "neutral", icon: "clock", label: "Non vérifié" },
};

export function CheckStatusBadge({ status }: { status: CheckStatus }) {
  const c = checkLook[status];
  return <ToneBadge tone={c.tone} icon={c.icon} label={c.label} />;
}

// ───────────── Listes ─────────────

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
  iconTone,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  iconTone?: Tone;
}) {
  const body = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconTone ? tones[iconTone].bg : palette.accentSoft }]}>
          <Icon name={icon} color={iconTone ? tones[iconTone].fg : palette.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? <Text color="soft" variant="caption">{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" color={palette.inkFaint} /> : null)}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.accentSoft }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

export function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? <Text color="soft" variant="caption">{subtitle}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: palette.accent, false: palette.line }}
        thumbColor={palette.surface}
        style={{ transform: [{ scale: 1.15 }] }}
      />
    </View>
  );
}

// ───────────── Formulaires ─────────────

export function Field({ label, help, error, ...input }: TextInputProps & { label: string; help?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.inkFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          typo("heading"),
          { fontSize: 24, borderColor: error ? tones.danger.solid : focused ? palette.accent : palette.line },
        ]}
        {...input}
      />
      {error ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Icon name="alert" size={20} color={tones.danger.fg} />
          <Text variant="caption" color={tones.danger.fg} style={{ flex: 1 }}>
            {error}
          </Text>
        </View>
      ) : help ? (
        <Text variant="caption" color="soft">
          {help}
        </Text>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? { backgroundColor: palette.ink, borderColor: palette.ink } : null]}
    >
      {icon ? <Icon name={icon} size={20} color={selected ? palette.surface : palette.ink} /> : null}
      <Text variant="label" color={selected ? palette.surface : palette.ink}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.md }}>
      <View style={[styles.rowIcon, { width: 72, height: 72, borderRadius: 36 }]}>
        <Icon name={icon} size={34} color={palette.accent} />
      </View>
      <Text variant="heading" align="center">
        {title}
      </Text>
      <Text color="soft" align="center">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: gutter, paddingBottom: space.xxl },
  footer: { paddingHorizontal: gutter, paddingTop: space.md, paddingBottom: space.md, gap: space.sm + 4 },
  header: { paddingTop: space.md, paddingBottom: space.md },
  back: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: touch.min, alignSelf: "flex-start", marginLeft: -6 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  card: { backgroundColor: palette.surface, borderRadius: radius.lg, padding: space.lg, ...shadow },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, alignSelf: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 76,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius.md,
  },
  rowIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: palette.accentSoft },
  input: {
    minHeight: touch.button,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: palette.surface,
    color: palette.ink,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: palette.line,
    backgroundColor: palette.surface,
  },
});
