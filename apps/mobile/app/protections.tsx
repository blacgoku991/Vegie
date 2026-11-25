import { useCallback, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { useFocusEffect } from "expo-router";
import type { IconName } from "@vigie/shared";
import { api } from "@/api";
import { useAuth } from "@/auth";
import { protection, type OverlayPosition, type ProtectionStatus } from "@/protection";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { Card, Screen, Segmented, ToggleRow, ToneBadge } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";
import { useTheme } from "@/ui/ThemeProvider";

/** Activation guidée des protections du téléphone, une carte = une protection. */
export default function Protections() {
  const { me, setMe } = useAuth();
  const [status, setStatus] = useState<ProtectionStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = () => void protection.status().then(s => { if (active) setStatus(s); }).catch(() => { if (active) setStatus(null); });
      refresh();
      const sub = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
      return () => { active = false; sub.remove(); };
    }, []),
  );

  const setAutoHangup = async (v: boolean) => {
    if (!me) return;
    protection.setAutoHangup(v);
    setMe(await api.updateMe({ settings: { autoHangup: v } }));
  };

  const setUnknownCallBanner = async (v: boolean) => {
    if (!me) return;
    protection.setUnknownCallBanner(v);
    setMe(await api.updateMe({ settings: { unknownCallBanner: v } }));
  };

  // Sans la permission « Téléphone », Android ne prévient pas l'app qu'un appel sonne : le rappel reste éteint.
  const phoneStateOff = status?.phoneState === "disabled";
  const setContactCallBanner = async (v: boolean) => {
    if (!me) return;
    if (v && phoneStateOff) protection.requestPhonePermissions();
    protection.setContactCallBanner(v);
    setMe(await api.updateMe({ settings: { contactCallBanner: v } }));
  };

  const changeOverlayPosition = (p: OverlayPosition) => {
    protection.setOverlayPosition(p);
    void protection.status().then(setStatus).catch(() => {});
  };

  const contactsOn = status?.contacts === "enabled";
  const android = Platform.OS === "android";
  const ios = Platform.OS === "ios";

  return (
    <Screen back title="Appels et messages">
      <Text color="soft">Vérifiez les réglages disponibles sur votre téléphone.</Text>

      <View style={{ gap: space.md, marginTop: space.lg }}>
        {android ? (
          <>
            <Feature
              icon="phone"
              title="Filtrer les appels"
              text="SmartSecure compare le numéro entrant à la ligne annoncée par votre conseiller."
              enabled={status?.callScreening === "enabled"}
              action={<Button label="Activer" onPress={() => void protection.enableCallScreening().then(() => protection.status().then(setStatus))} />}
            />
            {status?.callScreening === "enabled" ? (
              <Feature
                icon="phone"
                title="Vérifier aussi mes contacts"
                text="Si le numéro de votre banque ou de votre conseiller est enregistré dans vos contacts, Android exige l'accès aux contacts pour laisser SmartSecure vérifier l'appel. SmartSecure regarde seulement si le numéro qui appelle est enregistré. Votre carnet d'adresses ne quitte jamais votre téléphone."
                enabled={contactsOn}
                action={<Button label="Activer" onPress={() => protection.requestContacts()} />}
              />
            ) : null}
            {!contactsOn ? (
              <Text variant="caption" color="faint">
                Sans l'accès aux contacts, SmartSecure ne peut pas certifier un numéro enregistré dans vos contacts. N'enregistrez pas le numéro de votre banque ni celui de votre conseiller.
              </Text>
            ) : null}
            {status?.callScreening === "enabled" && me ? (
              <ToggleRow
                title="Raccrocher automatiquement"
                subtitle="Les appels depuis un numéro public de banque partenaire sans annonce vérifiée peuvent être rejetés. Les signalements des utilisateurs déclenchent un avertissement."
                value={me.settings.autoHangup}
                onChange={(v) => void setAutoHangup(v)}
              />
            ) : null}
            {status?.callScreening === "enabled" && me ? (
              <ToggleRow
                title="Rappel sur les appels inconnus"
                subtitle="Quand un numéro inconnu appelle, un petit message rappelle que votre banque n'a annoncé aucun appel."
                value={me.settings.unknownCallBanner ?? true}
                onChange={(v) => void setUnknownCallBanner(v)}
              />
            ) : null}
            {status?.callScreening === "enabled" && me && !contactsOn ? (
              <ToggleRow
                title="Rappel aussi pour mes contacts"
                subtitle="Android ne dit pas à SmartSecure quel contact appelle. Le rappel s'affiche donc pour tous vos contacts, tant que votre banque n'a annoncé aucun appel."
                value={(me.settings.contactCallBanner ?? true) && !phoneStateOff}
                onChange={(v) => void setContactCallBanner(v)}
              />
            ) : null}
            <Feature
              icon="phone"
              title="Grand message pendant l'appel"
              text="Un grand message par-dessus l'écran d'appel dit si l'appel est certifié ou non, même application fermée. Sans cette autorisation, vous recevez une simple notification."
              enabled={status?.overlay === "enabled"}
              steps="Réglages › Apps › SmartSecure › Afficher par-dessus les autres applis"
              action={<Button label="Activer" onPress={() => protection.requestOverlay()} />}
            />
            {status?.overlay === "enabled" ? (
              <Card style={{ gap: space.md }}>
                <Text variant="heading">Position du message</Text>
                <Segmented<OverlayPosition>
                  label="Position du message"
                  options={[
                    { value: "top", label: "Haut" },
                    { value: "middle", label: "Milieu" },
                    { value: "low", label: "Bas" },
                  ]}
                  value={status.overlayPosition ?? "middle"}
                  onChange={changeOverlayPosition}
                />
                <Text variant="caption" color="faint">
                  Si le message cache le nom de l'appelant ou les boutons de l'écran d'appel, changez sa position.
                </Text>
              </Card>
            ) : null}
            <Feature
              icon="message"
              title="Surveiller SMS et WhatsApp"
              text="Avec votre accord, le nom de l’expéditeur et le texte des notifications contenant un lien, un numéro ou une demande sensible sont envoyés au serveur pour analyse."
              enabled={status?.notificationListener === "enabled"}
              action={<Button label="Autoriser dans les réglages" onPress={() => protection.openMessageAccess()} />}
            />
          </>
        ) : null}

        {ios ? (
          <>
            <Feature
              icon="phone"
              title="Identifier les appels"
              text="Les numéros signalés comme arnaques s'affichent avec un avertissement quand ils vous appellent. Quand votre banque vous appelle depuis la ligne annoncée, le résultat s'affiche sous le numéro, sur l'écran d'appel."
              enabled={status?.callDirectory === "enabled"}
              steps="Réglages › Apps › Téléphone › Blocage et identification des appels › SmartSecure"
              action={<Button label="Ouvrir les réglages" onPress={() => void protection.openCallSettings()} />}
            />
            <Feature
              icon="message"
              title="Filtrer les SMS"
              text="Les SMS d'inconnus sont vérifiés : les arnaques sont rangées à part, loin de vos messages."
              steps="Réglages › Apps › Messages › Expéditeurs inconnus › SmartSecure"
              action={<Button label="Ouvrir les réglages" onPress={() => protection.openMessageAccess()} />}
            />
            <Feature
              icon="share"
              title="Vérifier n'importe quel message"
              text="Dans WhatsApp, Mail ou Messages, touchez « Partager » puis « SmartSecure » : la réponse arrive en quelques secondes."
              enabled
            />
          </>
        ) : null}

        {!android && !ios ? (
          <Card tone="neutral">
            <Text>Ces protections s'activent depuis l'application installée sur votre téléphone.</Text>
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}

function Feature({ icon, title, text, enabled, action, steps }: { icon: IconName; title: string; text: string; enabled?: boolean; action?: React.ReactNode; steps?: string }) {
  const { palette } = useTheme();
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surfaceHigh, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} color={palette.accent} />
        </View>
        <Text variant="heading" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>
      <Text color="soft">{text}</Text>
      {steps && !enabled ? (
        <Text variant="caption" color="faint">
          {steps}
        </Text>
      ) : null}
      {enabled ? <ToneBadge tone="positive" icon="check" label="Activé" /> : action}
    </Card>
  );
}
