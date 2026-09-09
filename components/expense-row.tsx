import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AvatarStack, Icon, Money, Pill, Tappable, type IconName } from "@/components/kit";
import { categoryTone, colors, radius, type } from "@/constants/design";
import { formatDate } from "@/lib/dates";
import type { ExpenseComputed } from "@/lib/ledger/engine";
import type { TripCtx } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

export function ExpenseRow({ item, trip, compact }: { item: ExpenseComputed; trip: TripCtx; compact?: boolean }) {
  const router = useRouter();
  const { expense } = item;
  const tone = categoryTone[expense.category] ?? categoryTone.Other;
  const cancelled = expense.status === "cancelled";
  const yourShare = trip.viewerId ? (item.shares[trip.viewerId] ?? 0) : 0;
  const youPaid = trip.viewerId ? (item.netPaidByPayer[trip.viewerId] ?? 0) : 0;
  const participating = trip.viewerId ? expense.participants.some((p) => p.participantId === trip.viewerId) : false;
  const payers = expense.payers.map((p) => trip.short(p.participantId)).join(" & ");

  return (
    <Tappable onPress={() => router.push({ pathname: "/expense/[id]", params: { id: expense.id } })} style={[styles.row, cancelled && styles.rowCancelled]} label={`${expense.title}, ${formatMoney(item.effectivePaise)}`}>
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Icon name={tone.icon as IconName} size={20} color={tone.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text style={[type.body, { fontWeight: "700", flex: 1 }, cancelled && styles.strike]} numberOfLines={1}>
            {expense.title}
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Money paise={item.effectivePaise} style={cancelled ? { color: colors.muted } : undefined} />
            {item.refundedPaise > 0 ? <Text style={[type.caption, styles.strike]}>{formatMoney(expense.amountPaise)}</Text> : null}
          </View>
        </View>
        <Text style={type.small} numberOfLines={1}>
          {formatDate(expense.date)} · paid by {payers}
          {expense.vendor && !compact ? ` · ${expense.vendor}` : ""}
        </Text>
        <View style={styles.metaRow}>
          <AvatarStack names={expense.participants.map((p) => trip.fullName(p.participantId))} size={22} max={5} />
          <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
            {expense.participants.length} {expense.participants.length === 1 ? "person" : "people"}
            {expense.splitMode !== "equal" ? ` · ${expense.splitMode}` : ""}
          </Text>
          {cancelled ? (
            <Pill label="Cancelled" tone="coral" small />
          ) : item.refundedPaise > 0 ? (
            <Pill label={`${formatMoney(item.refundedPaise)} refunded`} tone="lavender" small />
          ) : participating ? (
            <Text style={[type.caption, { color: colors.ink2, fontWeight: "700" }]}>your share {formatMoney(yourShare)}</Text>
          ) : youPaid > 0 ? (
            <Text style={[type.caption, { color: colors.mintText, fontWeight: "700" }]}>you paid, not sharing</Text>
          ) : (
            <Text style={type.caption}>not sharing</Text>
          )}
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={colors.faint} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  rowCancelled: { backgroundColor: colors.cardAlt },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: colors.muted },
});
