import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Money, Notice, Pill, Screen, SectionTitle, Stat } from "@/components/kit";
import { colors, space, type } from "@/constants/design";
import { useFeedback, useGuarded } from "@/lib/feedback";
import { closeTrip, reopenTrip } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import { analysePayments } from "@/lib/ledger/offers";
import { formatMoney, sumPaise } from "@/lib/money";

/** The end-of-trip statement: planned vs actual, what's left, and closing it out. */
export default function CloseTripScreen() {
  const router = useRouter();
  const trip = useTrip();
  const guarded = useGuarded();
  const { confirm } = useFeedback();

  if (!trip) {
    return (
      <Screen title="Close trip" back>
        <EmptyState icon="flag" title="No trip open" />
      </Screen>
    );
  }

  const { budget, ledger, state } = trip;
  const analysis = analysePayments(state);
  const owed = sumPaise(Object.values(ledger.balances).map((b) => b.netPaise).filter((n) => n > 0));
  const remainingTransfers = ledger.transfers.length + ledger.pendingSettlements.length;
  const closed = trip.isClosed;

  const onClose = async () => {
    const ok = await confirm({
      title: `Close "${state.trip.name}"?`,
      message: remainingTransfers
        ? `${remainingTransfers} payment${remainingTransfers === 1 ? "" : "s"} still outstanding. Closing keeps the balances on record but stops new expenses being added.`
        : "Everyone is settled. Closing stops new expenses being added; you can reopen it later.",
      confirmLabel: "Close trip",
      destructive: remainingTransfers > 0,
    });
    if (ok) guarded(() => trip.append(closeTrip(state, { actor: trip.actor })), "Trip closed");
  };

  return (
    <Screen title={closed ? "Trip statement" : "Close the trip"} subtitle={state.trip.name} back>
      {closed ? (
        <Notice tone="mint" icon="flag" title="This trip is closed">
          The ledger is frozen. Reopen it if something still needs recording.
        </Notice>
      ) : null}

      <Card tone="ink" style={{ gap: 14, padding: space.xl }}>
        <View>
          <Text style={[type.label, { color: "#91B8EE" }]}>Actually spent</Text>
          <Text style={styles.big}>{formatMoney(ledger.totals.spendPaise)}</Text>
          <Text style={styles.meta}>
            against {formatMoney(budget.estimatedPaise)} planned ·{" "}
            {budget.variancePaise === 0 ? "exactly on plan" : budget.variancePaise > 0 ? `${formatMoney(budget.variancePaise)} over` : `${formatMoney(-budget.variancePaise)} under`}
          </Text>
        </View>
        <View style={styles.split}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Refunded</Text>
            <Text style={styles.value}>{formatMoney(ledger.totals.refundedPaise)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Card savings</Text>
            <Text style={styles.value}>{formatMoney(analysis.capturedPaise)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>To settle</Text>
            <Text style={styles.value}>{formatMoney(owed)}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.stats}>
        <Stat label="Planned" value={formatMoney(budget.estimatedPaise)} sub={`${budget.items.length} itinerary items`} tone="blue" />
        <Stat label="Paid to vendors" value={formatMoney(budget.paidPaise)} sub={budget.vendorOutstandingPaise ? `${formatMoney(budget.vendorOutstandingPaise)} still owed` : "all vendors settled"} />
        <Stat label="Between members" value={formatMoney(sumPaise(ledger.confirmedSettlements.map((s) => s.amountPaise)))} sub={`${ledger.confirmedSettlements.length} confirmed payments`} tone="mint" />
      </View>

      <SectionTitle title="Final member positions" />
      <Card style={{ gap: 4 }}>
        {state.participants.map((p, i) => {
          const b = ledger.balances[p.id];
          return (
            <View key={p.id} style={[styles.row, i < state.participants.length - 1 && styles.rowBorder]}>
              <Avatar name={p.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>{trip.isViewer(p.id) ? `${p.name} (you)` : p.name}</Text>
                <Text style={type.caption}>
                  paid {formatMoney(b.paidPaise - b.refundsReceivedPaise)} · share {formatMoney(b.sharePaise)}
                  {b.contributedPaise ? ` · kitty ${formatMoney(b.contributedPaise)}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Money paise={b.netPaise} tone="auto" signed />
                <Pill label={b.netPaise > 0 ? "gets back" : b.netPaise < 0 ? "owes" : "settled"} tone={b.netPaise > 0 ? "mint" : b.netPaise < 0 ? "coral" : "grey"} small />
              </View>
            </View>
          );
        })}
        <Text style={[type.caption, { paddingVertical: 8 }]}>Positions add to {formatMoney(ledger.reconciliationPaise)} — every rupee accounted for.</Text>
      </Card>

      {ledger.transfers.length ? (
        <>
          <SectionTitle title="Left to settle" count={ledger.transfers.length} />
          <Card style={{ gap: 8 }}>
            {ledger.transfers.map((t) => (
              <View key={`${t.from}-${t.to}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[type.body, { flex: 1 }]}>
                  {trip.short(t.from)} → {trip.short(t.to)}
                </Text>
                <Money paise={t.amountPaise} style={{ fontSize: 14 }} />
              </View>
            ))}
            <Button label="Go and settle" icon="swap-horiz" small variant="secondary" onPress={() => router.push("/(trip)/settle")} />
          </Card>
        </>
      ) : (
        <Notice tone="mint" icon="check-circle" title="Everyone is square">
          No transfers left. The trip can be closed cleanly.
        </Notice>
      )}

      {budget.vendorOutstandingPaise > 0 ? (
        <Notice tone="amber" icon="storefront" title={`${formatMoney(budget.vendorOutstandingPaise)} still owed to vendors`}>
          Closing the trip won&apos;t clear this — it&apos;s money the group owes outside the group.
        </Notice>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {closed ? (
          <Button label="Reopen trip" icon="lock-open" variant="secondary" onPress={() => guarded(() => trip.append(reopenTrip(state, { actor: trip.actor })), "Trip reopened")} />
        ) : (
          <Button label="Close trip & freeze the ledger" icon="flag" variant={remainingTransfers ? "ghost" : "primary"} onPress={onClose} />
        )}
        <Button label="Full audit trail" icon="history" variant="ghost" onPress={() => router.push("/(trip)/activity")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { color: colors.white, fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -1, marginTop: 4, fontVariant: ["tabular-nums"] },
  meta: { color: "#B6C6DA", fontSize: 12, marginTop: 3 },
  value: { color: colors.white, fontSize: 17, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  split: { flexDirection: "row", gap: 12, borderTopWidth: 1, borderTopColor: "#2D4668", paddingTop: 14 },
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
