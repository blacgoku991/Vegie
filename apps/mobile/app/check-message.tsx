import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { verdictMeta, type ScanMessageResponse } from "@vigie/shared";
import { api } from "@/api";
import { Button } from "@/ui/Button";
import { FadeIn } from "@/ui/Orb";
import { Card, Field, Screen, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

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
      setResult(await api.scan({ source: "share", text: text.trim() }));
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
          maxLength={20000}
          editable={!busy}
          multiline
          style={{ minHeight: 180, textAlignVertical: "top" }}
          help={`${text.trim().length < 5 ? "Collez au moins 5 caractères. " : ""}Dans vos messages, appuyez longuement sur le texte puis « Copier ».`}
          error={error}
        />
      ) : (
        <FadeIn>
          <ResultCard result={result} />
          {result.alertId ? (
            <View style={{ marginTop: 10 }}>
              <Button variant="ghost" label="Voir le détail des vérifications" onPress={() => router.push(`/alert/${result.alertId}`)} />
            </View>
          ) : null}
        </FadeIn>
      )}
    </Screen>
  );
}

function ResultCard({ result }: { result: ScanMessageResponse }) {
  const meta = verdictMeta(result.verdict, result.incomplete);
  return (
    <Card style={{ gap: 10, padding: space.md + 4 }}>
      <ToneBadge tone={meta.tone} icon={meta.icon} label={meta.label} size="lg" />
      <Text variant="heading" accessibilityRole="header">
        {result.explanation}
      </Text>
      <Text color="soft">{result.advice}</Text>
    </Card>
  );
}
