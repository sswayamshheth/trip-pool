import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Icon, Money, Notice, Screen, SectionTitle, TextField } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { todayIso } from "@/lib/dates";
import { useFeedback, useOnce } from "@/lib/feedback";
import { CommandError, recordRefund, refundableRemaining, validateRefund } from "@/lib/ledger/commands";
import { computeExpense } from "@/lib/ledger/engine";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney, parseAmount } from "@/lib/money";

export default function RefundScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();
  const item = trip?.ledger.byExpenseId[expenseId ?? ""];

  const remaining = trip && item ? refundableRemaining(trip.state, item.expense.id) : 0;
  const defaultReceiver = item ? [...item.expense.payers].sort((a, b) => b.amountPaise - a.amountPaise)[0]?.participantId : undefined;

  const [amount, setAmount] = useState("");
  const [receivedBy, setReceivedBy] = useState<string | undefined>(defaultReceiver);
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const parsed = parseAmount(amount);
  const amountPaise = parsed.paise ?? 0;

  const errors = useMemo(() => {
    if (!trip || !item) return {};
    const e = validateRefund(trip.state, { expenseId: item.expense.id, amountPaise, receivedBy: receivedBy ?? "", date, reason });
    if (parsed.error && amount !== "") e.amount = parsed.error;
    if (e.amount?.includes("paise remain")) e.amount = `Only ${formatMoney(remaining)} is still refundable on this expense`;
    return e;
  }, [trip, item, amountPaise, receivedBy, date, reason, parsed.error, amount, remaining]);

  const preview = useMemo(() => {
    if (!trip || !item || Object.keys(errors).length || !receivedBy) return null;
    const after = computeExpense(item.expense, [
      ...item.refunds,
      { id: "preview", expenseId: item.expense.id, amountPaise, receivedBy, date, source: "manual" },
    ]);
    return after;
  }, [trip, item, errors, amountPaise, receivedBy, date]);

  const save = useOnce(() => {
    if (!trip || !item) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0] ?? "Check the highlighted fields", "error");
      return;
    }
    try {
      trip.append(recordRefund(trip.state, { expenseId: item.expense.id, amountPaise, receivedBy: receivedBy!, date, reason }, { actor: trip.actor }));
      toast(`${formatMoney(amountPaise)} refund routed to ${item.expense.participants.length} cost-bearer${item.expense.participants.length === 1 ? "" : "s"}`, "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not record the refund", "error");
    }
  });

  if (!trip || !item) {
    return (
      <Screen title="Record refund" back>
        <EmptyState icon="replay" title="Expense not found" />
      </Screen>
    );
  }

  const show = (key: "amount" | "receivedBy" | "date") => (submitted ? (errors as Record<string, string>)[key] : undefined);

  return (
    <Screen title="Record refund" subtitle={item.expense.title} back footer={<Button label="Record refund" icon="replay" full onPress={save} disabled={remaining === 0} />}>
      {remaining === 0 ? (
        <Notice tone="grey" icon="info-outline">
          This expense has already been fully refunded.
        </Notice>
      ) : null}

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>Still refundable</Text>
            <Money paise={remaining} style={{ fontSize: 22 }} />
          </View>
          <Chip label="Refund all" onPress={() => setAmount((remaining / 100).toFixed(remaining % 100 ? 2 : 0))} icon="done-all" />
          <Chip label="Half" onPress={() => setAmount((Math.floor(remaining / 2) / 100).toFixed(2).replace(/\.00$/, ""))} />
        </View>
        <TextField label="Refund amount" value={amount} onChangeText={setAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" autoFocus error={show("amount")} />
        <Field label="Who received the money back?" error={show("receivedBy")} hint="Usually whoever paid the vendor — the refund lands in their account.">
          <View style={styles.chips}>
            {trip.state.participants.map((p) => (
              <Chip key={p.id} label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name} selected={receivedBy === p.id} onPress={() => setReceivedBy(p.id)} left={<Avatar name={p.name} size={20} />} />
            ))}
          </View>
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={show("date")} style={{ flex: 1 }} />
        </View>
        <TextField label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. weather cancellation, overcharge" maxLength={120} />
      </Card>

      <SectionTitle title="How this refund routes" />
      {preview ? (
        <Card style={{ gap: 10 }}>
          <View style={styles.row}>
            <Text style={[type.small, { flex: 1 }]}>Effective cost</Text>
            <Text style={[type.small, styles.strike]}>{formatMoney(item.effectivePaise)}</Text>
            <Icon name="arrow-forward" size={14} color={colors.faint} />
            <Money paise={preview.effectivePaise} style={{ fontSize: 14 }} />
          </View>
          {item.expense.participants.map((p) => (
            <View key={p.participantId} style={styles.row}>
              <Avatar name={trip.fullName(p.participantId)} size={22} />
              <Text style={[type.body, { flex: 1 }]}>{`${trip.possessive(p.participantId)} share`}</Text>
              <Text style={[type.small, styles.strike]}>{formatMoney(item.shares[p.participantId] ?? 0)}</Text>
              <Icon name="arrow-forward" size={14} color={colors.faint} />
              <Money paise={preview.shares[p.participantId] ?? 0} style={{ fontSize: 14, color: colors.mintText }} />
            </View>
          ))}
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }]}>
            <Text style={[type.small, { flex: 1 }]}>{`${trip.possessive(receivedBy!)} net contribution`}</Text>
            <Text style={[type.small, styles.strike]}>{formatMoney(item.netPaidByPayer[receivedBy!] ?? 0)}</Text>
            <Icon name="arrow-forward" size={14} color={colors.faint} />
            <Money paise={preview.netPaidByPayer[receivedBy!] ?? 0} style={{ fontSize: 14 }} />
          </View>
          <Text style={type.caption}>
            The refund credits everyone who shares this expense, in proportion to what they bore. {trip.name(receivedBy!)} received the cash, so their receivable from the others drops by the same amount.
          </Text>
        </Card>
      ) : (
        <Notice tone="grey" icon="auto-awesome">
          Enter a valid amount to preview how every share changes.
        </Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  strike: { textDecorationLine: "line-through", color: colors.faint },
});
