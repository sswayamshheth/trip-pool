import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { colors } from "@/constants/design";
import { useStore } from "@/lib/ledger/store";

/** Entry gate: wait for storage, then send the user to sign-in or their trips. */
export default function Index() {
  const store = useStore();
  if (!store.ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }
  return <Redirect href={store.session ? "/(home)/trips" : "/login"} />;
}
