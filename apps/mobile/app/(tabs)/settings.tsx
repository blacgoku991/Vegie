import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { router } from "expo-router";
import { formatPhone, normalizePhone } from "@vigie/shared";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Avatar, Card, ListRow, Screen, Section, Segmented } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space, touch, type TextSize } from "@/ui/theme";
import { useTheme, type ThemePreference } from "@/ui/ThemeProvider";

const themeChoices: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Système" },
  { value: "light", label: "Clair" },
  { value: "dark", label: "Sombre" },
];
const textChoices: { value: TextSize; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grand" },
  { value: "larger", label: "Très grand" },
];

export default function Profile() {
  const { signOut, me } = useAuth();
  const { preference, setPreference, textSize, setTextSize, tones } = useTheme();
  const { data, error } = useLoad(() => Promise.all([api.myBanks(), api.mailboxes(), api.contacts(), api.home()]));
  const [banks, mailboxes, contacts, home] = data ?? [[], [], [], null];

  const linked = banks.filter((b) => b.status === "certified").length;
  const banksText = banks.length ? `${banks.length} banque${banks.length > 1 ? "s" : ""} · ${linked} compte${linked > 1 ? "s" : ""} relié${linked > 1 ? "s" : ""}` : "Aucune banque ajoutée";
  const name = me?.firstName ?? home?.firstName ?? null;
  const e164 = me?.phone ? normalizePhone(me.phone) : null;

  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api.deleteAccount();
      await signOut();
    } catch (err) {
      setFailure((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Profil">
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ borderRadius: 28, overflow: "hidden" }}>
          <Avatar name={name} size={56} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="heading" numberOfLines={1}>
            {name ?? "Mon profil"}
          </Text>
          {me?.phone ? (
            <Text variant="caption" color="faint">
              {e164 ? formatPhone(e164) : me.phone}
            </Text>
          ) : null}
        </View>
      </Card>

      {error ? (
        <Text variant="caption" color={tones.danger.fg} accessibilityLiveRegion="polite" style={{ marginTop: space.md }}>
          {error}
        </Text>
      ) : null}
      <Section title="Ma protection" group>
        <ListRow icon="bank" title="Mes banques" subtitle={data ? banksText : "État indisponible"} onPress={() => router.push("/banks")} />
        <ListRow
          icon="mail"
          title="Mes boîtes mail"
          subtitle={!data ? "État indisponible" : mailboxes.length ? `${mailboxes.length} boîte${mailboxes.length > 1 ? "s" : ""} connectée${mailboxes.length > 1 ? "s" : ""}` : "Aucune boîte connectée"}
          onPress={() => router.push("/mailboxes")}
        />
        <ListRow icon="phone" title="Appels et messages" subtitle="Filtrage des appels, SMS et WhatsApp" onPress={() => router.push("/protections")} />
        <ListRow icon="heart" title="Mes proches" subtitle={!data ? "État indisponible" : contacts.length ? contacts.map((c) => c.name).join(", ") : "Personne à prévenir"} onPress={() => router.push("/contacts")} />
      </Section>

      <Section title="Affichage">
        <Segmented label="Apparence" options={themeChoices} value={preference} onChange={setPreference} />
        <View style={{ gap: 6, marginTop: 6 }}>
          <Text variant="caption" color="faint" style={{ marginLeft: space.xs }}>
            Taille du texte
          </Text>
          <Segmented label="Taille du texte" options={textChoices} value={textSize} onChange={setTextSize} />
        </View>
      </Section>

      <Section title="Un doute ?" group>
        <ListRow icon="search" title="Vérifier un message" subtitle="Collez un SMS ou un mail suspect" onPress={() => router.push("/check-message")} />
        {__DEV__ ? <ListRow icon="phoneIn" title="Simuler un appel (démo)" subtitle="Vrai conseiller, escroc, numéro inconnu" onPress={() => router.push("/dev-call")} /> : null}
        <ListRow icon="alert" iconTone="danger" title="J’ai été victime d’une arnaque" subtitle="17Cyber, le service officiel d’aide aux victimes" onPress={() => void Linking.openURL("https://www.17cyber.gouv.fr")} />
      </Section>

      <View style={{ marginTop: space.lg + 4, gap: space.sm }}>
        <Button variant="secondary" icon="logout" label="Se déconnecter" onPress={() => void signOut()} />
        {deleting ? (
          <Card tone="danger" style={{ gap: 10 }}>
            <Text variant="subhead">Supprimer définitivement votre compte ?</Text>
            <Text variant="caption" color="soft">
              Vos banques, vos proches et votre historique seront effacés.
            </Text>
            <Button variant="secondary" label="Garder mon compte" disabled={busy} onPress={() => setDeleting(false)} />
            <Button variant="danger" label="Supprimer définitivement" loading={busy} onPress={() => void deleteAccount()} />
          </Card>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setDeleting(true)} style={{ minHeight: touch.min, alignItems: "center", justifyContent: "center" }}>
            <Text variant="caption" color="faint">
              Supprimer mon compte
            </Text>
          </Pressable>
        )}
        {failure ? (
          <Text variant="caption" color={tones.danger.fg} accessibilityLiveRegion="polite">
            {failure}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
