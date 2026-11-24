import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/api";
import { callState } from "@/callState";
import { FadeIn, Pulse } from "@/ui/Orb";
import { Text } from "@/ui/Text";
import { palette, space } from "@/ui/theme";

/** Transition de vérification : courte, rassurante, et jamais plus de quelques secondes. */
export default function CallCheck() {
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    void (async () => {
      let result: Parameters<typeof callState.set>[0];
      try {
        result = await Promise.race([
          api.callCheck(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
        ]);
      } catch {
        // Impossible de vérifier : par prudence, on considère l'appel comme non certifié.
        result = { certified: false, match: "number_unknown", call: null, banks: [], offline: true };
      }
      const wait = Math.max(0, 1400 - (Date.now() - started));
      setTimeout(() => {
        if (cancelled) return;
        callState.set(result);
        // Une annonce existe et ne contredit pas le numéro : écran « appel annoncé ». Sinon : non certifié.
        // « verified » seulement si l'appareil a vu le numéro de l'appelant et qu'il correspond (Android).
        const announced = !!result!.call && result!.match !== "number_mismatch";
        router.replace(
          announced ? { pathname: "/call/certified", params: { id: result!.call!.id, verified: result!.certified ? "1" : "0" } } : "/call/uncertified",
        );
      }, wait);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper, alignItems: "center", justifyContent: "center", padding: space.lg }}>
      <Pulse size={200} />
      <FadeIn delay={100}>
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Text variant="title" align="center" accessibilityLiveRegion="polite">
            Je vérifie auprès de votre banque…
          </Text>
          <Text color="soft" align="center">
            Restez en ligne, ne donnez aucune information pour l'instant.
          </Text>
        </View>
      </FadeIn>
    </SafeAreaView>
  );
}
