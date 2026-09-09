import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, layout } from "@/constants/design";

type IconName = keyof typeof MaterialIcons.glyphMap;

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "trips", title: "Trips", icon: "groups" },
  { name: "payments", title: "Payments", icon: "account-balance-wallet" },
  { name: "profile", title: "Profile", icon: "person" },
];

export default function HomeTabsLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === "web" ? 0 : 8);
  return (
    <Tabs
      // Inactive tabs are frozen so they stop rendering (and stop appearing to screen readers).
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: layout.tabBarHeight + bottom,
          paddingBottom: bottom,
          paddingTop: 6,
          width: "100%",
          maxWidth: 720,
          alignSelf: "center",
        },
        tabBarItemStyle: { minHeight: layout.touchTarget },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color }) => <MaterialIcons name={tab.icon} size={23} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
