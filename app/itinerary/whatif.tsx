import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Icon, Money, Notice, Screen, SectionTitle, Stepper, TextField } from "@/components/kit";
import { colors, space, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { applyScenario, diffBudget, type Scenario } from "@/lib/ledger/budget";
import { CommandError, removeItineraryItem, updateItineraryItem } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney, parseAmount } from "@/lib/money";

/**
 * Try changes before committing to them. The scenario is applied to a copy of
 * the trip state, the budget is recomputed from that copy, and the difference
 * is shown line by line. Nothing is written until "Apply".
 */
export default function WhatIfScreen() {
  const router = useRouter();
  const trip = useTrip();
  const { toast, confirm } = useFeedback();

  const [removed, setRemoved] = useState<string[]>([]);
  const [without, setWithout] = useState<string[]>([]);
  const [extraNights, setExtraNights] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const scenario: Scenario = useMemo(() => {
    const estimates: Record<string, number> = {};
    for (const [id, value] of Object.entries(overrides)) {
      const parsed = parseAmount(value);
      if (parsed.paise !== undefined) estimates[id] = parsed.paise;
    }
    return { removed, withoutParticipants: without, extraNights: extraNights || undefined, estimates };
  }, [removed, without, extraNights, overrides]);

  const diff = useMemo(() => (trip ? diffBudget(trip.state, applyScenario(trip.state, scenario)) : null), [trip, scenario]);

  const touched = removed.length > 0 || without.length > 0 || extraNights > 0 || Object.keys(overrides).some((k) => overrides[k].trim() !== "");

  const apply = useOnce(async () => {
    if (!trip || !diff) return;
    const ok = await confirm({
      title: "Apply this scenario?",
      message: `The trip estimate moves from ${formatMoney(diff.beforePaise)} to ${formatMoney(diff.afterPaise)}. Removing people from items is not applied — do that on each item.`,
      confirmLabel: "Apply changes",
    });
    if (!ok) return;
    try {
      const events = [];
      for (const id of removed) {
        const item = trip.state.itinerary.find((i) => i.id === id);
        if (item) events.push(removeItineraryItem(trip.state, id, { actor: trip.actor }));
      }
      for (const [id, value] of Object.entries(overrides)) {
        const parsed = parseAmount(value);
        const item = trip.state.itinerary.find((i) => i.id === id);
        if (!item || parsed.paise === undefined || parsed.paise === item.estimatedPaise) continue;
        events.push(
          updateItineraryItem(
            trip.state,
            id,
            {
              title: item.title,
              category: item.category,
              date: item.date,
              endDate: item.endDate,
              time: item.time,
              location: item.location,
              vendor: item.vendor,
              estimatedPaise: parsed.paise,
              actualPaise: item.actualPaise,
              participantIds: item.participantIds,
              weights: item.weights,
              notes: item.notes,
              cancellationPolicy: item.cancellationPolicy,
              status: item.status,
            },
            { actor: trip.actor },
          ),
        );
      }
      if (events.length === 0) {
        toast("Nothing in this scenario changes a saved item", "info");
        return;
      }
      trip.append(events);
      toast(`Applied · estimate now ${formatMoney(diff.afterPaise)}`, "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not apply the scenario", "error");
    }
  });

  if (!trip) {
    return (
      <Screen title="What if…" back>
        <EmptyState icon="tune" title="No trip open" />
      </Screen>
    );
  }

  const live = trip.state.itinerary.filter((i) => i.status !== "cancelled");
  const stays = live.filter((i) => i.category === "Stay" && i.endDate);

  return (
    <Screen
      title="What if…"
      subtitle="Try changes and see the cost before committing"
      back
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Reset" variant="ghost" onPress={() => { setRemoved([]); setWithout([]); setExtraNights(0); setOverrides({}); }} />
          <Button label="Apply to the trip" icon="check" full onPress={apply} disabled={!touched || diff?.deltaPaise === 0} />
        </View>
      }
    >
      <Card tone="ink" style={{ gap: 12, padding: space.xl }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Now</Text>
            <Text style={styles.compare}>{formatMoney(diff?.beforePaise ?? 0)}</Text>
          </View>
          <Icon name="arrow-forward" size={20} color="#91B8EE" />
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Scenario</Text>
            <Text style={[styles.compare, { color: (diff?.deltaPaise ?? 0) > 0 ? "#FFB3B8" : (diff?.deltaPaise ?? 0) < 0 ? "#7FE3B6" : colors.white }]}>{formatMoney(diff?.afterPaise ?? 0)}</Text>
          </View>
        </View>
        <View style={styles.deltaStrip}>
          <Text style={[type.body, { color: colors.white, fontWeight: "800" }]}>
            {diff && diff.deltaPaise !== 0 ? `${diff.deltaPaise > 0 ? "+" : "−"}${formatMoney(Math.abs(diff.deltaPaise))}` : "No change yet"}
          </Text>
          {diff && diff.deltaPaise !== 0 ? (
            <Text style={{ color: "#B6C6DA", fontSize: 12 }}>
              flat per person {formatMoney(diff.perPersonFlatBefore)} → {formatMoney(diff.perPersonFlatAfter)}
            </Text>
          ) : (
            <Text style={{ color: "#B6C6DA", fontSize: 12 }}>Change something below to compare</Text>
          )}
        </View>
      </Card>

      <SectionTitle title="Stay longer or shorter" />
      <Card style={{ gap: 12 }}>
        {stays.length === 0 ? (
          <Text style={type.bodyMuted}>No stays with a checkout date, so there are no nights to add.</Text>
        ) : (
          <>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>Extra nights</Text>
                <Text style={type.caption}>Adds a night at the same nightly rate to {stays.length} stay{stays.length === 1 ? "" : "s"}.</Text>
              </View>
              <Stepper label="Extra nights" value={extraNights} min={0} max={14} onChange={setExtraNights} />
            </View>
            <Text style={type.caption}>Scenario only — applying it doesn&apos;t move the dates. Edit the stay to make it real.</Text>
          </>
        )}
      </Card>

      <SectionTitle title="Drop something" />
      <Card style={{ gap: 8 }}>
        <View style={styles.chips}>
          {live.map((i) => (
            <Chip
              key={i.id}
              label={`${i.title} · ${formatMoney(i.estimatedPaise)}`}
              selected={removed.includes(i.id)}
              icon={removed.includes(i.id) ? "close" : undefined}
              onPress={() => setRemoved((c) => (c.includes(i.id) ? c.filter((x) => x !== i.id) : [...c, i.id]))}
            />
          ))}
        </View>
        <Text style={type.caption}>Tap an item to take it out of the scenario.</Text>
      </Card>

      <SectionTitle title="Change a price" />
      <Card style={{ gap: 10 }}>
        {live.slice(0, 8).map((i) => (
          <TextField
            key={i.id}
            label={`${i.title} — now ${formatMoney(i.estimatedPaise)}`}
            value={overrides[i.id] ?? ""}
            onChangeText={(v) => setOverrides((o) => ({ ...o, [i.id]: v }))}
            prefix="₹"
            placeholder={(i.estimatedPaise / 100).toFixed(0)}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        ))}
      </Card>

      <SectionTitle title="Fewer people" />
      <Card style={{ gap: 8 }}>
        <View style={styles.chips}>
          {trip.state.participants.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={without.includes(p.id)}
              icon={without.includes(p.id) ? "person-remove" : undefined}
              onPress={() => setWithout((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
              left={<Avatar name={p.name} size={20} />}
            />
          ))}
        </View>
        <Text style={type.caption}>Takes them off every item. The trip total only drops for items priced per head; what changes most is everyone else&apos;s share.</Text>
      </Card>

      {diff && diff.lines.length ? (
        <>
          <SectionTitle title="What moves" count={diff.lines.length} />
          <Card style={{ gap: 10 }}>
            {diff.lines.map((l) => (
              <View key={l.itemId} style={styles.lineRow}>
                <Icon name={l.deltaPaise > 0 ? "arrow-upward" : "arrow-downward"} size={16} color={l.deltaPaise > 0 ? colors.coralText : colors.mintText} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "600" }]} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={type.caption}>{l.reason}</Text>
                </View>
                <Money paise={l.deltaPaise} signed tone="auto" style={{ fontSize: 14 }} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {diff && Object.values(diff.perParticipant).some((p) => p.delta !== 0) ? (
        <>
          <SectionTitle title="Effect on each person" />
          <Card style={{ gap: 8 }}>
            {trip.state.participants.map((p) => {
              const row = diff.perParticipant[p.id];
              if (!row) return null;
              return (
                <View key={p.id} style={styles.lineRow}>
                  <Avatar name={p.name} size={26} />
                  <Text style={[type.body, { flex: 1 }]}>{trip.name(p.id)}</Text>
                  <Text style={[type.caption, { textDecorationLine: "line-through", color: colors.faint }]}>{formatMoney(row.before)}</Text>
                  <Icon name="arrow-forward" size={13} color={colors.faint} />
                  <Money paise={row.after} style={{ fontSize: 14 }} />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      <Notice tone="grey" icon="science">
        Nothing here is saved until you apply it. Price changes and dropped items become real itinerary edits; nights and people are explore-only.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compare: { color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  deltaStrip: { borderTopWidth: 1, borderTopColor: "#2D4668", paddingTop: 12, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
});
