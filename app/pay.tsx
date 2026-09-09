import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Icon, Notice, Screen, Segmented, TextField } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { CommandError, initiateSettlement, upiIntentUrl, validateSettlement } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import type { SettlementMethod } from "@/lib/ledger/types";
import { formatMoney, parseAmount } from "@/lib/money";

/**
 * Settlement flow. Three distinct states, deliberately kept apart:
 *  1. Payment initiated — the payer says they sent money (UPI app opened / cash handed over).
 *  2. Payment confirmed — the recipient confirms it arrived. Only now do balances move.
 *  3. Settlement recorded — the confirmed payment sits in the ledger's history.
 * Nothing here moves real money; the phone's UPI app does that.
 */
export default function PayScreen() {
  const params = useLocalSearchParams<{ from: string; to: string; amount?: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();

  const from = trip?.participant(params.from ?? "");
  const to = trip?.participant(params.to ?? "");
  const suggested = Number(params.amount ?? 0);
  const owes = trip && from ? Math.max(0, -trip.ledger.balances[from.id].provisionalNetPaise) : 0;

  const [amount, setAmount] = useState(suggested > 0 ? (suggested / 100).toFixed(suggested % 100 ? 2 : 0) : "");
  const [method, setMethod] = useState<SettlementMethod>(to?.upiId ? "upi" : "cash");
  const [reference, setReference] = useState("");
  const [opened, setOpened] = useState(false);

  const parsed = parseAmount(amount);
  const amountPaise = parsed.paise ?? 0;
  const errors = useMemo(() => {
    if (!trip || !from || !to) return {};
    const e = validateSettlement(trip.state, { from: from.id, to: to.id, amountPaise, method });
    if (parsed.error && amount !== "") e.amount = parsed.error;
    if (e.amount?.includes("paise still owed")) e.amount = `That's more than the ${formatMoney(owes)} ${trip.short(from.id)} still owes`;
    return e;
  }, [trip, from, to, amountPaise, method, parsed.error, amount, owes]);

  const intent = to?.upiId && from ? upiIntentUrl({ vpa: to.upiId, name: to.name, amountPaise, note: `${trip?.state.trip.name ?? "Trip"} settlement` }) : null;

  const openUpi = async () => {
    if (!intent) return;
    setOpened(true);
    if (Platform.OS === "web") {
      toast("On a phone this opens your UPI app with the amount and recipient pre-filled", "info");
      return;
    }
    try {
      const can = await Linking.canOpenURL(intent);
      if (can) await Linking.openURL(intent);
      else toast("No UPI app found on this device", "error");
    } catch {
      toast("Could not open a UPI app", "error");
    }
  };

  const copyUpi = async () => {
    if (!to?.upiId) return;
    await Clipboard.setStringAsync(to.upiId);
    toast(`Copied ${to.upiId}`, "success");
  };

  const record = useOnce(() => {
    if (!trip || !from || !to) return;
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0] ?? "Check the amount", "error");
      return;
    }
    try {
      trip.append(initiateSettlement(trip.state, { from: from.id, to: to.id, amountPaise, method, reference }, { actor: trip.actor }));
      toast(`Payment of ${formatMoney(amountPaise)} initiated · ${trip.short(to.id)} confirms when it arrives`, "success");
      router.replace("/settle");
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not record the payment", "error");
    }
  });

  if (!trip || !from || !to) {
    return (
      <Screen title="Pay" back>
        <EmptyState icon="payments" title="Nothing to pay" message="Pick a transfer from the Settle tab." action={<Button label="Go to Settle" onPress={() => router.replace("/settle")} />} />
      </Screen>
    );
  }

  const isMe = trip.isViewer(from.id);

  return (
    <Screen title={isMe ? `Pay ${trip.short(to.id)}` : `${trip.short(from.id)} pays ${trip.short(to.id)}`} subtitle={`${trip.short(from.id)} owes ${formatMoney(owes)} in total`} back footer={<Button label={method === "upi" ? "I've sent this via UPI" : "Cash was handed over"} icon="check" full onPress={record} />}>
      <Card style={{ gap: 16 }}>
        <View style={styles.parties}>
          <View style={styles.party}>
            <Avatar name={from.name} size={48} />
            <Text style={styles.partyName}>{trip.short(from.id)}</Text>
          </View>
          <Icon name="arrow-forward" size={22} color={colors.muted} />
          <View style={styles.party}>
            <Avatar name={to.name} size={48} />
            <Text style={styles.partyName}>{trip.short(to.id)}</Text>
          </View>
        </View>
        <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" error={errors.amount} />
        <View style={styles.chips}>
          {suggested > 0 && suggested !== amountPaise ? <Chip label={`Recommended ${formatMoney(suggested)}`} onPress={() => setAmount((suggested / 100).toFixed(suggested % 100 ? 2 : 0))} /> : null}
          {owes > 0 && owes !== amountPaise ? <Chip label={`Everything · ${formatMoney(owes)}`} onPress={() => setAmount((owes / 100).toFixed(owes % 100 ? 2 : 0))} /> : null}
        </View>
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: "upi", label: "UPI" },
            { value: "cash", label: "Cash / other" },
          ]}
        />
      </Card>

      {method === "upi" ? (
        <Card style={{ gap: 12 }}>
          <Text style={type.label}>Pay to</Text>
          {to.upiId ? (
            <>
              <View style={styles.upiBox}>
                <Icon name="qr-code-2" size={22} color={colors.blue} />
                <Text style={[type.heading, { flex: 1 }]} numberOfLines={1}>
                  {to.upiId}
                </Text>
                <Button label="Copy" icon="content-copy" small variant="secondary" onPress={copyUpi} />
              </View>
              <Button label={`Open UPI app · ${formatMoney(amountPaise)}`} icon="open-in-new" onPress={openUpi} disabled={amountPaise <= 0} full />
              {opened ? (
                <Notice tone="amber" icon="schedule">
                  {`After you complete the payment in your UPI app, come back and tap "I've sent this". ${trip.short(to.id)} confirms once it lands, and only then do balances move.`}
                </Notice>
              ) : null}
              <Text style={type.caption}>Opens a standard UPI intent (upi://pay) with the recipient and amount filled in. GroupTrip Ledger never handles the money itself.</Text>
            </>
          ) : (
            <Notice tone="amber" icon="warning-amber">
              {`${to.name} hasn't added a UPI ID. Ask them to add one, or record a cash payment instead.`}
            </Notice>
          )}
          <TextField label="UPI reference (optional)" value={reference} onChangeText={setReference} placeholder="Transaction ID from your UPI app" maxLength={40} autoCapitalize="characters" />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <TextField label="Note (optional)" value={reference} onChangeText={setReference} placeholder="e.g. cash at breakfast" maxLength={40} />
          <Text style={type.caption}>Recorded as a cash payment. {trip.short(to.id)} still confirms it before balances change.</Text>
        </Card>
      )}

      <View style={styles.steps}>
        <Step n={1} label="Payment initiated" detail="You say it's sent" active />
        <Step n={2} label="Confirmed" detail={`${trip.short(to.id)} confirms receipt`} />
        <Step n={3} label="Settled" detail="Balances update, kept in history" />
      </View>
    </Screen>
  );
}

function Step({ n, label, detail, active }: { n: number; label: string; detail: string; active?: boolean }) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepDot, active && { backgroundColor: colors.blue }]}>
        <Text style={[styles.stepNum, active && { color: colors.white }]}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.small, { fontWeight: "700", color: colors.ink }]}>{label}</Text>
        <Text style={type.caption}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  parties: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  party: { alignItems: "center", gap: 6, width: 90 },
  partyName: { ...type.small, fontWeight: "700", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  upiBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 },
  steps: { flexDirection: "row", gap: 8 },
  step: { flex: 1, gap: 6 },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.line, alignItems: "center", justifyContent: "center" },
  stepNum: { fontSize: 12, fontWeight: "800", color: colors.muted },
});
