import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button, Card, Chip, EmptyState, Icon, Money, Notice, Screen, Tappable, type IconName } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { formatRelative } from "@/lib/dates";
import { buildNameLookup, describeEvent, type Described } from "@/lib/ledger/describe";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

type Filter = "all" | Described["kind"];

const toneColors: Record<Described["tone"], { bg: string; fg: string }> = {
  blue: { bg: colors.blueSoft, fg: colors.blue },
  mint: { bg: colors.mint, fg: colors.mintText },
  coral: { bg: colors.coral, fg: colors.coralText },
  amber: { bg: colors.amber, fg: colors.amberText },
  grey: { bg: "#EEF1F6", fg: colors.ink2 },
  lavender: { bg: colors.lavender, fg: colors.lavenderText },
};

export default function ActivityScreen() {
  const router = useRouter();
  const trip = useTrip();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    if (!trip) return [];
    const names = buildNameLookup(trip.events, trip.viewerId);
    const settlements = new Map(trip.state.settlements.map((s) => [s.id, s]));
    return [...trip.events]
      .reverse()
      .map((e) => ({ e, d: describeEvent(e, names, { settlements }) }))
      .filter(({ d }) => filter === "all" || d.kind === filter);
  }, [trip, filter]);

  if (!trip) {
    return (
      <Screen title="Activity" back tabs>
        <EmptyState icon="history" title="No trip selected" message="Create a trip first." action={<Button label="Create a trip" onPress={() => router.push("/trips/new")} />} />
      </Screen>
    );
  }

  return (
    <Screen title="Activity" subtitle={`${trip.events.length} events · every balance traces back here`} back tabs>
      <Notice icon="verified-user" tone="mint" title="Append-only ledger">
        Nothing here is ever edited or deleted. Balances are recomputed by replaying these events, so the current numbers can always be explained — and reconcile to {formatMoney(trip.ledger.reconciliationPaise)}.
      </Notice>

      <View style={styles.filters} accessibilityRole="tablist">
        {(
          [
            ["all", "All"],
            ["itinerary", "Plan"],
            ["expense", "Expenses"],
            ["refund", "Refunds"],
            ["settlement", "Payments"],
            ["member", "Members"],
            ["funding", "Kitty"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />
        ))}
      </View>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon="history" title="Nothing yet" message="Events appear here as the trip changes." />
        </Card>
      ) : (
        <View style={styles.timeline}>
          {rows.map(({ e, d }, i) => {
            const tone = toneColors[d.tone];
            const body = (
              <>
                <View style={styles.rail}>
                  <View style={[styles.railIcon, { backgroundColor: tone.bg }]}>
                    <Icon name={d.icon as IconName} size={17} color={tone.fg} />
                  </View>
                  {i < rows.length - 1 ? <View style={styles.railLine} /> : null}
                </View>
                <View style={styles.eventBody}>
                  <View style={styles.eventTitleRow}>
                    <Text style={[type.body, { fontWeight: "700", flex: 1 }]}>{d.title}</Text>
                    {d.amountPaise !== undefined ? <Money paise={d.amountPaise} style={{ fontSize: 14 }} /> : null}
                  </View>
                  <Text style={type.small}>{d.detail}</Text>
                  {d.changes?.length ? (
                    <View style={styles.changes}>
                      {d.changes.map((c) => (
                        <View key={c.label} style={styles.changeRow}>
                          <Text style={[type.caption, { width: 70, fontWeight: "700" }]}>{c.label}</Text>
                          <Text style={[type.caption, styles.strike]} numberOfLines={2}>
                            {c.before}
                          </Text>
                          <Icon name="arrow-forward" size={12} color={colors.faint} />
                          <Text style={[type.caption, { color: colors.ink, flex: 1 }]} numberOfLines={2}>
                            {c.after}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[type.caption, { marginTop: 4 }]}>
                    {formatRelative(e.ts)} · by {trip.name(e.actor)}
                  </Text>
                </View>
              </>
            );
            const target = d.expenseId && trip.state.expenses.some((x) => x.id === d.expenseId) ? d.expenseId : d.participantId && trip.participant(d.participantId) ? null : null;
            return d.expenseId && target ? (
              <Tappable key={e.id} onPress={() => router.push({ pathname: "/expense/[id]", params: { id: target } })} style={styles.eventRow} label={`Open ${d.title}`}>
                {body}
              </Tappable>
            ) : (
              <View key={e.id} style={styles.eventRow}>
                {body}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  timeline: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingTop: 6 },
  eventRow: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 36 },
  railIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 10 },
  railLine: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 6 },
  eventBody: { flex: 1, paddingVertical: 12, minWidth: 0, gap: 2 },
  eventTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  changes: { marginTop: 6, gap: 4, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 8 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  strike: { textDecorationLine: "line-through", maxWidth: 120 },
});
