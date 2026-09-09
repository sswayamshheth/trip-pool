import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AvatarStack, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Tappable, type IconName } from "@/components/kit";
import { categoryTone, colors, radius, space, type } from "@/constants/design";
import { formatDate, formatRelative } from "@/lib/dates";
import type { ItemBudget } from "@/lib/ledger/budget";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

/**
 * The plan: what the trip is expected to cost, and every line behind it.
 * Estimates come from the itinerary; actuals come from the expenses linked
 * to each item. Editing anything here moves the budget immediately.
 */
export default function ItineraryScreen() {
  const router = useRouter();
  const trip = useTrip();

  const groups = useMemo(() => {
    if (!trip) return [];
    const byDate = new Map<string, ItemBudget[]>();
    for (const b of trip.budget.items) {
      const list = byDate.get(b.item.date) ?? [];
      list.push(b);
      byDate.set(b.item.date, list);
    }
    return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [trip]);

  const lastChange = useMemo(() => {
    if (!trip) return null;
    for (let i = trip.events.length - 1; i >= 0; i--) {
      const e = trip.events[i];
      if (e.type === "ITINERARY_ITEM_UPDATED") {
        const delta = e.after.estimatedPaise - e.before.estimatedPaise;
        if (delta !== 0) return { ts: e.ts, title: e.after.title, delta, before: e.before.estimatedPaise, after: e.after.estimatedPaise };
      }
      if (e.type === "ITINERARY_ITEM_ADDED") return { ts: e.ts, title: e.item.title, delta: e.item.estimatedPaise, before: 0, after: e.item.estimatedPaise };
      if (e.type === "ITINERARY_ITEM_REMOVED") return { ts: e.ts, title: e.item.title, delta: -e.item.estimatedPaise, before: e.item.estimatedPaise, after: 0 };
    }
    return null;
  }, [trip]);

  if (!trip) {
    return (
      <Screen title="Plan" tabs>
        <EmptyState icon="event-note" title="No trip open" action={<Button label="Back to trips" onPress={() => router.replace("/(home)/trips")} />} />
      </Screen>
    );
  }

  const { budget, viewerId } = trip;
  const myEstimate = viewerId ? (budget.estimatedPerParticipant[viewerId] ?? 0) : 0;
  const spentPct = budget.estimatedPaise > 0 ? Math.min(1, budget.actualPaise / budget.estimatedPaise) : 0;

  return (
    <Screen
      title="Plan & budget"
      subtitle={`${budget.items.length} item${budget.items.length === 1 ? "" : "s"} · ${formatMoney(budget.estimatedPaise)} estimated`}
      back
      tabs
      right={<Button label="Add" accessibilityLabel="Add itinerary item" icon="add" small onPress={() => router.push("/itinerary/form")} />}
    >
      <Card tone="ink" style={{ gap: 14, padding: space.xl }}>
        <View>
          <Text style={[type.label, { color: "#91B8EE" }]}>Estimated trip cost</Text>
          <Text style={styles.bigNumber}>{formatMoney(budget.estimatedPaise)}</Text>
          <Text style={styles.heroMeta}>
            {budget.plannedCount} planned · {budget.bookedCount} booked
            {budget.cancelledCount ? ` · ${budget.cancelledCount} cancelled` : ""}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(1, spentPct * 100)}%` }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.heroMeta}>{formatMoney(budget.actualPaise)} actually spent</Text>
            <Text style={styles.heroMeta}>
              {budget.variancePaise === 0 ? "on plan" : budget.variancePaise > 0 ? `${formatMoney(budget.variancePaise)} over` : `${formatMoney(-budget.variancePaise)} under`}
            </Text>
          </View>
        </View>
        <View style={styles.heroSplit}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Your estimate</Text>
            <Text style={styles.heroValue}>{formatMoney(myEstimate)}</Text>
            <Text style={styles.heroMeta}>from the items you&apos;re on</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Flat per person</Text>
            <Text style={styles.heroValue}>{formatMoney(budget.perPersonFlatPaise)}</Text>
            <Text style={styles.heroMeta}>if everything were shared equally</Text>
          </View>
        </View>
      </Card>

      {lastChange ? (
        <Notice tone={lastChange.delta > 0 ? "amber" : "mint"} icon={lastChange.delta > 0 ? "trending-up" : "trending-down"} title="What changed in your budget">
          {`${lastChange.title}: ${formatMoney(lastChange.before)} → ${formatMoney(lastChange.after)} (${lastChange.delta > 0 ? "+" : "−"}${formatMoney(Math.abs(lastChange.delta))}) · ${formatRelative(lastChange.ts)}. Trip estimate is now ${formatMoney(budget.estimatedPaise)}, about ${formatMoney(budget.perPersonFlatPaise)} each.`}
        </Notice>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Button label="What if…" icon="tune" variant="secondary" small onPress={() => router.push("/itinerary/whatif")} />
        <Button label="Budget detail" icon="pie-chart" variant="ghost" small onPress={() => router.push("/budget")} />
        <Button label="Vendors" icon="storefront" variant="ghost" small onPress={() => router.push("/vendors")} />
      </View>

      {budget.categories.length ? (
        <>
          <SectionTitle title="Where the money goes" action="Detail" onAction={() => router.push("/budget")} />
          <Card style={{ gap: 12 }}>
            {budget.categories.map((c) => {
              const tone = categoryTone[c.category] ?? categoryTone.Other;
              return (
                <View key={c.category} style={{ gap: 5 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.dot, { backgroundColor: tone.fg }]} />
                    <Text style={[type.body, { flex: 1 }]}>{c.category}</Text>
                    <Text style={type.caption}>{Math.round(c.fraction * 100)}%</Text>
                    <Money paise={c.estimatedPaise} style={{ fontSize: 14 }} />
                  </View>
                  <View style={styles.trackLight}>
                    <View style={[styles.fillLight, { width: `${Math.max(2, c.fraction * 100)}%`, backgroundColor: tone.fg }]} />
                  </View>
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Itinerary" count={budget.items.length} />
      {budget.items.length === 0 ? (
        <Card>
          <EmptyState
            icon="event-note"
            title="Nothing planned yet"
            message="Add flights, stays and activities. Each one carries an estimate and who it's for — that's what the budget is built from."
            action={<Button label="Add the first item" icon="add" onPress={() => router.push("/itinerary/form")} />}
          />
        </Card>
      ) : (
        groups.map(([date, list]) => (
          <View key={date} style={{ gap: 8 }}>
            <Text style={[type.label, { marginTop: 6 }]}>{formatDate(date, { year: true })}</Text>
            {list.map((b) => (
              <ItemRow key={b.item.id} b={b} trip={trip} />
            ))}
          </View>
        ))
      )}

      {budget.unplannedPaise > 0 ? (
        <Notice tone="grey" icon="receipt-long" title="Spending outside the plan">
          {`${formatMoney(budget.unplannedPaise)} of expenses aren't tied to an itinerary item — meals and extras picked up along the way. They're in the ledger and in everyone's balance, just not in the estimate above.`}
        </Notice>
      ) : null}
    </Screen>
  );
}

function ItemRow({ b, trip }: { b: ItemBudget; trip: NonNullable<ReturnType<typeof useTrip>> }) {
  const router = useRouter();
  const { item } = b;
  const tone = categoryTone[item.category] ?? categoryTone.Other;
  const cancelled = item.status === "cancelled";
  const mine = trip.viewerId ? item.participantIds.includes(trip.viewerId) : false;
  const myShare = trip.viewerId ? (b.estimatedShares[trip.viewerId] ?? 0) : 0;

  return (
    <Tappable onPress={() => router.push({ pathname: "/itinerary/form", params: { id: item.id } })} label={`Edit ${item.title}`} style={[styles.row, cancelled && { backgroundColor: colors.cardAlt }]}>
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Icon name={tone.icon as IconName} size={20} color={tone.fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Text style={[type.body, { fontWeight: "700", flex: 1 }, cancelled && styles.strike]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={{ alignItems: "flex-end" }}>
            <Money paise={b.estimatedPaise} style={cancelled ? { color: colors.muted } : undefined} />
            {b.actualPaise !== undefined && b.actualPaise !== b.estimatedPaise ? (
              <Text style={[type.caption, { color: b.variancePaise! > 0 ? colors.coralText : colors.mintText, fontWeight: "700" }]}>
                actual {formatMoney(b.actualPaise)}
              </Text>
            ) : null}
          </View>
        </View>
        <Text style={type.small} numberOfLines={1}>
          {item.time ? `${item.time} · ` : ""}
          {item.vendor ?? item.category}
          {b.nights ? ` · ${b.nights} night${b.nights === 1 ? "" : "s"}` : ""}
        </Text>
        <View style={styles.metaRow}>
          <AvatarStack names={item.participantIds.map((id) => trip.fullName(id))} size={20} max={5} />
          <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
            {mine ? `your share ${formatMoney(myShare)}` : `${item.participantIds.length} ${item.participantIds.length === 1 ? "person" : "people"} · not you`}
          </Text>
          {cancelled ? (
            <Pill label="Cancelled" tone="coral" small />
          ) : b.paidPaise > 0 && b.vendorOutstandingPaise === 0 ? (
            <Pill label="Paid" tone="mint" small icon="check" />
          ) : b.paidPaise > 0 ? (
            <Pill label={`${formatMoney(b.vendorOutstandingPaise)} due`} tone="amber" small />
          ) : (
            <Pill label="Planned" tone="blue" small />
          )}
        </View>
      </View>
      <Icon name="chevron-right" size={20} color={colors.faint} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  bigNumber: { color: colors.white, fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -1, marginTop: 4, fontVariant: ["tabular-nums"] },
  heroValue: { color: colors.white, fontSize: 18, lineHeight: 24, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  heroMeta: { color: "#B6C6DA", fontSize: 12, marginTop: 3 },
  heroSplit: { flexDirection: "row", gap: 16, borderTopWidth: 1, borderTopColor: "#2D4668", paddingTop: space.lg },
  track: { height: 7, borderRadius: 4, backgroundColor: "#27456D", overflow: "hidden" },
  fill: { height: 7, borderRadius: 4, backgroundColor: "#7FE3B6" },
  trackLight: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  fillLight: { height: 6, borderRadius: 3 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.line },
  icon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  strike: { textDecorationLine: "line-through", color: colors.muted },
});
