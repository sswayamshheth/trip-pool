import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Stat, Tappable } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

/**
 * What the group owes vendors — a different relationship from what members
 * owe each other, and deliberately kept apart from the settlement figures.
 */
export default function VendorsScreen() {
  const router = useRouter();
  const trip = useTrip();

  if (!trip) {
    return (
      <Screen title="Vendors" back>
        <EmptyState icon="storefront" title="No trip open" />
      </Screen>
    );
  }

  const { ledger, budget } = trip;
  const lines = ledger.vendors;
  const outstanding = budget.vendorOutstandingPaise;

  return (
    <Screen title="Vendor ledger" subtitle={`${lines.length} vendor${lines.length === 1 ? "" : "s"} · ${formatMoney(outstanding)} still to pay`} back>
      <Notice tone="blue" icon="alt-route" title="Two different ledgers">
        What the group owes a hotel is not the same thing as what Priya owes Rohit. This screen is the first one; the Settle tab is the second.
      </Notice>

      <View style={styles.stats}>
        <Stat label="Committed" value={formatMoney(lines.reduce((s, l) => s + l.committedPaise, 0))} sub="agreed with vendors" />
        <Stat label="Paid" value={formatMoney(lines.reduce((s, l) => s + l.paidPaise, 0))} sub="money already handed over" tone="mint" />
        <Stat label="Outstanding" value={formatMoney(outstanding)} sub={outstanding ? "the group still owes this" : "nothing pending"} tone={outstanding ? "amber" : undefined} />
      </View>

      <SectionTitle title="By vendor" count={lines.length} />
      {lines.length === 0 ? (
        <Card>
          <EmptyState icon="storefront" title="No vendors yet" message="Add a vendor to an itinerary item or an expense and it shows up here." />
        </Card>
      ) : (
        lines.map((line) => {
          const items = line.itemIds.map((id) => budget.byItemId[id]).filter(Boolean);
          const settled = line.outstandingPaise === 0;
          return (
            <Card key={line.vendor} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={[styles.icon, { backgroundColor: settled ? colors.mint : colors.amber }]}>
                  <Icon name="storefront" size={20} color={settled ? colors.mintText : colors.amberText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                    {line.vendor}
                  </Text>
                  <Text style={type.caption}>
                    {formatMoney(line.paidPaise)} paid of {formatMoney(line.committedPaise)} committed
                  </Text>
                </View>
                {settled ? <Pill label="Settled" tone="mint" small icon="check" /> : <Pill label={`${formatMoney(line.outstandingPaise)} due`} tone="amber" small />}
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${line.committedPaise > 0 ? Math.max(2, Math.min(100, (line.paidPaise / line.committedPaise) * 100)) : 0}%` }]} />
              </View>
              {items.map((b) => (
                <Tappable key={b.item.id} onPress={() => router.push({ pathname: "/itinerary/form", params: { id: b.item.id } })} label={`Open ${b.item.title}`} style={styles.itemRow}>
                  <Text style={[type.small, { flex: 1 }]} numberOfLines={1}>
                    {b.item.title}
                  </Text>
                  <Text style={type.caption}>{b.paidPaise > 0 ? `${formatMoney(b.paidPaise)} paid` : "unpaid"}</Text>
                  <Money paise={b.committedPaise} style={{ fontSize: 13 }} />
                  <Icon name="chevron-right" size={16} color={colors.faint} />
                </Tappable>
              ))}
            </Card>
          );
        })
      )}

      {outstanding > 0 ? (
        <Notice tone="amber" icon="schedule" title="Still to pay">
          {`${formatMoney(outstanding)} across ${lines.filter((l) => l.outstandingPaise > 0).length} vendor${lines.filter((l) => l.outstandingPaise > 0).length === 1 ? "" : "s"}. Record a payment against an itinerary item and both this and the members' balances update.`}
        </Notice>
      ) : null}

      <Button label="Back to the plan" icon="event-note" variant="ghost" onPress={() => router.push("/(trip)/itinerary")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.mintStrong },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.line },
});
