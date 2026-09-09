import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { AvatarStack, Button, Card, EmptyState, Icon, Money, Pill, Screen, Tappable, TextField, type IconName } from "@/components/kit";
import { colors, layout, radius, shadow, space, type } from "@/constants/design";
import { formatDateRange, formatRelative } from "@/lib/dates";
import { buildNameLookup, describeEvent } from "@/lib/ledger/describe";
import { useStore, type TripSummary } from "@/lib/ledger/store";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

/**
 * Home: the list of trip groups. Tap one to open it. This is the only place
 * a trip is chosen — every screen inside a trip works on the open one.
 */
export default function TripsHomeScreen() {
  const router = useRouter();
  const store = useStore();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = store.trips.map((t) => {
      const last = t.events[t.events.length - 1];
      const names = buildNameLookup(t.events, t.viewerId);
      const settlements = new Map(t.state.settlements.map((s) => [s.id, s]));
      return { trip: t, last, described: last ? describeEvent(last, names, { settlements }) : undefined };
    });
    if (!q) return list;
    return list.filter(
      ({ trip }) =>
        trip.state.trip.name.toLowerCase().includes(q) ||
        trip.state.trip.destination.toLowerCase().includes(q) ||
        trip.state.participants.some((p) => p.name.toLowerCase().includes(q)),
    );
  }, [store.trips, query]);

  const open = (trip: TripSummary) => {
    store.switchTrip(trip.id);
    router.push("/(trip)/overview");
  };

  const totalOwedToYou = store.trips.reduce((sum, t) => {
    const me = t.viewerId ? t.ledger.balances[t.viewerId] : null;
    return sum + (me && me.netPaise > 0 ? me.netPaise : 0);
  }, 0);
  const totalYouOwe = store.trips.reduce((sum, t) => {
    const me = t.viewerId ? t.ledger.balances[t.viewerId] : null;
    return sum + (me && me.netPaise < 0 ? -me.netPaise : 0);
  }, 0);

  return (
    <Screen
      title="Your trips"
      subtitle={store.trips.length ? `${store.trips.length} group${store.trips.length === 1 ? "" : "s"}` : "Start with your first group"}
      tabs
      right={
        <View style={{ flexDirection: "row", gap: 2 }}>
          <Pressable
            onPress={() => {
              setSearching((s) => !s);
              if (searching) setQuery("");
            }}
            accessibilityRole="button"
            accessibilityLabel={searching ? "Close search" : "Search trips"}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Icon name={searching ? "close" : "search"} size={21} />
          </Pressable>
        </View>
      }
    >
      {searching ? <TextField label="Search" value={query} onChangeText={setQuery} placeholder="Trip, destination or member" autoFocus /> : null}

      {store.trips.length > 0 && !searching ? (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.mint }]}>
            <Text style={type.label}>You get back</Text>
            <Text style={[type.money, { fontSize: 19, color: colors.mintText }]}>{formatMoneyCompact(totalOwedToYou)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.coral }]}>
            <Text style={type.label}>You owe</Text>
            <Text style={[type.money, { fontSize: 19, color: colors.coralText }]}>{formatMoneyCompact(totalYouOwe)}</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.blueSoft }]}>
            <Text style={type.label}>Across</Text>
            <Text style={[type.money, { fontSize: 19, color: colors.blueText }]}>
              {store.trips.length} trip{store.trips.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Card>
          {query ? (
            <EmptyState icon="search-off" title="No match" message={`Nothing matches "${query.trim()}".`} />
          ) : (
            <EmptyState
              icon="groups"
              title="No trips yet"
              message="Create a group, add the itinerary, and the budget, shares and settlements follow from it."
              action={
                <View style={{ gap: 8, alignItems: "center" }}>
                  <Button label="Create a trip" icon="add" onPress={() => router.push("/trips/new")} />
                  <Button label="Load the Manali demo" variant="ghost" icon="bolt" onPress={() => store.resetDemo()} />
                </View>
              }
            />
          )}
        </Card>
      ) : (
        <View style={styles.list}>
          {rows.map(({ trip, last, described }) => {
            const me = trip.viewerId ? trip.ledger.balances[trip.viewerId] : null;
            const s = trip.state;
            const budget = trip.ledger.budget;
            const pendingForMe = trip.ledger.pendingSettlements.filter((x) => x.to === trip.viewerId).length;
            const closed = s.trip.status === "closed";
            return (
              <Tappable key={trip.id} onPress={() => open(trip)} label={`Open ${s.trip.name}`} style={styles.row}>
                <View style={[styles.mark, closed && { backgroundColor: colors.line }]}>
                  <Icon name={(closed ? "flag" : "landscape") as IconName} size={22} color={closed ? colors.muted : colors.blue} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={styles.titleRow}>
                    <Text style={[type.body, { fontWeight: "700", flex: 1 }]} numberOfLines={1}>
                      {s.trip.name}
                    </Text>
                    <Text style={type.caption}>{last ? formatRelative(last.ts) : ""}</Text>
                  </View>
                  <Text style={type.small} numberOfLines={1}>
                    {s.trip.destination} · {formatDateRange(s.trip.startDate, s.trip.endDate)}
                  </Text>
                  <View style={styles.metaRow}>
                    <AvatarStack names={s.participants.map((p) => p.name)} size={20} max={4} />
                    <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
                      {described ? described.title : `${s.participants.length} members`}
                    </Text>
                    {closed ? (
                      <Pill label="Closed" tone="grey" small />
                    ) : pendingForMe ? (
                      <Pill label={`${pendingForMe} to confirm`} tone="amber" small icon="schedule" />
                    ) : me && me.netPaise !== 0 ? (
                      <Money paise={me.netPaise} tone="auto" signed style={{ fontSize: 13 }} />
                    ) : (
                      <Pill label="Settled" tone="mint" small icon="check" />
                    )}
                  </View>
                  <View style={styles.budgetRow}>
                    <Text style={type.caption} numberOfLines={1}>
                      Planned {formatMoney(budget.estimatedPaise)} · spent {formatMoney(trip.ledger.totals.spendPaise)}
                    </Text>
                  </View>
                </View>
              </Tappable>
            );
          })}
        </View>
      )}

      {store.trips.length > 0 ? (
        <Button label="Load the Manali demo" variant="ghost" icon="bolt" small onPress={() => store.resetDemo()} style={{ alignSelf: "center", marginTop: 4 }} />
      ) : null}

      <Pressable
        onPress={() => router.push("/trips/new")}
        accessibilityRole="button"
        accessibilityLabel="Create a new trip"
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      >
        <Icon name="add" size={26} color={colors.white} />
        <Text style={styles.fabLabel}>New trip</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: layout.touchTarget, height: layout.touchTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, borderRadius: radius.md, padding: 10, gap: 2, minWidth: 96 },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: "hidden", ...shadow.card },
  row: { flexDirection: "row", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.line, alignItems: "flex-start" },
  mark: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  budgetRow: { marginTop: 1 },
  fab: {
    position: "absolute",
    right: space.xl,
    bottom: layout.tabBarHeight + 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    ...shadow.float,
    ...(Platform.OS === "web" ? { position: "fixed" as never } : null),
  },
  fabLabel: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
