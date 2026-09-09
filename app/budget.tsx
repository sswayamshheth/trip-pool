import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Money, Notice, Screen, SectionTitle, Stat } from "@/components/kit";
import { categoryTone, colors, type } from "@/constants/design";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

/** Planned vs actual, by category and by person. */
export default function BudgetScreen() {
  const router = useRouter();
  const trip = useTrip();

  if (!trip) {
    return (
      <Screen title="Budget" back>
        <EmptyState icon="pie-chart" title="No trip open" />
      </Screen>
    );
  }

  const { budget, ledger } = trip;
  const priced = budget.items.filter((b) => b.actualPaise !== undefined);

  return (
    <Screen title="Budget" subtitle={`${formatMoney(budget.estimatedPaise)} planned · ${formatMoney(budget.actualPaise)} spent so far`} back>
      <View style={styles.stats}>
        <Stat label="Estimated" value={formatMoney(budget.estimatedPaise)} sub={`${budget.items.length} itinerary items`} tone="blue" />
        <Stat label="Actual" value={formatMoney(budget.actualPaise)} sub={budget.refundedPaise ? `after ${formatMoney(budget.refundedPaise)} refunds` : "paid to vendors"} />
        <Stat
          label="Variance"
          value={formatMoney(Math.abs(budget.variancePaise))}
          sub={budget.variancePaise === 0 ? "on plan" : budget.variancePaise > 0 ? "over the estimate" : "under the estimate"}
          tone={budget.variancePaise > 0 ? "coral" : "mint"}
        />
        <Stat label="Still owed to vendors" value={formatMoney(budget.vendorOutstandingPaise)} sub="committed but not yet paid" tone={budget.vendorOutstandingPaise ? "amber" : undefined} />
      </View>

      <SectionTitle title="By category" />
      <Card style={{ gap: 14 }}>
        {budget.categories.length === 0 ? (
          <Text style={type.bodyMuted}>Nothing planned yet.</Text>
        ) : (
          budget.categories.map((c) => {
            const tone = categoryTone[c.category] ?? categoryTone.Other;
            const actualPct = c.estimatedPaise > 0 ? Math.min(1.4, c.actualPaise / c.estimatedPaise) : 0;
            return (
              <View key={c.category} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.dot, { backgroundColor: tone.fg }]} />
                  <Text style={[type.body, { flex: 1, fontWeight: "600" }]}>{c.category}</Text>
                  <Text style={type.caption}>{Math.round(c.fraction * 100)}% of plan</Text>
                  <Money paise={c.estimatedPaise} style={{ fontSize: 14 }} />
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(2, c.fraction * 100)}%`, backgroundColor: tone.bg }]} />
                  <View style={[styles.fillActual, { width: `${Math.max(0, Math.min(100, actualPct * c.fraction * 100))}%`, backgroundColor: tone.fg }]} />
                </View>
                <Text style={type.caption}>
                  {c.actualPaise > 0 ? `${formatMoney(c.actualPaise)} spent of ${formatMoney(c.estimatedPaise)} planned` : `nothing spent yet · ${c.count} item${c.count === 1 ? "" : "s"}`}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      <SectionTitle title="Estimated per person" />
      <Card style={{ gap: 4 }}>
        {trip.state.participants.map((p, i) => {
          const est = budget.estimatedPerParticipant[p.id] ?? 0;
          const actual = ledger.balances[p.id]?.sharePaise ?? 0;
          const diff = actual - est;
          return (
            <View key={p.id} style={[styles.personRow, i < trip.state.participants.length - 1 && styles.rowBorder]}>
              <Avatar name={p.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>{trip.isViewer(p.id) ? `${p.name} (you)` : p.name}</Text>
                <Text style={type.caption}>
                  estimate {formatMoney(est)} · actual share so far {formatMoney(actual)}
                </Text>
              </View>
              {actual > 0 ? (
                <View style={{ alignItems: "flex-end" }}>
                  <Money paise={diff} signed tone="auto" style={{ fontSize: 14 }} />
                  <Text style={type.caption}>vs estimate</Text>
                </View>
              ) : (
                <Money paise={est} style={{ fontSize: 14 }} />
              )}
            </View>
          );
        })}
        <Text style={[type.caption, { paddingVertical: 8 }]}>
          Estimates follow who is on each itinerary item, so they differ from a flat {formatMoney(budget.perPersonFlatPaise)} split. Together they add to {formatMoney(budget.estimatedPaise)}.
        </Text>
      </Card>

      <SectionTitle title="Planned vs actual" count={priced.length} />
      {priced.length === 0 ? (
        <Card>
          <Text style={type.bodyMuted}>Nothing has been paid against the itinerary yet. Once it is, each line shows how the real price compared with the estimate.</Text>
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          {priced.map((b, i) => (
            <View key={b.item.id} style={[styles.personRow, i < priced.length - 1 && styles.rowBorder]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "600" }]} numberOfLines={1}>
                  {b.item.title}
                </Text>
                <Text style={type.caption}>
                  planned {formatMoney(b.estimatedPaise)} · actual {formatMoney(b.actualPaise ?? 0)}
                  {b.refundedPaise ? ` · ${formatMoney(b.refundedPaise)} refunded` : ""}
                </Text>
              </View>
              <Money paise={b.variancePaise ?? 0} signed tone="auto" style={{ fontSize: 14 }} />
            </View>
          ))}
        </Card>
      )}

      {ledger.totals.discountPaise > 0 ? (
        <Notice tone="mint" icon="local-offer" title={`${formatMoney(ledger.totals.discountPaise)} saved with card offers`}>
          Part of why the actuals come in under the estimate. See the analyser for which card earned what.
        </Notice>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button label="Try a scenario" icon="tune" variant="secondary" onPress={() => router.push("/itinerary/whatif")} />
        <Button label="Vendor ledger" icon="storefront" variant="ghost" onPress={() => router.push("/vendors")} />
        <Button label="Savings analyser" icon="insights" variant="ghost" onPress={() => router.push("/analyser")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, height: 8, borderRadius: 4 },
  fillActual: { height: 8, borderRadius: 4 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
