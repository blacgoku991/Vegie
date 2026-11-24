import { useEffect } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/api";
import { callState } from "@/callState";
import { Pulse } from "@/ui/Orb";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { DarkScope, useTheme } from "@/ui/ThemeProvider";

/** Transition de vérification : courte, et jamais plus de quelques secondes. */
export default function CallCheck() {
  // Simulateur de démo (dev uniquement) : numéro de l'appelant, transmis au serveur qui seul décide.
  const { simulate } = useLocalSearchParams<{ simulate?: string }>();
  const number = __DEV__ && simulate ? simulate : null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let result: NonNullable<Parameters<typeof callState.set>[0]>;
      try {
        result = await api.callCheck(number);
      } catch {
        // Impossible de vérifier : par prudence, on considère l'appel comme non certifié.
        result = { certified: false, match: "number_unknown", call: null, banks: [], offline: true };
      }
      if (cancelled) return;
      callState.set({ ...result, number });
      router.replace(result.call && result.match !== "number_mismatch" ? { pathname: "/call/certified", params: { id: result.call.id } } : "/call/uncertified");
    })();
    return () => {
      cancelled = true;
    };
  }, [number]);

  return (
    <DarkScope>
      <StatusBar style="light" />
      <Checking />
    </DarkScope>
  );
}

function Checking() {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg }}>
        <Pulse size={160} />
        <View style={{ gap: 6, marginTop: space.lg }}>
          <Text variant="heading" align="center" accessibilityLiveRegion="polite">
            Vérification auprès de votre banque
          </Text>
          <Text variant="caption" color="faint" align="center">
            Vous pouvez raccrocher à tout moment. Gardez vos codes secrets.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
