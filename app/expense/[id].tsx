import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, type IconName } from "@/components/kit";
import { categoryTone, colors, radius, type } from "@/constants/design";
import { formatDate, formatRelative } from "@/lib/dates";
import { useFeedback, useGuarded } from "@/lib/feedback";
import { deleteExpense, deleteRefund, refundableRemaining } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

export default function ExpenseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip();
  const guarded = useGuarded();
  const { confirm } = useFeedback();

  const item = trip?.ledger.byExpenseId[id ?? ""];
  if (!trip || !item) {
    return (
      <Screen title="Expense" back>
        <EmptyState icon="receipt-long" title="Expense not found" message="It may have been deleted." action={<Button label="Back to expenses" onPress={() => router.replace("/expenses")} />} />
      </Screen>
    );
  }

  const { expense, shares, grossShares, refunds, refundedPaise, effectivePaise } = item;
  const tone = categoryTone[expense.category] ?? categoryTone.Other;
  const cancelled = expense.status === "cancelled";
  const remaining = refundableRemaining(trip.state, expense.id);
  const totalWeight = expense.participants.reduce((s, p) => s + p.weight, 0);
  const viewerShare = trip.viewerId ? (shares[trip.viewerId] ?? 0) : 0;
  const viewerIn = trip.viewerId ? expense.participants.some((p) => p.participantId === trip.viewerId) : false;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete "${expense.title}"?`,
      message: `${formatMoney(expense.amountPaise)} and ${refunds.length ? `${refunds.length} refund${refunds.length === 1 ? "" : "s"} ` : ""}every share derived from it will be withdrawn. The deletion stays in the audit trail.`,
      confirmLabel: "Delete expense",
      destructive: true,
    });
    if (!ok) return;
    if (guarded(() => trip.append(deleteExpense(trip.state, expense.id, { actor: trip.actor })), "Expense deleted")) router.back();
  };

  const onDeleteRefund = async (refundId: string, amount: number) => {
    const ok = await confirm({ title: "Remove this refund?", message: `${formatMoney(amount)} will be added back to the expense and every share re-derived.`, confirmLabel: "Remove refund", destructive: true });
    if (ok) guarded(() => trip.append(deleteRefund(trip.state, refundId, { actor: trip.actor })), "Refund removed");
  };

  const shareExplain = (weight: number, share: number) => {
    if (expense.splitMode === "equal") return `${formatMoney(effectivePaise)} ÷ ${expense.participants.length}`;
    if (expense.splitMode === "weighted") return `${weight} of ${totalWeight} shares`;
    return `${Math.round((weight / Math.max(1, totalWeight)) * 100)}% exact`;
  };

  return (
    <Screen
      title={expense.title}
      subtitle={`${expense.category} · ${formatDate(expense.date, { year: true })}${expense.vendor ? ` · ${expense.vendor}` : ""}`}
      back
      right={!cancelled ? <Button label="Edit" icon="edit" small variant="secondary" onPress={() => router.push({ pathname: "/expense/form", params: { id: expense.id } })} /> : undefined}
    >
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.icon, { backgroundColor: tone.bg }]}>
            <Icon name={tone.icon as IconName} size={24} color={tone.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.label}>{refundedPaise > 0 ? "Effective cost" : "Amount"}</Text>
            <Money paise={effectivePaise} style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.8 }} />
            {refundedPaise > 0 ? (
              <Text style={type.small}>
                {formatMoney(expense.amountPaise)} paid − {formatMoney(refundedPaise)} refunded
              </Text>
            ) : null}
          </View>
          {cancelled ? <Pill label="Cancelled" tone="coral" icon="event-busy" /> : refundedPaise > 0 ? <Pill label="Partly refunded" tone="lavender" icon="replay" /> : <Pill label="Active" tone="mint" icon="check" />}
        </View>

        <View style={styles.kv}>
          <Text style={type.small}>Paid by</Text>
          <View style={{ flex: 1, gap: 4 }}>
            {expense.payers.map((p) => (
              <View key={p.participantId} style={styles.payer}>
                <Avatar name={trip.fullName(p.participantId)} size={22} />
                <Text style={[type.body, { flex: 1 }]}>{trip.name(p.participantId)}</Text>
                <Money paise={p.amountPaise} style={{ fontSize: 14 }} />
              </View>
            ))}
          </View>
        </View>
        {expense.notes ? (
          <View style={styles.kv}>
            <Text style={type.small}>Notes</Text>
            <Text style={[type.body, { flex: 1 }]}>{expense.notes}</Text>
          </View>
        ) : null}
        {expense.cancellationPolicy ? (
          <View style={styles.kv}>
            <Text style={type.small}>Policy</Text>
            <Text style={[type.body, { flex: 1 }]}>
              {expense.cancellationPolicy.refundPercent}% refundable on cancellation{expense.cancellationPolicy.note ? ` · ${expense.cancellationPolicy.note}` : ""}
            </Text>
          </View>
        ) : null}
      </Card>

      {cancelled && expense.cancellation ? (
        <Notice icon="event-busy" tone="coral" title={`Cancelled ${formatRelative(expense.cancellation.ts)}`}>
          {`${expense.cancellation.refundPercent}% policy · ${formatMoney(expense.cancellation.recoverablePaise)} recovered and routed to the people who bore the cost · ${formatMoney(expense.cancellation.lossPaise)} unrecoverable stays split between them.`}
        </Notice>
      ) : null}

      <SectionTitle title="Who bears this cost" count={expense.participants.length} />
      <Card style={{ paddingVertical: 4 }}>
        {expense.participants.length === 0 ? (
          <Text style={[type.bodyMuted, { paddingVertical: 10 }]}>Nobody is on this expense — the payers are carrying it themselves until someone is added.</Text>
        ) : (
          expense.participants.map((p, i) => {
            const share = shares[p.participantId] ?? 0;
            const gross = grossShares[p.participantId] ?? 0;
            return (
              <View key={p.participantId} style={[styles.shareRow, i < expense.participants.length - 1 && styles.rowBorder]}>
                <Avatar name={trip.fullName(p.participantId)} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{trip.name(p.participantId)}</Text>
                  <Text style={type.caption}>{shareExplain(p.weight, share)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Money paise={share} />
                  {gross !== share ? <Text style={[type.caption, { textDecorationLine: "line-through" }]}>{formatMoney(gross)}</Text> : null}
                </View>
              </View>
            );
          })
        )}
        {viewerIn ? (
          <View style={styles.trace}>
            <Icon name="auto-awesome" size={16} color={colors.blue} />
            <Text style={[type.small, { flex: 1, color: colors.blueText }]}>
              Your share is {formatMoney(viewerShare)}: {shareExplain(expense.participants.find((p) => p.participantId === trip.viewerId)?.weight ?? 0, viewerShare)}
              {refundedPaise > 0 ? `, after ${formatMoney(refundedPaise)} of refunds were routed back to everyone on this expense.` : "."}
            </Text>
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Refunds" count={refunds.length} />
      {refunds.length === 0 ? (
        <Card>
          <Text style={type.bodyMuted}>No refunds recorded. A refund lowers the effective cost and credits everyone who shares it — not just whoever paid.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {refunds.map((r, i) => (
            <View key={r.id} style={[styles.shareRow, i < refunds.length - 1 && styles.rowBorder]}>
              <View style={[styles.icon, { width: 34, height: 34, backgroundColor: colors.lavender, borderRadius: 10 }]}>
                <Icon name={r.source === "cancellation" ? "event-busy" : "replay"} size={18} color={colors.lavenderText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>
                  {formatDate(r.date)} · received by {trip.short(r.receivedBy)}
                </Text>
                <Text style={type.caption}>{r.reason ?? (r.source === "cancellation" ? "Cancellation refund" : "Refund")}</Text>
              </View>
              <Money paise={r.amountPaise} style={{ color: colors.lavenderText }} />
              {r.source === "manual" ? <Button label="Remove" variant="ghost" small onPress={() => onDeleteRefund(r.id, r.amountPaise)} accessibilityLabel={`Remove refund of ${formatMoney(r.amountPaise)}`} /> : null}
            </View>
          ))}
        </Card>
      )}

      <View style={styles.actions}>
        {remaining > 0 && !cancelled ? <Button label="Record refund" icon="replay" variant="secondary" onPress={() => router.push({ pathname: "/expense/refund", params: { expenseId: expense.id } })} /> : null}
        {!cancelled ? <Button label="Cancel booking" icon="event-busy" variant="ghost" onPress={() => router.push({ pathname: "/expense/cancel", params: { expenseId: expense.id } })} /> : null}
        <Button label="Delete" icon="delete-outline" variant="ghost" onPress={onDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  kv: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  payer: { flexDirection: "row", alignItems: "center", gap: 8 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  trace: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 10, marginVertical: 8 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
