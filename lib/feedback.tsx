import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import { colors, layout, radius, shadow, space, type } from "@/constants/design";

/**
 * In-app feedback that works on every platform. React Native Web does not
 * implement Alert.alert, so toasts and confirmations are rendered by us.
 */

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type FeedbackApi = {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counter.current;
    setToasts((current) => [...current.slice(-2), { id, message, kind }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), kind === "error" ? 4200 : 2800);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  }, []);

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <View style={[styles.toastHost, { pointerEvents: "box-none" }]} accessibilityLiveRegion="polite">
        {toasts.map((t) => (
          <View key={t.id} style={[styles.toast, t.kind === "success" && styles.toastSuccess, t.kind === "error" && styles.toastError]} accessibilityRole="alert">
            <MaterialIcons name={t.kind === "success" ? "check-circle" : t.kind === "error" ? "error-outline" : "info-outline"} size={18} color={colors.white} />
            <Text style={styles.toastText}>{t.message}</Text>
          </View>
        ))}
      </View>
      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => settle(false)}>
        <Pressable style={styles.backdrop} onPress={() => settle(false)} accessibilityLabel="Dismiss" />
        <View style={[styles.dialogWrap, { pointerEvents: "box-none" }]}>
          <View style={styles.dialog} accessibilityViewIsModal accessibilityRole={Platform.OS === "web" ? ("dialog" as never) : undefined}>
            <Text style={styles.dialogTitle}>{pending?.title}</Text>
            {pending?.message ? <Text style={styles.dialogMessage}>{pending.message}</Text> : null}
            <View style={styles.dialogActions}>
              <DialogButton label={pending?.cancelLabel ?? "Cancel"} onPress={() => settle(false)} />
              <DialogButton label={pending?.confirmLabel ?? "Confirm"} onPress={() => settle(true)} primary destructive={pending?.destructive} />
            </View>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

function DialogButton({ label, onPress, primary, destructive }: { label: string; onPress: () => void; primary?: boolean; destructive?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.dialogButton,
        primary && styles.dialogButtonPrimary,
        primary && destructive && styles.dialogButtonDanger,
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.dialogButtonText, primary && styles.dialogButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return ctx;
}

/** Runs an action and reports thrown CommandError messages as error toasts. Returns true on success. */
export function useGuarded() {
  const { toast } = useFeedback();
  return useCallback(
    (fn: () => void, successMessage?: string): boolean => {
      try {
        fn();
        if (successMessage) toast(successMessage, "success");
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Something went wrong", "error");
        return false;
      }
    },
    [toast],
  );
}

/** Debounces repeated presses so a double-tap cannot submit twice. */
export function useOnce<T extends (...args: never[]) => void>(fn: T, ms = 600): T {
  const last = useRef(0);
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - last.current < ms) return;
      last.current = now;
      fnRef.current(...args);
    }) as T,
    [ms],
  );
}

const styles = StyleSheet.create({
  toastHost: { position: "absolute", left: 0, right: 0, bottom: layout.tabBarHeight + 16, alignItems: "center", gap: 8, zIndex: 50 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.pill,
    maxWidth: 420,
    marginHorizontal: 16,
    ...shadow.float,
  },
  toastSuccess: { backgroundColor: colors.mintStrong },
  toastError: { backgroundColor: colors.coralStrong },
  toastText: { color: colors.white, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  dialogWrap: { flex: 1, justifyContent: "center", alignItems: "center", padding: space.xl },
  dialog: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, width: "100%", maxWidth: 400, ...shadow.float },
  dialogTitle: { ...type.heading, fontSize: 18, marginBottom: space.sm },
  dialogMessage: { ...type.bodyMuted, marginBottom: space.lg },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm },
  dialogButton: { minHeight: layout.touchTarget, paddingHorizontal: 16, borderRadius: radius.md, justifyContent: "center", backgroundColor: colors.bg },
  dialogButtonPrimary: { backgroundColor: colors.blue },
  dialogButtonDanger: { backgroundColor: colors.coralStrong },
  dialogButtonText: { ...type.body, fontWeight: "700", color: colors.ink2 },
  dialogButtonTextPrimary: { color: colors.white },
});
