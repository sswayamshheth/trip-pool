import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { Button, Card, Icon, Notice, Screen, SectionTitle, TextField, TextLink } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { parseUpiIntent, upiIntentUrl } from "@/lib/ledger/commands";
import { useStore } from "@/lib/ledger/store";
import { formatMoney, parseAmount } from "@/lib/money";

const DEMO_QR = "upi://pay?pa=himalayan.nest@okicici&pn=Himalayan%20Nest%20Homestay&am=6200.00&cu=INR&tn=Balance%20payment";

/**
 * QR payments. There is no camera decode in this prototype, so the honest
 * flow is: paste or type the QR payload (every UPI QR encodes a `upi://pay`
 * string), or use the demo QR. The payload is parsed for real, and the
 * payment hands off to the phone's own UPI app.
 */
export default function ScanScreen() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useFeedback();

  const [payload, setPayload] = useState("");
  const [amount, setAmount] = useState("");
  const parsedIntent = parseUpiIntent(payload);
  const parsedAmount = parseAmount(amount);
  const finalPaise = parsedAmount.paise ?? parsedIntent?.amountPaise ?? 0;

  const readClipboard = useOnce(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        toast("Clipboard is empty", "error");
        return;
      }
      setPayload(text.trim());
      const parsed = parseUpiIntent(text.trim());
      toast(parsed ? `Read ${parsed.vpa}` : "That doesn't look like a UPI QR", parsed ? "success" : "error");
    } catch {
      toast("Could not read the clipboard", "error");
    }
  });

  const pay = useOnce(async () => {
    if (!parsedIntent) {
      toast("Paste a valid UPI QR payload or ID first", "error");
      return;
    }
    if (finalPaise <= 0) {
      toast("Enter an amount", "error");
      return;
    }
    const url = upiIntentUrl({ vpa: parsedIntent.vpa, name: parsedIntent.name ?? parsedIntent.vpa, amountPaise: finalPaise, note: parsedIntent.note });
    if (Platform.OS === "web") {
      toast("On a phone this opens your UPI app with the payee and amount filled in", "info");
      return;
    }
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else toast("No UPI app found on this device", "error");
    } catch {
      toast("Could not open a UPI app", "error");
    }
  });

  return (
    <Screen title="Scan a QR" subtitle="Pay any UPI code" back footer={<Button label={`Open UPI app${finalPaise ? ` · ${formatMoney(finalPaise)}` : ""}`} icon="open-in-new" full onPress={pay} disabled={!parsedIntent || finalPaise <= 0} />}>
      <View style={styles.frame}>
        <View style={styles.frameInner}>
          <Icon name="qr-code-2" size={56} color={colors.faint} />
          <Text style={[type.small, { textAlign: "center", maxWidth: 260 }]}>
            Live camera scanning isn&apos;t part of this prototype. Every UPI QR encodes a <Text style={{ fontWeight: "700" }}>upi://pay</Text> link — paste it below and it&apos;s parsed for real.
          </Text>
        </View>
        <View style={[styles.corner, { top: 10, left: 10, borderTopWidth: 3, borderLeftWidth: 3 }]} />
        <View style={[styles.corner, { top: 10, right: 10, borderTopWidth: 3, borderRightWidth: 3 }]} />
        <View style={[styles.corner, { bottom: 10, left: 10, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
        <View style={[styles.corner, { bottom: 10, right: 10, borderBottomWidth: 3, borderRightWidth: 3 }]} />
      </View>

      <Card style={{ gap: 14 }}>
        <TextField
          label="QR payload or UPI ID"
          value={payload}
          onChangeText={setPayload}
          placeholder="upi://pay?pa=name@bank&am=500 — or just name@bank"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
          <TextLink label="Paste from clipboard" icon="content-paste" onPress={readClipboard} />
          <TextLink label="Use a demo QR" icon="bolt" onPress={() => setPayload(DEMO_QR)} />
        </View>
      </Card>

      {parsedIntent ? (
        <>
          <SectionTitle title="Payee" />
          <Card style={{ gap: 10 }}>
            <Row label="UPI ID" value={parsedIntent.vpa} />
            {parsedIntent.name ? <Row label="Name" value={parsedIntent.name} /> : null}
            {parsedIntent.amountPaise ? <Row label="Requested" value={formatMoney(parsedIntent.amountPaise)} /> : null}
            {parsedIntent.note ? <Row label="Note" value={parsedIntent.note} /> : null}
            <TextField
              label="Amount to pay"
              value={amount}
              onChangeText={setAmount}
              prefix="₹"
              placeholder={parsedIntent.amountPaise ? (parsedIntent.amountPaise / 100).toFixed(2) : "0"}
              keyboardType="decimal-pad"
              inputMode="decimal"
              error={amount && parsedAmount.error ? parsedAmount.error : undefined}
              hint={parsedIntent.amountPaise ? "The QR requested an amount — change it if you're paying something else." : undefined}
            />
          </Card>
        </>
      ) : payload.trim() ? (
        <Notice tone="coral" icon="error-outline" title="Not a UPI code">
          That isn&apos;t a UPI ID or a upi://pay link. A UPI ID looks like name@bank.
        </Notice>
      ) : null}

      <Notice tone="blue" icon="info-outline" title="Paying a vendor, not a member">
        This opens your own UPI app; nothing is recorded against a trip. To settle with someone in your group, use the Settle tab so the ledger updates.
      </Notice>

      {store.trips.length ? <Button label="Settle inside a trip instead" icon="swap-horiz" variant="ghost" onPress={() => router.replace("/(home)/trips")} /> : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Text style={[type.small, { width: 84 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1, fontWeight: "600" }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: 200, borderRadius: radius.xl, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  frameInner: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  corner: { position: "absolute", width: 28, height: 28, borderColor: colors.blue, borderRadius: 6 },
});
