import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { formatPhone } from "@vigie/shared";
import { api, ApiError } from "@/api";
import { groupPhoneInput } from "@/format";
import { useAuth } from "@/auth";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, ConfirmRemove, Field, Screen, Section, ToggleRow } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

export default function Contacts() {
  const { palette } = useTheme();
  const { me, setMe } = useAuth();
  const { data, reload, error: loadError } = useLoad(() => api.contacts());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");

  const remove = async (id: string, contactName: string) => {
    setRemoving(true);
    setError(null);
    try { await api.removeContact(id); setConfirming(null); setNotice(`${contactName} a été retiré de vos proches.`); await reload(); }
    catch (err) { setError((err as Error).message); }
    finally { setRemoving(false); }
  };

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
    try { setMe(await api.updateMe({ settings: { notifyContactOnScam: v } })); }
    catch (err) { setError((err as Error).message); }
  };

  return (
    <Screen back title="Mes proches">
      <Text color="soft">Choisissez avec leur accord jusqu’à trois personnes à prévenir. Vous pouvez aussi les appeler directement.</Text>
      {error || loadError ? <Text accessibilityLiveRegion="polite">{error || loadError}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" color="soft">{notice}</Text> : null}

      <View style={{ marginTop: space.lg, gap: space.sm + 4 }}>
        {data?.map((c) => (
          <Card key={c.id} style={{ gap: space.sm }}>
            <Icon name="heart" color={palette.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{c.name}</Text>
              <Text color="soft">{formatPhone(c.phone)}</Text>
            </View>
            <Button label={`Appeler ${c.name}`} variant="secondary" icon="phone" onPress={() => void Linking.openURL(`tel:${c.phone}`).catch(() => setError(`Composez le ${formatPhone(c.phone)}.`))} />
            {confirming === c.id ? (
              <ConfirmRemove title={`Retirer ${c.name} ?`} text="Cette personne ne sera plus prévenue en cas d’arnaque." busy={removing} onCancel={() => setConfirming(null)} onConfirm={() => void remove(c.id, c.name)} />
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${c.name}`} onPress={() => { setNotice(""); setConfirming(c.id); }} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text variant="label" color="accent">
                  Retirer
                </Text>
              </Pressable>
            )}
          </Card>
        ))}
        {me && data?.length ? (
          <ToggleRow
            title="Prévenir automatiquement"
            subtitle="Vos proches reçoivent un SMS si un message est classé « Arnaque », au plus une fois par jour."
            value={me.settings.notifyContactOnScam}
            onChange={(v) => void toggle(v)}
          />
        ) : null}
      </View>

      {(data?.length ?? 0) < 3 ? (
        <Section title="Ajouter un proche">
          <Field label="Son prénom" placeholder="Sophie" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field label="Son numéro de portable" numeric placeholder="06 12 34 56 78" value={phone} onChangeText={(v) => setPhone(groupPhoneInput(v))} keyboardType="phone-pad" autoComplete="tel" />
          <Button icon="plus" label="Ajouter ce proche" loading={busy} disabled={!name.trim() || phone.replace(/\D/g, "").length < 10} onPress={() => void add()} />
        </Section>
      ) : null}
    </Screen>
  );
}
