import { View } from "react-native";
import { router } from "expo-router";
import { Logo } from "@/ui/Brand";
import { Button } from "@/ui/Button";
import { FadeIn } from "@/ui/Orb";
import { Group, ListRow, Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { space } from "@/ui/theme";

/** Bienvenue : le logo, une phrase, trois raisons, un bouton. */
export default function Welcome() {
  return (
    <Screen footer={<Button label="Commencer" onPress={() => router.push("/login")} />}>
      <FadeIn style={{ alignItems: "center", marginTop: space.xxl, gap: space.md }}>
        <Logo size={72} />
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text variant="title" align="center" accessibilityRole="header">
            SmartSecure
          </Text>
          <Text color="faint" align="center" style={{ maxWidth: 300 }}>
            Sachez qui vous appelle vraiment, et vérifiez un message avant d’y répondre.
          </Text>
        </View>
      </FadeIn>
      <FadeIn delay={80} style={{ marginTop: space.xl }}>
        <Group>
          <ListRow icon="phoneIn" title="Les appels de votre banque" subtitle="Annoncés à l’avance par votre conseiller" />
          <ListRow icon="message" title="Les messages douteux" subtitle="Vérifiés avant que vous répondiez" />
          <ListRow icon="heart" title="Un proche à vos côtés" subtitle="Prévenu en un geste en cas de doute" />
        </Group>
      </FadeIn>
    </Screen>
  );
}
