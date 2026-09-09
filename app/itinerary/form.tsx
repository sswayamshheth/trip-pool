import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Icon, Money, Notice, Screen, SectionTitle, Stepper, TextField, TextLink } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { todayIso } from "@/lib/dates";
import { useFeedback, useOnce } from "@/lib/feedback";
import {
  addItineraryItem,
  CommandError,
  expenseDraftFromItem,
  removeItineraryItem,
  updateItineraryItem,
  validateItinerary,
  type ItineraryErrors,
  type ItineraryInput,
} from "@/lib/ledger/commands";
import { computeItemBudget } from "@/lib/ledger/budget";
import { useTrip } from "@/lib/ledger/hooks";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/ledger/types";
import { formatMoney, parseAmount, sumPaise } from "@/lib/money";

const paiseToInput = (p: number) => (p / 100).toFixed(p % 100 === 0 ? 0 : 2);

export default function ItineraryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast, confirm } = useFeedback();
  const existing = id ? trip?.state.itinerary.find((i) => i.id === id) : undefined;
  const editing = !!existing;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? "Stay");
  const [date, setDate] = useState(existing?.date ?? trip?.state.trip.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [time, setTime] = useState(existing?.time ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? "");
  const [estimate, setEstimate] = useState(existing ? paiseToInput(existing.estimatedPaise) : "");
  const [hasActual, setHasActual] = useState(existing?.actualPaise !== undefined);
  const [actual, setActual] = useState(existing?.actualPaise !== undefined ? paiseToInput(existing.actualPaise) : "");
  const [participantIds, setParticipantIds] = useState<string[]>(existing?.participantIds ?? trip?.state.participants.map((p) => p.id) ?? []);
  const [weighted, setWeighted] = useState(!!existing?.weights);
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    (existing?.participantIds ?? trip?.state.participants.map((p) => p.id) ?? []).forEach((pid, i) => {
      map[pid] = existing?.weights?.[i] ?? 1;
    });
    return map;
  });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [hasPolicy, setHasPolicy] = useState(!!existing?.cancellationPolicy);
  const [refundPercent, setRefundPercent] = useState(String(existing?.cancellationPolicy?.refundPercent ?? 50));
  const [policyNote, setPolicyNote] = useState(existing?.cancellationPolicy?.note ?? "");
  const [submitted, setSubmitted] = useState(false);

  const estimateParsed = parseAmount(estimate);
  const actualParsed = parseAmount(actual);

  const input: ItineraryInput | null = useMemo(() => {
    if (!trip) return null;
    return {
      title,
      category,
      date: date.trim(),
      endDate: endDate.trim() || undefined,
      time,
      location,
      vendor,
      estimatedPaise: estimateParsed.paise ?? 0,
      actualPaise: hasActual ? (actualParsed.paise ?? 0) : undefined,
      participantIds,
      weights: weighted ? participantIds.map((pid) => weights[pid] ?? 1) : undefined,
      notes,
      cancellationPolicy: hasPolicy ? { refundPercent: Number(refundPercent), note: policyNote } : undefined,
      status: existing?.status,
    };
  }, [trip, title, category, date, endDate, time, location, vendor, estimateParsed.paise, hasActual, actualParsed.paise, participantIds, weighted, weights, notes, hasPolicy, refundPercent, policyNote, existing?.status]);

  const errors: ItineraryErrors = useMemo(() => {
    if (!trip || !input) return {};
    const e = validateItinerary(trip.state, input);
    if (estimateParsed.error && estimate !== "") e.estimated = estimateParsed.error;
    if (hasActual && actualParsed.error && actual !== "") e.actual = actualParsed.error;
    return e;
  }, [trip, input, estimateParsed.error, estimate, hasActual, actualParsed.error, actual]);

  const preview = useMemo(() => {
    if (!trip || !input || Object.keys(errors).length) return null;
    const item = {
      id: existing?.id ?? "preview",
      ...input,
      title: input.title.trim(),
      status: existing?.status ?? ("planned" as const),
      expenseIds: existing?.expenseIds ?? [],
      participantIds: input.participantIds,
      weights: input.weights,
    };
    return computeItemBudget(item, trip.state.expenses, trip.state.refunds);
  }, [trip, input, errors, existing]);

  const save = useOnce(() => {
    if (!trip || !input) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0] ?? "Check the highlighted fields", "error");
      return;
    }
    try {
      const before = existing ? trip.budget.estimatedPaise : null;
      trip.append(editing ? updateItineraryItem(trip.state, existing!.id, input, { actor: trip.actor }) : addItineraryItem(trip.state, input, { actor: trip.actor }));
      const delta = (input.estimatedPaise ?? 0) - (existing?.estimatedPaise ?? 0);
      toast(
        editing
          ? delta === 0
            ? "Item updated"
            : `Item updated · budget ${delta > 0 ? "up" : "down"} ${formatMoney(Math.abs(delta))} to ${formatMoney((before ?? 0) + delta)}`
          : `${input.title.trim()} added · budget now ${formatMoney(trip.budget.estimatedPaise + input.estimatedPaise)}`,
        "success",
      );
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not save the item", "error");
    }
  });

  const remove = async () => {
    if (!trip || !existing) return;
    const ok = await confirm({
      title: `Remove "${existing.title}"?`,
      message: `The trip estimate drops by ${formatMoney(existing.estimatedPaise)}, to ${formatMoney(trip.budget.estimatedPaise - existing.estimatedPaise)}.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      trip.append(removeItineraryItem(trip.state, existing.id, { actor: trip.actor }));
      toast(`Removed · budget down ${formatMoney(existing.estimatedPaise)}`, "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not remove the item", "error");
    }
  };

  const book = () => {
    if (!trip || !existing || !trip.viewerId) return;
    const draft = expenseDraftFromItem(existing, trip.viewerId);
    router.push({ pathname: "/expense/form", params: { itineraryItemId: existing.id, prefill: JSON.stringify(draft) } });
  };

  if (!trip) {
    return (
      <Screen title="Itinerary item" back>
        <EmptyState icon="event-note" title="No trip open" />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen title="Itinerary item" back>
        <EmptyState icon="event-busy" title="Item not found" action={<Button label="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const show = (key: keyof ItineraryErrors) => (submitted ? errors[key] : undefined);
  const people = trip.state.participants;
  const deltaFromSaved = existing ? (estimateParsed.paise ?? 0) - existing.estimatedPaise : estimateParsed.paise ?? 0;

  return (
    <Screen
      title={editing ? "Edit itinerary item" : "Add itinerary item"}
      subtitle={editing ? "Saving re-derives the budget and every share" : "This becomes part of the trip estimate"}
      back
      footer={<Button label={editing ? "Save changes" : "Add to itinerary"} icon={editing ? "check" : "add"} full onPress={save} />}
    >
      <Card style={{ gap: 14 }}>
        <TextField label="What is it?" value={title} onChangeText={setTitle} placeholder="e.g. Homestay · Old Manali" autoFocus={!editing} error={show("title")} maxLength={80} />
        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Estimated cost" value={estimate} onChangeText={setEstimate} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" error={show("estimated")} style={{ flex: 1.1 }} />
          <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={show("date")} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Ends (optional)" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" error={show("endDate")} style={{ flex: 1 }} hint={category === "Stay" ? "Sets the number of nights" : undefined} />
          <TextField label="Time (optional)" value={time} onChangeText={setTime} placeholder="09:30" style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Vendor (optional)" value={vendor} onChangeText={setVendor} placeholder="Hotel, operator…" style={{ flex: 1 }} maxLength={60} />
          <TextField label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Old Manali" style={{ flex: 1 }} maxLength={60} />
        </View>
      </Card>

      <SectionTitle title="Who is this for?" count={participantIds.length} />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TextLink label="Everyone" onPress={() => setParticipantIds(people.map((p) => p.id))} />
          <TextLink label="Nobody" onPress={() => setParticipantIds([])} />
          {trip.viewerId ? <TextLink label="Just me" onPress={() => setParticipantIds([trip.viewerId!])} /> : null}
        </View>
        <View style={styles.chips}>
          {people.map((p) => (
            <Chip
              key={p.id}
              label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name}
              selected={participantIds.includes(p.id)}
              onPress={() => setParticipantIds((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
              left={<Avatar name={p.name} size={20} />}
            />
          ))}
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>Uneven shares</Text>
            <Text style={type.caption}>For per-room or per-bed items where some people take more.</Text>
          </View>
          <Switch value={weighted} onValueChange={setWeighted} accessibilityLabel="Uneven shares" trackColor={{ false: colors.line, true: "#B8C9F4" }} thumbColor={weighted ? colors.blue : colors.white} />
        </View>
        {weighted
          ? participantIds.map((pid) => (
              <View key={pid} style={styles.weightRow}>
                <Avatar name={trip.fullName(pid)} size={26} />
                <Text style={[type.body, { flex: 1 }]}>{trip.name(pid)}</Text>
                <Stepper label={`${trip.name(pid)} shares`} value={weights[pid] ?? 1} min={0} max={20} onChange={(v) => setWeights((w) => ({ ...w, [pid]: v }))} />
              </View>
            ))
          : null}
        {show("participants") ? <Text style={styles.error}>{errors.participants}</Text> : null}
      </Card>

      {preview ? (
        <Card tone="soft" style={{ gap: 8 }}>
          <Text style={type.label}>Estimated shares</Text>
          {Object.entries(preview.estimatedShares).map(([pid, share]) => (
            <View key={pid} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Avatar name={trip.fullName(pid)} size={22} />
              <Text style={[type.body, { flex: 1 }]}>{trip.name(pid)}</Text>
              <Money paise={share} style={{ fontSize: 14 }} />
            </View>
          ))}
          <Text style={type.caption}>Adds up to {formatMoney(sumPaise(Object.values(preview.estimatedShares)))} — no paisa lost to rounding.</Text>
          {deltaFromSaved !== 0 ? (
            <View style={styles.deltaBox}>
              <Icon name={deltaFromSaved > 0 ? "trending-up" : "trending-down"} size={16} color={deltaFromSaved > 0 ? colors.amberText : colors.mintText} />
              <Text style={[type.small, { flex: 1, color: deltaFromSaved > 0 ? colors.amberText : colors.mintText, fontWeight: "700" }]}>
                Saving this moves the trip estimate to {formatMoney(trip.budget.estimatedPaise + deltaFromSaved)} ({deltaFromSaved > 0 ? "+" : "−"}
                {formatMoney(Math.abs(deltaFromSaved))})
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      <SectionTitle title="Booking & policy" />
      <Card style={{ gap: 14 }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>Price is confirmed with the vendor</Text>
            <Text style={type.caption}>Sets what the group owes them, separate from the estimate.</Text>
          </View>
          <Switch value={hasActual} onValueChange={setHasActual} accessibilityLabel="Price confirmed with the vendor" trackColor={{ false: colors.line, true: "#B8C9F4" }} thumbColor={hasActual ? colors.blue : colors.white} />
        </View>
        {hasActual ? <TextField label="Confirmed price" value={actual} onChangeText={setActual} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" error={show("actual")} /> : null}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>Cancellation policy</Text>
            <Text style={type.caption}>How much comes back if this is cancelled.</Text>
          </View>
          <Switch value={hasPolicy} onValueChange={setHasPolicy} accessibilityLabel="Cancellation policy" trackColor={{ false: colors.line, true: "#B8C9F4" }} thumbColor={hasPolicy ? colors.blue : colors.white} />
        </View>
        {hasPolicy ? (
          <View style={{ gap: 10 }}>
            <View style={styles.chips}>
              {["0", "25", "50", "75", "100"].map((p) => (
                <Chip key={p} label={`${p}%`} selected={refundPercent === p} onPress={() => setRefundPercent(p)} />
              ))}
            </View>
            <TextField label="Refundable %" value={refundPercent} onChangeText={(v) => setRefundPercent(v.replace(/[^0-9]/g, "").slice(0, 3))} keyboardType="number-pad" error={show("policy")} />
            <TextField label="Policy note (optional)" value={policyNote} onChangeText={setPolicyNote} placeholder="e.g. 50% up to 48h before check-in" maxLength={80} />
          </View>
        ) : null}
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything the group should know" multiline maxLength={300} />
      </Card>

      {editing && existing ? (
        <>
          {existing.expenseIds.length ? (
            <Notice tone="mint" icon="paid" title={`${existing.expenseIds.length} payment${existing.expenseIds.length === 1 ? "" : "s"} recorded`}>
              This item is linked to real spending, so it can be cancelled but not removed. Open the expense to change what was actually paid.
            </Notice>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {existing.status !== "cancelled" ? <Button label="Record a payment for this" icon="paid" variant="secondary" onPress={book} /> : null}
            <Button label="Remove from itinerary" icon="delete-outline" variant="ghost" onPress={remove} disabled={existing.expenseIds.length > 0} />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  weightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  error: { fontSize: 13, color: colors.coralText, fontWeight: "600" },
  deltaBox: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: colors.bg, borderRadius: radius.sm, padding: 10, marginTop: 4 },
});
