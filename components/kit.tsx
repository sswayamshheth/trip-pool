import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, layout, radius, shadow, space, type } from "@/constants/design";
import { formatMoney, type Paise } from "@/lib/money";
import { avatarTone, initials } from "@/lib/names";

export type IconName = keyof typeof MaterialIcons.glyphMap;

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <MaterialIcons name={name} size={size} color={color} />;
}

// ------------------------------------------------------------------ Screen

type ScreenProps = {
  title?: string;
  subtitle?: string;
  /** Show a back button in the header. */
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  /** Sticky footer (e.g. a primary button) rendered outside the scroll view. */
  footer?: ReactNode;
  /** Extra bottom padding so content clears the tab bar. */
  tabs?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({ title, subtitle, back, right, children, footer, tabs, scroll = true, contentStyle }: ScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const header =
    title || back || right ? (
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 6 }]}>
        <View style={styles.headerInner}>
          {back ? (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Icon name="arrow-back" size={22} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <Text style={[type.title, back && { fontSize: 19, lineHeight: 24 }]} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text style={type.small} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      </View>
    ) : null;

  const bottomPad = (tabs ? layout.tabBarHeight : 0) + Math.max(insets.bottom, 12) + 24;
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1, paddingBottom: bottomPad }, contentStyle]}>
      <View style={[styles.column, { flex: 1 }]}>{children}</View>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {header}
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + (tabs ? layout.tabBarHeight : 0) }]}>
          <View style={styles.column}>{footer}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------ Surfaces

export function Card({ children, style, tone }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: "default" | "ink" | "soft" }) {
  return <View style={[styles.card, tone === "ink" && styles.cardInk, tone === "soft" && styles.cardSoft, style]}>{children}</View>;
}

export function SectionTitle({ title, action, onAction, count }: { title: string; action?: string; onAction?: () => void; count?: number }) {
  return (
    <View style={styles.sectionTitle}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flex: 1 }}>
        <Text style={type.heading}>{title}</Text>
        {typeof count === "number" ? <Text style={type.small}>{count}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
          <Text style={styles.textButtonLabel}>{action}</Text>
          <Icon name="chevron-right" size={18} color={colors.blue} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ inset }: { inset?: boolean }) {
  return <View style={[styles.divider, inset && { marginLeft: 56 }]} />;
}

// ------------------------------------------------------------------ Buttons

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Button({ label, onPress, variant = "primary", icon, disabled, small, full, style, accessibilityLabel }: ButtonProps) {
  const fg =
    variant === "primary" || variant === "danger" || variant === "success"
      ? colors.white
      : variant === "secondary"
        ? colors.blueText
        : colors.ink2;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        full && { alignSelf: "stretch" },
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        variant === "danger" && styles.buttonDanger,
        variant === "success" && styles.buttonSuccess,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={[styles.buttonLabel, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = "default", size = 20 }: { icon: IconName; onPress: () => void; label: string; tone?: "default" | "blue" | "danger"; size?: number }) {
  const fg = tone === "blue" ? colors.blue : tone === "danger" ? colors.coralText : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.iconButton, tone === "blue" && { backgroundColor: colors.blueSoft }, pressed && styles.pressed]}
    >
      <Icon name={icon} size={size} color={fg} />
    </Pressable>
  );
}

export function TextLink({ label, onPress, icon }: { label: string; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={16} color={colors.blue} /> : null}
      <Text style={styles.textButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/** A tappable row/card wrapper with press feedback and accessibility. */
export function Tappable({ children, onPress, style, label, ...rest }: Omit<PressableProps, "style"> & { children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [style, pressed && styles.pressedSoft]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------------ Data display

export function Avatar({ name, size = 36, muted, ring }: { name: string; size?: number; muted?: boolean; ring?: boolean }) {
  const tone = avatarTone(name);
  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: muted ? colors.line : tone.bg },
        ring && { borderWidth: 2, borderColor: colors.white },
      ]}
    >
      <Text style={{ color: muted ? colors.muted : tone.fg, fontSize: Math.round(size * 0.38), fontWeight: "800", letterSpacing: 0.2 }}>{initials(name)}</Text>
    </View>
  );
}

export function AvatarStack({ names, max = 4, size = 26 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel={names.join(", ")}>
      {shown.map((n, i) => (
        <View key={`${n}-${i}`} style={{ marginLeft: i === 0 ? 0 : -Math.round(size * 0.22) }}>
          <Avatar name={n} size={size} ring />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, marginLeft: -Math.round(size * 0.22), backgroundColor: colors.ink, borderWidth: 2, borderColor: colors.white }]}>
          <Text style={{ color: colors.white, fontSize: Math.round(size * 0.36), fontWeight: "800" }}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Money({ paise, style, signed, tone = "none", paiseMode }: { paise: Paise; style?: StyleProp<TextStyle>; signed?: boolean; tone?: "none" | "auto"; paiseMode?: "auto" | "always" | "never" }) {
  const color = tone === "auto" ? (paise > 0 ? colors.mintText : paise < 0 ? colors.coralText : colors.muted) : undefined;
  return <Text style={[type.money, color ? { color } : null, style]}>{formatMoney(paise, { signed, paise: paiseMode })}</Text>;
}

export type PillTone = "blue" | "mint" | "coral" | "amber" | "grey" | "lavender" | "ink";
const pillTones: Record<PillTone, { bg: string; fg: string }> = {
  blue: { bg: colors.blueSoft, fg: colors.blueText },
  mint: { bg: colors.mint, fg: colors.mintText },
  coral: { bg: colors.coral, fg: colors.coralText },
  amber: { bg: colors.amber, fg: colors.amberText },
  grey: { bg: "#EEF1F6", fg: colors.ink2 },
  lavender: { bg: colors.lavender, fg: colors.lavenderText },
  ink: { bg: colors.ink, fg: colors.white },
};

export function Pill({ label, tone = "grey", icon, small }: { label: string; tone?: PillTone; icon?: IconName; small?: boolean }) {
  const t = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, small && styles.pillSmall]}>
      {icon ? <Icon name={icon} size={small ? 11 : 13} color={t.fg} /> : null}
      <Text style={[styles.pillText, small && { fontSize: 10 }, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: string; tone?: "mint" | "coral" | "blue" | "amber" }) {
  return (
    <View style={[styles.stat, tone === "mint" && { backgroundColor: colors.mint }, tone === "coral" && { backgroundColor: colors.coral }, tone === "blue" && { backgroundColor: colors.blueSoft }, tone === "amber" && { backgroundColor: colors.amber }]}>
      <Text style={type.label}>{label}</Text>
      <View style={{ marginTop: 6 }}>{typeof value === "string" ? <Text style={[type.money, { fontSize: 20 }]}>{value}</Text> : value}</View>
      {sub ? (
        <Text style={[type.caption, { marginTop: 3 }]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

export function ListRow({ left, title, subtitle, right, onPress, chevron, label, style }: { left?: ReactNode; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; chevron?: boolean; label?: string; style?: StyleProp<ViewStyle> }) {
  const inner = (
    <>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.small, { marginTop: 2 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ alignItems: "flex-end", marginLeft: 8 }}>{right}</View> : null}
      {chevron ? <Icon name="chevron-right" size={20} color={colors.faint} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, style]}>{inner}</View>;
  return (
    <Tappable onPress={onPress} label={label ?? title} style={[styles.row, style]}>
      {inner}
    </Tappable>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.blue} />
      </View>
      <Text style={[type.heading, { textAlign: "center" }]}>{title}</Text>
      {message ? <Text style={[type.bodyMuted, { textAlign: "center", maxWidth: 320 }]}>{message}</Text> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

function isTextish(node: ReactNode): boolean {
  if (typeof node === "string" || typeof node === "number") return true;
  if (Array.isArray(node)) return node.every((n) => n == null || typeof n === "string" || typeof n === "number" || typeof n === "boolean");
  return false;
}

export function Notice({ icon = "info-outline", tone = "blue", title, children }: { icon?: IconName; tone?: PillTone; title?: string; children: ReactNode }) {
  const t = pillTones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]}>
      <Icon name={icon} size={18} color={t.fg} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[type.body, { fontWeight: "700", color: t.fg }]}>{title}</Text> : null}
        {isTextish(children) ? <Text style={[type.small, { color: t.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ Forms

export function Field({ label, error, hint, children, style }: { label: string; error?: string; hint?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.fieldError} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function TextField({ label, error, hint, prefix, style, ...input }: Omit<TextInputProps, "style"> & { label: string; error?: string; hint?: string; prefix?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Field label={label} error={error} hint={hint} style={style}>
      <View style={[styles.inputWrap, error && styles.inputWrapError]}>
        {prefix ? <Text style={styles.inputPrefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.faint}
          accessibilityLabel={label}
          style={[styles.input, input.multiline && { minHeight: 76, textAlignVertical: "top", paddingTop: 12 }]}
          {...input}
        />
      </View>
    </Field>
  );
}

export function Chip({ label, selected, onPress, icon, disabled, left }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName; disabled?: boolean; left?: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.45 }, pressed && styles.pressed]}
    >
      {left}
      {icon ? <Icon name={icon} size={15} color={selected ? colors.white : colors.ink2} /> : null}
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={() => [styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}: ${value}`}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} style={styles.stepBtn} disabled={value <= min}>
        <Icon name="remove" size={16} color={value <= min ? colors.faint : colors.ink} />
      </Pressable>
      <Text style={[type.body, { fontWeight: "700", minWidth: 20, textAlign: "center" }]}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} style={styles.stepBtn} disabled={value >= max}>
        <Icon name="add" size={16} color={value >= max ? colors.faint : colors.ink} />
      </Pressable>
    </View>
  );
}

// ------------------------------------------------------------------ Sheet

export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheetHost, { pointerEvents: "box-none" }]}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={type.heading}>{title}</Text>
            <IconButton icon="close" onPress={onClose} label="Close" />
          </View>
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? <View style={{ marginTop: 12 }}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ Styles

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.bg, paddingHorizontal: layout.gutter, paddingBottom: 10 },
  headerInner: { flexDirection: "row", alignItems: "center", gap: 10, width: "100%", maxWidth: layout.maxWidth, alignSelf: "center" },
  backButton: { width: layout.touchTarget, height: layout.touchTarget, marginLeft: -10, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  content: { paddingHorizontal: layout.gutter, paddingTop: 4 },
  column: { width: "100%", maxWidth: layout.maxWidth, alignSelf: "center", gap: space.md },
  footer: { paddingHorizontal: layout.gutter, paddingTop: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },

  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: colors.line, ...shadow.card },
  cardInk: { backgroundColor: colors.ink, borderColor: colors.ink },
  cardSoft: { backgroundColor: colors.cardAlt, borderColor: colors.line, ...Platform.select({ web: { boxShadow: "none" } as ViewStyle, default: { elevation: 0 } }) },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm, minHeight: 32 },
  textButton: { flexDirection: "row", alignItems: "center", gap: 2, minHeight: 32, paddingHorizontal: 4 },
  textButtonLabel: { color: colors.blue, fontWeight: "700", fontSize: 14 },
  divider: { height: 1, backgroundColor: colors.line },

  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "flex-start" },
  buttonSmall: { minHeight: 36, paddingHorizontal: 12, borderRadius: radius.sm },
  buttonPrimary: { backgroundColor: colors.blue },
  buttonSecondary: { backgroundColor: colors.blueSoft },
  buttonGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.lineStrong },
  buttonDanger: { backgroundColor: colors.coralStrong },
  buttonSuccess: { backgroundColor: colors.mintStrong },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { fontSize: 15, fontWeight: "700" },
  iconButton: { width: layout.touchTarget, height: layout.touchTarget, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  pressed: { opacity: 0.72 },
  pressedSoft: { opacity: 0.85 },

  avatar: { alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillSmall: { paddingHorizontal: 7, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  stat: { flex: 1, minWidth: 130, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 56 },
  rowLeft: { width: 40, alignItems: "center" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 36, paddingHorizontal: 20 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  notice: { flexDirection: "row", gap: 10, padding: 12, borderRadius: radius.md, alignItems: "flex-start" },

  field: { gap: 6 },
  fieldLabel: { ...type.small, fontWeight: "700", color: colors.ink2 },
  fieldError: { fontSize: 13, color: colors.coralText, fontWeight: "600" },
  fieldHint: { fontSize: 12, color: colors.faint },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.md, paddingHorizontal: 12 },
  inputWrapError: { borderColor: colors.coralStrong },
  inputPrefix: { ...type.body, color: colors.muted, marginRight: 4 },
  input: { flex: 1, minHeight: 46, fontSize: 16, color: colors.ink, paddingVertical: 10, ...(Platform.select({ web: { outlineStyle: "none" } as unknown as TextStyle, default: {} }) as TextStyle) },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 38, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineStrong },
  chipSelected: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.ink2 },
  segmented: { flexDirection: "row", backgroundColor: "#E9EEF5", borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.card, ...shadow.card },
  segmentText: { fontSize: 13, fontWeight: "700", color: colors.muted },
  segmentTextActive: { color: colors.ink },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.bg, borderRadius: radius.pill, padding: 2 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheetHost: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  sheet: { width: "100%", maxWidth: layout.maxWidth + 40, backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, paddingTop: 10, ...shadow.float },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: "center", marginBottom: 12 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
});
