import { useState } from "react";
import { router } from "expo-router";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { Button } from "@/ui/Button";
import { Field, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

export default function Name() {
  const { setMe } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      setMe(await api.updateMe({ firstName: name.trim() }));
    } finally {
      router.replace("/");
    }
  };

  return (
    <Screen
      title="Comment vous appelez-vous ?"
      footer={
        <>
          <Button label="Continuer" disabled={!name.trim()} loading={busy} onPress={() => void save()} />
          <Button variant="ghost" label="Passer" onPress={() => router.replace("/")} />
        </>
      }
    >
      <Text color="soft" style={{ marginBottom: space.lg }}>
        Votre prénom sert à personnaliser SmartSecure et à rassurer votre proche si nous le prévenons.
      </Text>
      <Field label="Votre prénom" placeholder="Jeanne" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="given-name" autoFocus />
    </Screen>
  );
}
