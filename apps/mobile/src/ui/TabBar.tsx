import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "@vigie/shared";
import { Icon } from "./Icon";
import { Text } from "./Text";
import { useTheme } from "./ThemeProvider";
import { controls } from "./theme";

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  // expo-router 58 : la barre reçoit `emitter` et `navigateToTab` (plus de `navigation` comme dans React Navigation).
  emitter: { emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean } };
  navigateToTab: (key: string) => void;
}

const icons: Record<string, IconName> = { index: "shield", history: "clock", settings: "user" };

/** Barre d'onglets à plat, comme celle d'iOS : un filet en haut, icône 24 px et petit libellé. */
export function TabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { backgroundColor: palette.paper, borderTopColor: palette.line, paddingBottom: Math.max(insets.bottom, 6) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = String(descriptors[route.key]?.options.title ?? route.name);
        const color = focused ? palette.ink : palette.inkFaint;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
            style={styles.tab}
          >
            <Icon name={icons[route.name] ?? "shield"} size={24} color={color} strokeWidth={focused ? 2 : 1.7} />
            <Text variant="micro" color={color} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, minHeight: controls.tab, alignItems: "center", justifyContent: "center", gap: 3 },
});
