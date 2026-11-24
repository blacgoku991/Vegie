import { Tabs } from "expo-router";
import { TabBar } from "@/ui/TabBar";
import { useTheme } from "@/ui/ThemeProvider";

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tabBar={(props) => <TabBar {...(props as any)} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.paper } }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil" }} />
      <Tabs.Screen name="history" options={{ title: "Historique" }} />
      <Tabs.Screen name="settings" options={{ title: "Profil" }} />
    </Tabs>
  );
}
