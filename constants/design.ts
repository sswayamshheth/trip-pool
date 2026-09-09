import { Platform, type TextStyle, type ViewStyle } from "react-native";

/**
 * Design tokens for GroupTrip Ledger. The palette carries over from the
 * original prototype (ink navy, ledger blue) with a semantic layer on top so
 * money states read consistently: positive = mint, negative = coral,
 * pending = amber. Colour is never the only signal — every state also has
 * a label or icon.
 */
export const colors = {
  ink: "#14233B",
  ink2: "#3B4A62",
  muted: "#6C7B91",
  faint: "#9AA7B8",
  line: "#E4EAF2",
  lineStrong: "#D2DAE6",
  bg: "#F5F8FC",
  card: "#FFFFFF",
  cardAlt: "#F9FBFE",

  blue: "#1769E0",
  blueDeep: "#1157BD",
  blueSoft: "#E8F1FF",
  blueText: "#0F4FAE",

  mint: "#E5F5EF",
  mintText: "#13815A",
  mintStrong: "#1A9A6B",

  coral: "#FDEBEC",
  coralText: "#B83A45",
  coralStrong: "#CF4F5B",

  amber: "#FFF3DF",
  amberText: "#A05A0A",
  amberStrong: "#D97A0F",

  lavender: "#F0ECFF",
  lavenderText: "#6550B8",

  peach: "#FFF0E4",
  peachText: "#B85A20",

  overlay: "rgba(20,35,59,0.46)",
  white: "#FFFFFF",
} as const;

export const categoryTone: Record<string, { bg: string; fg: string; icon: string }> = {
  Stay: { bg: colors.blueSoft, fg: colors.blue, icon: "hotel" },
  Transport: { bg: colors.peach, fg: colors.peachText, icon: "directions-bus" },
  Activity: { bg: colors.mint, fg: colors.mintText, icon: "kayaking" },
  Food: { bg: colors.amber, fg: colors.amberText, icon: "restaurant" },
  Shopping: { bg: colors.lavender, fg: colors.lavenderText, icon: "shopping-bag" },
  Other: { bg: "#EEF1F6", fg: colors.ink2, icon: "receipt-long" },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Content column: full width on phones, a centred column on tablets/desktop. */
export const layout = { maxWidth: 560, gutter: 20, tabBarHeight: 64, touchTarget: 44 } as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800", letterSpacing: -0.8, color: colors.ink } as TextStyle,
  title: { fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.ink } as TextStyle,
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "700", letterSpacing: -0.2, color: colors.ink } as TextStyle,
  body: { fontSize: 15, lineHeight: 21, color: colors.ink } as TextStyle,
  bodyMuted: { fontSize: 15, lineHeight: 21, color: colors.muted } as TextStyle,
  small: { fontSize: 13, lineHeight: 18, color: colors.muted } as TextStyle,
  caption: { fontSize: 12, lineHeight: 16, color: colors.faint } as TextStyle,
  label: { fontSize: 11, lineHeight: 14, fontWeight: "800", letterSpacing: 1, color: colors.muted, textTransform: "uppercase" } as TextStyle,
  money: { fontVariant: ["tabular-nums"], fontWeight: "700", color: colors.ink } as TextStyle,
} as const;

export const shadow: { card: ViewStyle; float: ViewStyle } = {
  card: Platform.select({
    web: { boxShadow: "0 1px 2px rgba(20,35,59,0.05), 0 6px 18px -10px rgba(20,35,59,0.16)" } as ViewStyle,
    default: { elevation: 2, shadowColor: colors.ink, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
  })!,
  float: Platform.select({
    web: { boxShadow: "0 10px 30px -12px rgba(20,35,59,0.35)" } as ViewStyle,
    default: { elevation: 8, shadowColor: colors.ink, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 18 },
  })!,
};

export const focusRing: ViewStyle = Platform.OS === "web" ? ({ outlineStyle: "solid", outlineWidth: 2, outlineColor: colors.blue, outlineOffset: 2 } as ViewStyle) : {};
