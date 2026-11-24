import { useState } from "react";
import { Pressable, View } from "react-native";
import { formatPhone } from "@vigie/shared";
import { api, ApiError } from "@/api";
import { useAuth } from "@/auth";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, Field, Screen, Section, ToggleRow } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space } from "@/ui/theme";

export default function Contacts() {
  const { me, setMe } = useAuth();
  const { data, reload } = useLoad(() => api.contacts());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.addContact(name.trim(), phone);
      setName("");
      setPhone("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible d'ajouter ce proche.");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (v: boolean) => {
    if (!me) return;
    setMe({ ...me, settings: { ...me.settings, notifyContactOnScam: v } });
    setMe(await api.updateMe({ settings: { notifyContactOnScam: v } }));
  };

  return (
    <Screen back title="Mon proche">
      <Text color="soft">En cas d'appel suspect ou d'arnaque, SmartSecure peut prévenir une personne de confiance par SMS.</Text>

      <View style={{ marginTop: space.lg, gap: space.sm + 4 }}>
        {data?.map((c) => (
          <Card key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Icon name="heart" color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{c.name}</Text>
              <Text color="soft">{formatPhone(c.phone)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${c.name}`} onPress={() => void api.removeContact(c.id).then(reload)} style={{ minHeight: 48, justifyContent: "center" }}>
              <Text variant="label" color="accent">
                Retirer
              </Text>
            </Pressable>
          </Card>
        ))}
        {me ? (
          <ToggleRow
            title="Prévenir automatiquement"
            subtitle="Un SMS rassurant part si SmartSecure bloque une arnaque (une fois par jour au plus)."
            value={me.settings.notifyContactOnScam}
            onChange={(v) => void toggle(v)}
          />
        ) : null}
      </View>

      {(data?.length ?? 0) < 3 ? (
        <Section title="Ajouter un proche">
          <Field label="Son prénom" placeholder="Sophie" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Son numéro de portable" placeholder="06 12 34 56 78" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" error={error} />
          <Button icon="plus" label="Ajouter ce proche" loading={busy} disabled={!name.trim() || phone.replace(/\D/g, "").length < 10} onPress={() => void add()} />
        </Section>
      ) : null}
    </Screen>
  );
}
