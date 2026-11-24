import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { when } from "@/format";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, ConfirmRemove, Empty, Screen, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

export default function Mailboxes() {
  const { palette, tones } = useTheme();
  // Retour de connexion Outlook/Gmail : vigie://mailboxes?added=outlook
  const { added, error } = useLocalSearchParams<{ added?: string; error?: string }>();
  const [failure, setFailure] = useState("");
  const { data, reload, error: loadError } = useLoad(() => api.mailboxes());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState("");
  const remove = async (id: string, email: string) => {
    setRemoving(true);
    setFailure("");
    try { await api.removeMailbox(id); setConfirming(null); setNotice(`${email} a été retirée.`); await reload(); }
    catch (e) { setFailure((e as Error).message); }
    finally { setRemoving(false); }
  };

  return (
    <Screen back title="Mes boîtes mail" footer={<Button icon="plus" label="Ajouter une boîte mail" onPress={() => router.push("/mailbox-add")} />}>
      {loadError || failure ? <Text accessibilityLiveRegion="polite">{loadError || failure}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" color="soft" style={{ marginBottom: space.md }}>{notice}</Text> : null}
      {added ? (
        <Card tone="positive" style={{ flexDirection: "row", gap: space.md, marginBottom: space.lg }}>
          <Icon name="check" color={tones.positive.fg} />
          <Text color={tones.positive.fg} style={{ flex: 1 }}>
            Boîte connectée. SmartSecure vérifiera chaque nouveau mail.
          </Text>
        </Card>
      ) : error ? (
        <Card tone="warning" style={{ marginBottom: space.lg }}>
          <Text color={tones.warning.fg}>La connexion n'a pas abouti. Vous pouvez réessayer.</Text>
        </Card>
      ) : null}

      <View style={{ gap: space.sm + 4 }}>
        {data && !data.length ? <Empty icon="mail" title="Aucune boîte mail" text="Ajoutez vos adresses mail : SmartSecure vous préviendra dès qu'un mail est dangereux." /> : null}
        {data?.map((m) => (
          <Card key={m.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Icon name="mail" color={palette.accent} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {m.email}
                </Text>
                <Text variant="caption" color="soft">
                  {m.label} · {m.lastCheckedAt ? `vérifiée ${when(m.lastCheckedAt)}` : "connexion en cours"}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {m.status === "active" ? <ToneBadge tone="positive" icon="check" label="Surveillée" /> : <ToneBadge tone="warning" icon="alert" label="À reconnecter" />}
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${m.email}`} onPress={() => { setNotice(""); setConfirming(m.id); }} style={{ minHeight: 44, justifyContent: "center" }}>
                <Text variant="label" color="accent">
                  Retirer
                </Text>
              </Pressable>
            </View>
            {confirming === m.id ? (
              <ConfirmRemove title={`Retirer ${m.email} ?`} text="SmartSecure ne vérifiera plus les nouveaux mails de cette boîte." busy={removing} onCancel={() => setConfirming(null)} onConfirm={() => void remove(m.id, m.email)} />
            ) : null}
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: space.xl, backgroundColor: palette.surface, gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Icon name="shield" color={palette.accent} />
          <Text variant="bodyStrong">Vos mails restent privés</Text>
        </View>
        <Text color="soft">
          SmartSecure lit vos nouveaux mails uniquement pour repérer les arnaques. Il ne peut ni envoyer, ni supprimer, ni répondre. L’historique conserve l’objet, l’expéditeur et le résultat de l’analyse.
        </Text>
      </Card>
    </Screen>
  );
}
