import "@/global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import "@/lib/_core/nativewind-pressable";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { colors } from "@/constants/design";
import { FeedbackProvider } from "@/lib/feedback";
import { LedgerStoreProvider } from "@/lib/ledger/store";
import { ThemeProvider } from "@/lib/theme-provider";

export const unstable_settings = {
  initialRouteName: "index",
};

/** Forms open as sheets on a phone and as ordinary pages on the web. */
const sheet = Platform.OS === "web" ? ({ presentation: "card" } as const) : ({ presentation: "modal" } as const);

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
          <LedgerStoreProvider>
            <FeedbackProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: Platform.OS === "web" ? "none" : "default" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" options={{ animation: "fade" }} />
                <Stack.Screen name="(home)" />
                <Stack.Screen name="(trip)" />
                <Stack.Screen name="trips/new" options={sheet} />
                <Stack.Screen name="trips/edit" options={sheet} />
                <Stack.Screen name="itinerary/form" options={sheet} />
                <Stack.Screen name="itinerary/whatif" options={sheet} />
                <Stack.Screen name="expense/form" options={sheet} />
                <Stack.Screen name="expense/refund" options={sheet} />
                <Stack.Screen name="expense/cancel" options={sheet} />
                <Stack.Screen name="members/form" options={sheet} />
                <Stack.Screen name="members/methods" options={sheet} />
                <Stack.Screen name="pay" options={sheet} />
                <Stack.Screen name="payments/send" options={sheet} />
                <Stack.Screen name="payments/scan" options={sheet} />
              </Stack>
              <StatusBar style="dark" />
            </FeedbackProvider>
          </LedgerStoreProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
