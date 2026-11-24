import { Children, createContext, useContext, useId, useState, type ReactNode } from "react";
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { verdictMeta, type CheckStatus, type IconName, type Verdict } from "@vigie/shared";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";
import { controls, controlSeparation, gutter, radius, scaled, space, typo, type Tone } from "./theme";

// ───────────── Page ─────────────

export function Screen({
  children,
  title,
  back = false,
  footer,
  scroll = true,
  background: backgroundProp,
  right,
}: {
  children: ReactNode;
  title?: string;
  back?: boolean;
  /** Action principale, collée en bas de l'écran. */
  footer?: ReactNode;
  scroll?: boolean;
  background?: string;
  /** Écran d'onglet (conservé pour compatibilité : la barre d'onglets a sa propre place). */
  tabbed?: boolean;
  /** Bouton à droite de la barre de navigation. */
  right?: ReactNode;
}) {
  const { palette } = useTheme();
  const content = (
    <>
      <Header title={title} back={back} right={right} />
      {children}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: backgroundProp ?? palette.paper }}>
      <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.column}>{content}</View>
          </ScrollView>
        ) : (
          <View style={[styles.scroll, { flex: 1 }]}>
            <View style={[styles.column, { flex: 1 }]}>{content}</View>
          </View>
        )}
        {footer ? (
          <SafeAreaView edges={["bottom"]} style={styles.footer}>
            <View style={[styles.column, { gap: 10 }]}>{footer}</View>
          </SafeAreaView>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/** Bouton rond de barre de navigation (36 px, zone d'appui de 44). */
export function NavButton({ icon, label, onPress, onDark = false }: { icon: IconName; label: string; onPress: () => void; onDark?: boolean }) {
  const { palette } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.navButton, { backgroundColor: onDark ? "rgba(255,255,255,0.12)" : palette.surface, opacity: pressed ? 0.7 : 1 }]}>
      <Icon name={icon} size={20} color={onDark ? "#FFFFFF" : palette.ink} strokeWidth={2} />
    </Pressable>
  );
}

export function BackButton({ onDark = false }: { onDark?: boolean }) {
  return <NavButton icon="back" label="Retour" onDark={onDark} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />;
}

export function Header({ title, back, right }: { title?: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {back || right ? (
        <View style={styles.navRow}>
          {back ? <BackButton /> : <View />}
          {right}
        </View>
      ) : null}
      {title ? (
        <Text variant="title" accessibilityRole="header" style={{ marginTop: back || right ? space.sm : space.md }}>
          {title}
        </Text>
      ) : null}
    </View>
  );
}

const GroupContext = createContext(false);

export function Section({ title, children, action, group = false }: { title: string; children: ReactNode; action?: ReactNode; group?: boolean }) {
  return (
    <View style={{ marginTop: space.lg + 4 }}>
      <View style={styles.sectionHead}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {group ? <Group>{children}</Group> : <View style={{ gap: 10 }}>{children}</View>}
    </View>
  );
}

/** Surface d'une carte (gris anthracite, coins de 20). */
export function useCardSurface() {
  const { palette } = useTheme();
  return [{ backgroundColor: palette.surface, borderRadius: radius.xl } as ViewStyle] as const;
}

/** Groupe de lignes : une carte, des séparateurs fins. */
export function Group({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { palette } = useTheme();
  const items = Children.toArray(children);
  return (
    <GroupContext.Provider value>
      <View style={[styles.group, { backgroundColor: palette.surface }]}>
        {header}
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.line, marginLeft: space.md }} /> : null}
            {child}
          </View>
        ))}
      </View>
    </GroupContext.Provider>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: Tone }) {
  const { palette, tones } = useTheme();
  return <View style={[styles.card, { backgroundColor: tone ? tones[tone].bg : palette.surface }, style]}>{children}</View>;
}

// ───────────── Verdicts ─────────────

/** Verdict : toujours icône + mot + couleur. */
export function VerdictBadge({ verdict, incomplete = false, size = "md" }: { verdict: Verdict; incomplete?: boolean; size?: "md" | "lg"; onTint?: boolean }) {
  const v = verdictMeta(verdict, incomplete);
  return <ToneBadge tone={v.tone} icon={v.icon} label={v.label} size={size} />;
}

/** `md` : icône + mot colorés, sans fond (dans une ligne). `lg` : pastille teintée (en tête d'un écran). */
export function ToneBadge({ tone, icon, label, size = "md" }: { tone: Tone; icon: IconName; label: string; size?: "md" | "lg"; onTint?: boolean }) {
  const { tones } = useTheme();
  const t = tones[tone];
  const lg = size === "lg";
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, lg && { backgroundColor: t.bg, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill }]}>
      <Icon name={icon} size={lg ? 16 : 15} color={t.fg} strokeWidth={2.2} />
      <Text variant="label" color={t.fg} style={{ flexShrink: 1 }}>
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
  const { palette, tones } = useTheme();
  const grouped = useContext(GroupContext);
  const surface: ViewStyle | null = grouped ? null : { backgroundColor: palette.surface, borderRadius: radius.lg };
  const body = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconTone ? tones[iconTone].bg : palette.surfaceHigh }]}>
          <Icon name={icon} size={20} color={iconTone ? tones[iconTone].fg : palette.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text color="faint" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={18} color={palette.inkFaint} /> : null)}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title} onPress={onPress} style={({ pressed }) => [styles.row, surface, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={[styles.row, surface]}>{body}</View>
  );
}

export function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { palette, dark } = useTheme();
  const grouped = useContext(GroupContext);
  const on = dark ? "#30D158" : "#34C759";
  const off = dark ? "#48484A" : "#C7C7CC";
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, grouped ? null : { backgroundColor: palette.surface, borderRadius: radius.lg }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? (
          <Text color="faint" variant="caption">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View accessible={false} style={{ width: 51, height: 31, padding: 2, borderRadius: 16, justifyContent: "center", backgroundColor: value ? on : off }}>
        <View style={{ alignSelf: value ? "flex-end" : "flex-start", borderRadius: 14, height: 27, width: 27, backgroundColor: "#FFFFFF" }} />
      </View>
    </Pressable>
  );
}

// ───────────── Formulaires ─────────────

const noOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null;

function Note({ id, error, help }: { id?: string; error?: string | null; help?: string }) {
  const { tones } = useTheme();
  if (error)
    return (
      <View style={{ flexDirection: "row", gap: 6, alignItems: "flex-start" }}>
        <View style={{ marginTop: 2 }}>
          <Icon name="alert" size={15} color={tones.danger.fg} strokeWidth={2.2} />
        </View>
        <Text nativeID={id} accessibilityLiveRegion="polite" variant="caption" color={tones.danger.fg} style={{ flex: 1 }}>
          {error}
        </Text>
      </View>
    );
  return help ? (
    <Text nativeID={id} variant="caption" color="faint">
      {help}
    </Text>
  ) : null;
}

export function Field({ label, help, error, style, numeric = false, ...input }: TextInputProps & { label: string; help?: string; error?: string | null; numeric?: boolean }) {
  const { palette, tones } = useTheme();
  const [focused, setFocused] = useState(false);
  const noteId = `${useId().replace(/[^a-zA-Z0-9]/g, "")}-note`;
  const note = error || help;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" color="faint">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={note ?? undefined}
        aria-describedby={note ? noteId : undefined}
        aria-invalid={error ? true : undefined}
        placeholderTextColor={palette.inkFaint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          typo(numeric ? "numeric" : "input"),
          { lineHeight: undefined, minHeight: scaled(controls.field), backgroundColor: palette.surface, color: palette.ink, borderColor: error ? tones.danger.fg : focused ? palette.ink : palette.control },
          (focused || error) && { borderWidth: 2, paddingHorizontal: 13 },
          noOutline,
          style,
        ]}
        {...input}
      />
      <Note id={noteId} error={error} help={help} />
    </View>
  );
}

/** Code à 6 chiffres en 6 cases ; un champ invisible reçoit la frappe (clavier numérique, code reçu par SMS). */
export function CodeBoxes({ value, onChange, error, label, autoFocus }: { value: string; onChange: (v: string) => void; error?: string | null; label: string; autoFocus?: boolean }) {
  const { palette, tones } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.codeRow}>
        {Array.from({ length: 6 }, (_, i) => {
          const active = focused && (i === value.length || (i === 5 && value.length === 6));
          return (
            <View key={i} style={[styles.codeBox, { backgroundColor: palette.surface, borderColor: error ? tones.danger.fg : active ? palette.ink : palette.control, borderWidth: active || error ? 2 : 1 }]}>
              <Text variant="numeric" style={{ letterSpacing: 0 }}>
                {value[i] ?? ""}
              </Text>
            </View>
          );
        })}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          aria-invalid={error ? true : undefined}
          value={value}
          onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, 6))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={6}
          autoFocus={autoFocus}
          caretHidden
          style={[StyleSheet.absoluteFill, { opacity: 0.02, fontSize: 22 }, Platform.OS === "web" ? ({ outlineStyle: "none", cursor: "text" } as object) : null]}
        />
      </View>
      <Note error={error} />
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  const { palette } = useTheme();
  const fg = selected ? palette.onAccent : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [styles.chip, { backgroundColor: selected ? palette.accentSolid : palette.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Sélecteur segmenté, comme celui d'iOS. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const { palette, dark } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segment, { backgroundColor: palette.surface }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.segmentItem, selected && { backgroundColor: dark ? "#636366" : "#FFFFFF" }]}
          >
            <Text variant="label" color={selected ? palette.ink : palette.inkSoft} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Menu de choix : une ligne qui montre le choix actif, puis les options en liste. Le choix est annoncé à la fermeture. */
export function ChoiceField<T extends string>({ title, options, value, onChange }: { title: string; options: { value: T; label: string; icon?: IconName }[]; value: T; onChange: (v: T) => void }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <View style={{ gap: controlSeparation }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} : ${current.label}`}
        accessibilityHint={open ? "Fermer la liste" : "Choisir un autre filtre"}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.choice, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text variant="caption" color="faint">
          {title}
        </Text>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {current.label}
        </Text>
        <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
          <Icon name="chevron" size={16} color={palette.inkFaint} />
        </View>
      </Pressable>
      {open ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={title} style={[styles.group, { backgroundColor: palette.surface }]}>
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                  AccessibilityInfo.announceForAccessibility?.(`${title} : ${o.label}`);
                }}
                style={({ pressed }) => [styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line }, pressed && { opacity: 0.6 }]}
              >
                {o.icon ? <Icon name={o.icon} size={18} color={palette.ink} /> : null}
                <Text variant={selected ? "bodyStrong" : "body"} style={{ flex: 1 }}>
                  {o.label}
                </Text>
                {selected ? <Icon name="check" size={18} color={palette.ink} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** Confirmation avant une suppression : nomme l'élément et la conséquence. */
export function ConfirmRemove({ title, text, busy, onCancel, onConfirm }: { title: string; text: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 10, marginTop: space.sm }}>
      <Text variant="subhead" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="caption" color="faint">
        {text}
      </Text>
      <Button variant="secondary" label="Garder" disabled={busy} onPress={onCancel} />
      <Button variant="danger" label="Retirer" loading={busy} onPress={onConfirm} />
    </View>
  );
}

/** Avatar rond : initiale sur gris. */
export function Avatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const { palette } = useTheme();
  const initial = (name?.trim()[0] ?? "").toUpperCase();
  return (
    <View accessible={false} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
      {initial ? (
        <Text variant="action" style={{ fontSize: Math.round(size * 0.44), lineHeight: Math.round(size * 0.56) }}>
          {initial}
        </Text>
      ) : (
        <Icon name="user" size={size * 0.52} color={palette.ink} />
      )}
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xl, gap: space.sm }}>
      <View style={[styles.rowIcon, { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.surfaceHigh, marginBottom: space.xs }]}>
        <Icon name={icon} size={24} color={palette.ink} />
      </View>
      <Text variant="subhead" align="center">
        {title}
      </Text>
      <Text variant="caption" color="faint" align="center" style={{ maxWidth: 280 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: gutter, paddingBottom: space.xl },
  column: { width: "100%", maxWidth: 520, alignSelf: "center" },
  footer: { paddingHorizontal: gutter, paddingTop: 10, paddingBottom: 10 },
  header: { paddingBottom: space.md },
  navRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  sectionHead: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 },
  card: { borderRadius: radius.xl, padding: space.md },
  group: { borderRadius: radius.xl, overflow: "hidden" },
  badge: { flexShrink: 1, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: controls.row, paddingHorizontal: space.md, paddingVertical: 10 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  codeRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  codeBox: { flex: 1, height: controls.codeBox, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: controls.chip, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.pill },
  segment: { flexDirection: "row", padding: 2, borderRadius: 10, minHeight: controls.segment },
  segmentItem: { flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  choice: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: controls.option, paddingHorizontal: 14, borderRadius: radius.md },
  option: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: controls.option, paddingHorizontal: 14 },
});
