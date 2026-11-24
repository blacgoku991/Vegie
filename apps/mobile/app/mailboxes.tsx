import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/api";
import { when } from "@/format";
import { useLoad } from "@/useLoad";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, Empty, Screen, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space, tones } from "@/ui/theme";

export default function Mailboxes() {
  // Retour de connexion Outlook/Gmail : vigie://mailboxes?added=outlook
  const { added, error } = useLocalSearchParams<{ added?: string; error?: string }>();
  const { data, reload } = useLoad(() => api.mailboxes());

  return (
    <Screen back title="Mes boîtes mail" footer={<Button icon="plus" label="Ajouter une boîte mail" onPress={() => router.push("/mailbox-add")} />}>
      {added ? (
        <Card tone="positive" style={{ flexDirection: "row", gap: space.md, marginBottom: space.lg }}>
          <Icon name="check" color={tones.positive.fg} />
          <Text color={tones.positive.fg} style={{ flex: 1 }}>
            Boîte connectée. Vigie vérifiera chaque nouveau mail.
          </Text>
        </Card>
      ) : error ? (
        <Card tone="warning" style={{ marginBottom: space.lg }}>
          <Text color={tones.warning.fg}>La connexion n'a pas abouti. Vous pouvez réessayer.</Text>
        </Card>
      ) : null}

      <View style={{ gap: space.sm + 4 }}>
        {data && !data.length ? <Empty icon="mail" title="Aucune boîte mail" text="Ajoutez vos adresses mail : Vigie vous préviendra dès qu'un mail est dangereux." /> : null}
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
              <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${m.email}`} onPress={() => void api.removeMailbox(m.id).then(reload)} style={{ minHeight: 48, justifyContent: "center" }}>
                <Text variant="label" color="accent">
                  Retirer
                </Text>
              </Pressable>
            </View>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: space.xl, backgroundColor: palette.surface, gap: space.sm }}>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <Icon name="shield" color={palette.accent} />
          <Text variant="bodyStrong">Vos mails restent privés</Text>
        </View>
        <Text color="soft">
          Vigie lit vos nouveaux mails uniquement pour repérer les arnaques. Il ne peut ni envoyer, ni supprimer, ni répondre. Le contenu n'est jamais conservé.
        </Text>
      </Card>
    </Screen>
  );
}
