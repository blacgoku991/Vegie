import { useState } from "react";
import { View } from "react-native";
import { Redirect, router } from "expo-router";
import { Button } from "@/ui/Button";
import { Card, Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

/**
 * Simulateur d'appel entrant, en développement uniquement (absent des builds de production).
 * Il rejoue ce que fait le filtrage Android : le numéro qui appelle est envoyé au serveur, qui seul décide
 * si l'appel est certifié. Utile pour tester dans le navigateur, où aucun vrai appel n'arrive.
 */
const PRESETS = [
  { label: "Vrai conseiller (Claire Martin)", number: "01 99 00 12 34", hint: "Sa ligne directe : vert si un appel est annoncé." },
  { label: "Escroc avec le numéro officiel", number: "01 99 00 00 00", hint: "Le standard de la banque, usurpé : jamais certifié." },
  { label: "Numéro inconnu", number: "06 39 98 55 55", hint: "Un portable quelconque qui se dit de la banque." },
];

export default function DevCall() {
  const [number, setNumber] = useState(PRESETS[0]!.number);
  if (!__DEV__) return <Redirect href="/" />;
  const simulate = (n: string) => router.push({ pathname: "/call/check", params: { simulate: n } });

  return (
    <Screen title="Simuler un appel" back>
      <Text color="soft">
        Démo uniquement. Choisissez qui appelle Jeanne. Pour tester un vrai appel, annoncez-le d'abord depuis la console
        (compte conseiller), puis simulez l'appel de Claire Martin.
      </Text>
      <View style={{ gap: space.md, marginTop: space.lg }}>
        {PRESETS.map((p) => (
          <Card key={p.number} style={{ gap: space.sm }}>
            <Text variant="bodyStrong">{p.label}</Text>
            <Text color="soft">
              {p.number} · {p.hint}
            </Text>
            <Button variant="secondary" label="Recevoir cet appel" icon="phone" onPress={() => simulate(p.number)} />
          </Card>
        ))}
        <Card style={{ gap: space.sm }}>
          <Field label="Autre numéro" value={number} onChangeText={setNumber} keyboardType="phone-pad" />
          <Button label="Recevoir cet appel" icon="phone" onPress={() => simulate(number)} />
        </Card>
      </View>
    </Screen>
  );
}
