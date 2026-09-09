import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Icon, Money, Notice, Screen, SectionTitle, TextField } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { todayIso } from "@/lib/dates";
import { useFeedback, useOnce } from "@/lib/feedback";
import { cancelExpense, CommandError, previewCancellation } from "@/lib/ledger/commands";
import { computeExpense } from "@/lib/ledger/engine";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

export default function CancelExpenseScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();
  const item = trip?.ledger.byExpenseId[expenseId ?? ""];

  const [percent, setPercent] = useState(String(item?.expense.cancellationPolicy?.refundPercent ?? 0));
  const [receivedBy, setReceivedBy] = useState<string | undefined>(() => (item ? [...item.expense.payers].sort((a, b) => b.amountPaise - a.amountPaise)[0]?.participantId : undefined));
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");

  const pct = Number(percent);
  const pctValid = Number.isFinite(pct) && pct >= 0 && pct <= 100 && percent !== "";

  const preview = useMemo(() => {
    if (!trip || !item || !pctValid) return null;
    const p = previewCancellation(trip.state, item.expense.id, pct);
    const after = computeExpense(
      item.expense,
      p.recoverablePaise > 0 && receivedBy ? [...item.refunds, { id: "preview", expenseId: item.expense.id, amountPaise: p.recoverablePaise, receivedBy, date, source: "cancellation" }] : item.refunds,
    );
    return { ...p, after };
  }, [trip, item, pct, pctValid, receivedBy, date]);

  const save = useOnce(() => {
    if (!trip || !item) return;
    if (!pctValid) {
      toast("Refundable percentage must be 0–100", "error");
      return;
    }
    try {
      trip.append(cancelExpense(trip.state, item.expense.id, { refundPercent: pct, receivedBy, date, reason }, { actor: trip.actor }));
      toast(`Booking cancelled · ${formatMoney(preview?.recoverablePaise ?? 0)} routed back to cost-bearers`, "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not cancel the booking", "error");
    }
  });

  if (!trip || !item) {
    return (
      <Screen title="Cancel booking" back>
        <EmptyState icon="event-busy" title="Expense not found" />
      </Screen>
    );
  }
  if (item.expense.status === "cancelled") {
    return (
      <Screen title="Cancel booking" back>
        <EmptyState icon="event-busy" title="Already cancelled" action={<Button label="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  return (
    <Screen title="Cancel booking" subtitle={item.expense.title} back footer={<Button label="Cancel booking under this policy" icon="event-busy" variant="danger" full onPress={save} />}>
      <Notice tone="amber" icon="policy" title="The vendor's terms decide what comes back">
        Only the recoverable part is refunded — to the people who bore the cost. The unrecoverable part is a real loss and stays split between them.
      </Notice>

      <Card style={{ gap: 14 }}>
        <Field label="Refundable under the vendor's policy" hint={item.expense.cancellationPolicy ? `Saved policy: ${item.expense.cancellationPolicy.refundPercent}%${item.expense.cancellationPolicy.note ? ` · ${item.expense.cancellationPolicy.note}` : ""}` : "No policy was saved on this booking — enter what the vendor offers."}>
          <View style={styles.chips}>
            {["0", "25", "50", "75", "100"].map((p) => (
              <Chip key={p} label={`${p}%`} selected={percent === p} onPress={() => setPercent(p)} />
            ))}
          </View>
        </Field>
        <TextField label="Refundable %" value={percent} onChangeText={(v) => setPercent(v.replace(/[^0-9]/g, "").slice(0, 3))} keyboardType="number-pad" error={!pctValid ? "Enter 0–100" : undefined} />
        {preview && preview.recoverablePaise > 0 ? (
          <Field label="Who receives the refund from the vendor?">
            <View style={styles.chips}>
              {trip.state.participants.map((p) => (
                <Chip key={p.id} label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name} selected={receivedBy === p.id} onPress={() => setReceivedBy(p.id)} left={<Avatar name={p.name} size={20} />} />
              ))}
            </View>
          </Field>
        ) : null}
        <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. trip cut short" maxLength={120} />
      </Card>

      <SectionTitle title="What happens" />
      {preview ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.stats}>
            <View style={[styles.stat, { backgroundColor: colors.mint }]}>
              <Text style={type.label}>Recovered</Text>
              <Money paise={preview.recoverablePaise} style={{ fontSize: 20, color: colors.mintText }} />
              <Text style={type.caption}>{pct}% of {formatMoney(item.expense.amountPaise)}</Text>
            </View>
            <View style={[styles.stat, { backgroundColor: colors.coral }]}>
              <Text style={type.label}>Lost</Text>
              <Money paise={preview.lossPaise} style={{ fontSize: 20, color: colors.coralText }} />
              <Text style={type.caption}>stays shared</Text>
            </View>
          </View>
          {item.expense.participants.map((p) => (
            <View key={p.participantId} style={styles.row}>
              <Avatar name={trip.fullName(p.participantId)} size={22} />
              <Text style={[type.body, { flex: 1 }]}>{trip.name(p.participantId)}</Text>
              <Text style={[type.small, styles.strike]}>{formatMoney(item.shares[p.participantId] ?? 0)}</Text>
              <Icon name="arrow-forward" size={14} color={colors.faint} />
              <Money paise={preview.after.shares[p.participantId] ?? 0} style={{ fontSize: 14 }} />
            </View>
          ))}
          {preview.recoverablePaise > 0 && receivedBy ? (
            <Text style={type.caption}>
              {trip.name(receivedBy)} receives {formatMoney(preview.recoverablePaise)} from the vendor, so what they are owed by the others drops by the same amount.
            </Text>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 12, padding: 12, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  strike: { textDecorationLine: "line-through", color: colors.faint },
});
