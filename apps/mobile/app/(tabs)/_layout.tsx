import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/ui/Icon";
import { fontFamily, palette } from "@/ui/theme";

/** Trois onglets seulement, avec de grandes étiquettes. */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.line,
          height: 76 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 17, marginTop: 2 },
        sceneStyle: { backgroundColor: palette.paper },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: ({ color }) => <Icon name="shield" color={String(color)} size={28} /> }} />
      <Tabs.Screen name="history" options={{ title: "Historique", tabBarIcon: ({ color }) => <Icon name="clock" color={String(color)} size={28} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Réglages", tabBarIcon: ({ color }) => <Icon name="user" color={String(color)} size={28} /> }} />
    </Tabs>
  );
}
