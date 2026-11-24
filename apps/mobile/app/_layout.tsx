import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_600SemiBold,
  AtkinsonHyperlegibleNext_700Bold,
  AtkinsonHyperlegibleNext_800ExtraBold,
} from "@expo-google-fonts/atkinson-hyperlegible-next";
import { AuthProvider, useAuth } from "@/auth";
import { api } from "@/api";
import { listenNotifications, registerForPush } from "@/notifications";
import { protection } from "@/protection";
import { palette } from "@/ui/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
  const { status, me } = useAuth();

  // Une fois connecté : notifications, annuaire d'appels et réglages synchronisés avec le natif.
  useEffect(() => {
    if (status !== "signedIn") return;
    const stop = listenNotifications();
    void registerForPush().catch(() => {});
    void api
      .directory()
      .then((d) => protection.syncDirectory(d))
      .catch(() => {});
    if (me) protection.setAutoHangup(me.settings.autoHangup);
    return stop;
  }, [status, me]);

  useEffect(() => {
    if (status !== "loading") void SplashScreen.hideAsync().catch(() => {});
  }, [status]);

  if (status === "loading") return null;
  const signedIn = status === "signedIn";

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper }, animation: "slide_from_right" }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="call/check" options={{ animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="call/certified" options={{ animation: "fade" }} />
        <Stack.Screen name="call/uncertified" options={{ animation: "fade" }} />
        <Stack.Screen name="alert/[id]" />
        <Stack.Screen name="banks" />
        <Stack.Screen name="mailboxes" />
        <Stack.Screen name="mailbox-add" />
        <Stack.Screen name="contacts" />
        <Stack.Screen name="protections" />
        <Stack.Screen name="check-message" />
        <Stack.Screen name="name" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="code" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AtkinsonHyperlegibleNext_400Regular,
    AtkinsonHyperlegibleNext_500Medium,
    AtkinsonHyperlegibleNext_600SemiBold,
    AtkinsonHyperlegibleNext_700Bold,
    AtkinsonHyperlegibleNext_800ExtraBold,
  });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
