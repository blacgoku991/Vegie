import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { AuthProvider, useAuth } from "@/auth";
import { api } from "@/api";
import { listenNotifications, registerForPush } from "@/notifications";
import { protection } from "@/protection";
import { ThemeProvider, useTheme } from "@/ui/ThemeProvider";
import { setSystemFonts } from "@/ui/theme";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
  const { status, me } = useAuth();
  const { palette } = useTheme();

  // Une fois connecté : notifications, annuaire d'appels et réglages synchronisés avec le natif.
  useEffect(() => {
    if (status !== "signedIn") return;
    const stop = listenNotifications();
    void registerForPush().catch(() => {});
    void api.myBanks().catch(() => {});
    void api
      .directory()
      .then((d) => protection.syncDirectory(d))
      .catch(() => {});
    if (me) {
      protection.setAutoHangup(me.settings.autoHangup);
      protection.setUnknownCallBanner(me.settings.unknownCallBanner ?? true);
      protection.setContactCallBanner(me.settings.contactCallBanner ?? true);
    }
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
        <Stack.Screen name="callback" />
        <Stack.Screen name="mailboxes" />
        <Stack.Screen name="mailbox-add" />
        <Stack.Screen name="contacts" />
        <Stack.Screen name="protections" />
        <Stack.Screen name="check-message" />
        <Stack.Screen name="name" />
        <Stack.Screen name="dev-call" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="login" />
        <Stack.Screen name="code" />
      </Stack.Protected>
      <Stack.Screen name="join" />
      <Stack.Screen name="activate" />
    </Stack>
  );
}

function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? "light" : "dark"} />;
}

export default function RootLayout() {
  const [loaded, fontError] = useFonts({ Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  // Une police qui échoue ne doit jamais bloquer l'ouverture : on monte l'app avec la famille système.
  setSystemFonts(!!fontError);
  useEffect(() => {
    if (fontError) void SplashScreen.hideAsync().catch(() => {});
  }, [fontError]);
  if (!loaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedStatusBar />
          <Navigation />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
