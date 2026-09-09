import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ExpenseRow } from "@/components/expense-row";
import { Button, Card, Chip, EmptyState, Screen, Stat } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { formatDate } from "@/lib/dates";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

type Filter = "all" | "mine" | "refunded" | "cancelled";

export default function ExpensesScreen() {
  const router = useRouter();
  const trip = useTrip();
  const [filter, setFilter] = useState<Filter>("all");

  const groups = useMemo(() => {
    if (!trip) return [];
    const viewer = trip.viewerId;
    const items = trip.ledger.expenses.filter((c) => {
      if (filter === "mine") return viewer ? c.expense.participants.some((p) => p.participantId === viewer) || c.expense.payers.some((p) => p.participantId === viewer) : false;
      if (filter === "refunded") return c.refundedPaise > 0;
      if (filter === "cancelled") return c.expense.status === "cancelled";
      return true;
    });
    const byDate = new Map<string, typeof items>();
    for (const item of items) {
      const list = byDate.get(item.expense.date) ?? [];
      list.push(item);
      byDate.set(item.expense.date, list);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [trip, filter]);

  if (!trip) {
    return (
      <Screen title="Expenses" back tabs>
        <EmptyState icon="receipt-long" title="No trip selected" message="Create a trip first." action={<Button label="Create a trip" onPress={() => router.push("/trips/new")} />} />
      </Screen>
    );
  }

  const { ledger } = trip;
  const me = trip.viewerId ? ledger.balances[trip.viewerId] : null;

  return (
    <Screen
      title="Expenses"
      subtitle={`${ledger.expenses.length} recorded · ${formatMoney(ledger.totals.spendPaise)} after refunds`}
      tabs
      back
      right={<Button label="Add" accessibilityLabel="Add expense" icon="add" small onPress={() => router.push("/expense/form")} />}
    >
      <View style={styles.stats}>
        <Stat label="Trip spend" value={formatMoney(ledger.totals.spendPaise)} sub={ledger.totals.refundedPaise ? `${formatMoney(ledger.totals.grossPaise)} before refunds` : "no refunds yet"} />
        {me ? <Stat label="Your share" value={formatMoney(me.sharePaise)} sub={`you paid ${formatMoney(me.paidPaise - me.refundsReceivedPaise)}`} tone="blue" /> : null}
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {(
          [
            ["all", "All"],
            ["mine", "Mine"],
            ["refunded", "Refunded"],
            ["cancelled", "Cancelled"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />
        ))}
      </View>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt-long"
            title={filter === "all" ? "No expenses yet" : "Nothing here"}
            message={filter === "all" ? "Add a booking, pick who is part of it, and shares derive themselves." : "No expenses match this filter."}
            action={filter === "all" ? <Button label="Add expense" icon="add" onPress={() => router.push("/expense/form")} /> : undefined}
          />
        </Card>
      ) : (
        groups.map(([date, items]) => (
          <View key={date} style={{ gap: 8 }}>
            <Text style={[type.label, { marginTop: 6 }]}>{formatDate(date, { year: true })}</Text>
            {items.map((item) => (
              <ExpenseRow key={item.expense.id} item={item} trip={trip} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.line },
});
