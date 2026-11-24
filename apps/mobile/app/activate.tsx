import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button } from "@/ui/Button";
import { Card, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

/**
 * Activation par le lien reçu par SMS (smartsecure://activate?token=… ou lien web).
 * - Aucun compte pour ce numéro : le serveur crée le compte, relie la banque et ouvre la session, sans code.
 * - Compte existant : le lien n'ouvre jamais de session. Déjà connecté, on relie directement la banque (le serveur vérifie
 *   le numéro) ; sinon on demande de se connecter avec le code SMS, puis on relie.
 */
export default function Activate() {
  const { status, signIn } = useAuth();
  const { tones } = useTheme();
  const params = useLocalSearchParams<{ token?: string }>();
  // Le jeton est gardé en mémoire dès la première lecture : il disparaît ensuite de l'URL (aperçu web).
  const token = useRef(Array.isArray(params.token) ? params.token[0] : params.token).current ?? "";
  const [view, setView] = useState<"working" | "failed" | "login">("working");
  const started = useRef(false);

  useEffect(() => {
    if (Platform.OS === "web" && params.token) router.setParams({ token: undefined });
  }, [params.token]);

  useEffect(() => {
    if (status === "loading" || started.current) return;
    started.current = true;
    if (!token) {
      setView("failed");
      return;
    }
    const run = async () => {
      if (status === "signedIn") {
        await api.activateLink(token);
        router.replace("/banks");
        return;
      }
      const res = await api.activate(token);
      if ("requiresLogin" in res) {
        setView("login");
        return;
      }
      await signIn(res.token, res.user);
      router.replace(res.user.firstName ? "/" : "/name");
    };
    run().catch(() => setView("failed"));
  }, [status, token, signIn]);

  if (view === "failed") {
    return (
      <Screen title="Activation" footer={<Button label="Retour à l'accueil" variant="secondary" onPress={() => router.replace(status === "signedIn" ? "/" : "/welcome")} />}>
        <Card tone="danger" style={{ gap: space.sm }}>
          <Text variant="heading" color={tones.danger.fg}>
            Ce lien n'est plus valable.
          </Text>
          <Text color={tones.danger.fg}>Demandez à votre conseiller de vous en renvoyer un.</Text>
        </Card>
      </Screen>
    );
  }
  if (view === "login") {
    return (
      <Screen title="Relier votre banque" footer={<Button label="Me connecter" onPress={() => router.push({ pathname: "/login", params: { activate: token } })} />}>
        <Text color="soft">Connectez-vous avec votre code SMS pour relier votre banque.</Text>
      </Screen>
    );
  }
  return (
    <Screen title="Activation">
      <View style={{ alignItems: "center", gap: space.md, marginTop: space.xl }} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" />
        <Text color="soft">Activation de votre compte…</Text>
      </View>
    </Screen>
  );
}
