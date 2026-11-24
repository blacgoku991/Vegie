import { Alert, Linking, Platform } from "react-native";
import { router } from "expo-router";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { useLoad } from "@/useLoad";
import { ListRow, Screen, Section } from "@/ui/primitives";

export default function Settings() {
  const { signOut } = useAuth();
  const { data } = useLoad(() => Promise.all([api.myBanks(), api.mailboxes(), api.contacts()]));
  const [banks, mailboxes, contacts] = data ?? [[], [], []];

  const certified = banks.filter((b) => b.status === "certified").length;
  const banksText = banks.length
    ? [certified ? `${certified} certifiée${certified > 1 ? "s" : ""}` : null, banks.length - certified ? `${banks.length - certified} en protection de base` : null].filter(Boolean).join(", ")
    : "Aucune banque ajoutée";

  const confirmDelete = () => {
    const run = async () => {
      await api.deleteAccount().catch(() => {});
      await signOut();
    };
    if (Platform.OS === "web") return void run();
    Alert.alert("Supprimer mon compte ?", "Toutes vos données SmartSecure seront effacées. Vous ne serez plus protégé.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => void run() },
    ]);
  };

  return (
    <Screen title="Réglages">
      <Section title="Ma protection">
        <ListRow icon="bank" title="Mes banques" subtitle={banksText} onPress={() => router.push("/banks")} />
        <ListRow
          icon="mail"
          title="Mes boîtes mail"
          subtitle={mailboxes.length ? `${mailboxes.length} boîte${mailboxes.length > 1 ? "s" : ""} surveillée${mailboxes.length > 1 ? "s" : ""}` : "Aucune boîte connectée"}
          onPress={() => router.push("/mailboxes")}
        />
        <ListRow icon="phone" title="Appels et messages" subtitle="Filtrage des appels, SMS et WhatsApp" onPress={() => router.push("/protections")} />
        <ListRow icon="heart" title="Mon proche" subtitle={contacts.length ? contacts.map((c) => c.name).join(", ") : "Personne à prévenir"} onPress={() => router.push("/contacts")} />
      </Section>

      <Section title="Un doute ?">
        <ListRow icon="search" title="Vérifier un message" subtitle="Collez un SMS ou un mail suspect" onPress={() => router.push("/check-message")} />
        <ListRow
          icon="alert"
          iconTone="danger"
          title="J'ai été victime d'une arnaque"
          subtitle="17Cyber, le service officiel d'aide aux victimes"
          onPress={() => void Linking.openURL("https://www.17cyber.gouv.fr")}
        />
      </Section>

      <Section title="Mon compte">
        <ListRow icon="user" title="Se déconnecter" onPress={() => void signOut()} />
        <ListRow icon="close" iconTone="danger" title="Supprimer mon compte" subtitle="Efface toutes vos données" onPress={confirmDelete} />
      </Section>
    </Screen>
  );
}
