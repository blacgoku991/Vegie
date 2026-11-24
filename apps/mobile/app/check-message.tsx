import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { verdicts, type ScanMessageResponse } from "@vigie/shared";
import { api } from "@/api";
import { Button } from "@/ui/Button";
import { FadeIn } from "@/ui/Orb";
import { Card, Field, Screen, VerdictBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space, tones } from "@/ui/theme";

/** « Un doute ? » : coller un message pour le faire vérifier. */
export default function CheckMessage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ScanMessageResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.scan({ source: "share", text }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      title="Vérifier un message"
      footer={
        result ? (
          <Button variant="secondary" label="Vérifier un autre message" onPress={() => (setResult(null), setText(""))} />
        ) : (
          <Button icon="search" label="Vérifier" loading={busy} disabled={text.trim().length < 5} onPress={() => void check()} />
        )
      }
    >
      {!result ? (
        <Field
          label="Collez ici le message suspect"
          placeholder="Votre colis est en attente…"
          value={text}
          onChangeText={setText}
          multiline
          style={{ minHeight: 200, textAlignVertical: "top", paddingTop: space.md, fontSize: 20 }}
          help="Astuce : dans vos messages, appuyez longuement sur le texte puis « Copier »."
          error={error}
        />
      ) : (
        <FadeIn>
          <Card tone={verdicts[result.verdict].tone} style={{ gap: space.md }}>
            <VerdictBadge verdict={result.verdict} size="lg" onTint />
            <Text variant="heading" color={tones[verdicts[result.verdict].tone].fg}>
              {result.explanation}
            </Text>
            <Text color={tones[verdicts[result.verdict].tone].fg}>{result.advice}</Text>
          </Card>
          {result.alertId ? (
            <View style={{ marginTop: space.md }}>
              <Button variant="ghost" label="Voir le détail des vérifications" onPress={() => router.push(`/alert/${result.alertId}`)} />
            </View>
          ) : null}
        </FadeIn>
      )}
    </Screen>
  );
}
