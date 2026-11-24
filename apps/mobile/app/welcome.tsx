import { View } from "react-native";
import { router } from "expo-router";
import type { IconName } from "@vigie/shared";
import { Button } from "@/ui/Button";
import { Icon } from "@/ui/Icon";
import { FadeIn, Orb } from "@/ui/Orb";
import { Screen } from "@/ui/primitives";
import { Text } from "@/ui/Text";
import { palette, space } from "@/ui/theme";

export default function Welcome() {
  return (
    <Screen footer={<Button size="hero" label="Commencer" onPress={() => router.push("/login")} />}>
      <View style={{ alignItems: "center", gap: space.lg, paddingTop: space.xxl }}>
        <FadeIn>
          <Orb size={240} />
        </FadeIn>
        <FadeIn delay={120} style={{ gap: space.md, alignItems: "center" }}>
          <Text variant="display" align="center" accessibilityRole="header">
            Vigie veille{"\n"}sur vous.
          </Text>
          <Text color="soft" align="center" style={{ maxWidth: 320 }}>
            Appels, mails, SMS : Vigie repère les arnaques avant qu'elles ne vous atteignent.
          </Text>
        </FadeIn>
      </View>
      <FadeIn delay={240} style={{ gap: space.lg, marginTop: space.xxl }}>
        <Benefit icon="phone" title="Les appels de votre banque, certifiés" />
        <Benefit icon="mail" title="Chaque mail et SMS vérifié" />
        <Benefit icon="heart" title="Un proche prévenu en cas de doute" />
      </FadeIn>
    </Screen>
  );
}

function Benefit({ icon, title }: { icon: IconName; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: palette.accentSoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} color={palette.accent} size={26} />
      </View>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}
