import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { formatPhone } from "@vigie/shared";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { cachedCallbacks, callbackDirectory, type CallbackDirectory } from "@/callbacks";
import { Card, ListRow, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

export default function Callback() {
  const { accountId } = useAuth();
  const [directory, setDirectory] = useState<CallbackDirectory | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let refreshed = false;
    if (accountId) void cachedCallbacks(accountId).then(cached => {
      if (active && !refreshed) setDirectory(cached);
    }).catch(() => {});
    void api.myBanks().then(banks => {
      refreshed = true;
      if (active) setDirectory(callbackDirectory(banks));
    }).catch(() => { if (active) setOffline(true); });
    return () => { active = false; };
  }, [accountId]);

  const dial = async (id: string, number: string) => {
    try {
      await Linking.openURL(`tel:${number}`);
      void api.reportCall({ action: "called_back", bankId: id }).catch(() => {});
    } catch { setError("Composez vous-même le numéro affiché sur votre téléphone."); }
  };
  return (
    <Screen back title="Rappeler ma banque">
      <Text color="soft">Raccrochez avant de composer le numéro de votre banque.</Text>
      <View style={{ gap: space.md, marginTop: space.lg }}>
        {directory?.entries.map(bank => <ListRow key={bank.id} icon="phone" title={bank.name}
          subtitle={formatPhone(bank.number)} onPress={() => void dial(bank.id, bank.number)} />)}
        {directory?.missing?.map(bank => <ListRow key={bank.id} icon="bank" title={bank.name}
          subtitle="Utilisez le numéro au dos de votre carte." />)}
        {directory && (directory.entries.length || directory.missing?.length) ? <Text variant="caption" color="faint">
          {offline ? "Hors connexion. " : ""}Numéros fournis par vos banques. Annuaire consulté le {new Date(directory.checkedAt).toLocaleDateString("fr-FR")}.
        </Text> : null}
        <Card style={{ gap: space.sm }}>
          <Text variant="heading">Le numéro au dos de votre carte</Text>
          <Text color="soft">Vous pouvez aussi le retrouver sur un relevé ou dans l’application habituelle de votre banque.</Text>
        </Card>
        {error ? <Text accessibilityLiveRegion="polite">{error}</Text> : null}
      </View>
    </Screen>
  );
}
