import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Money, Notice, Screen, SectionTitle, Segmented, Stepper, TextField, TextLink } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { todayIso } from "@/lib/dates";
import { useFeedback, useOnce } from "@/lib/feedback";
import { addExpense, CommandError, evenPayers, updateExpense, validateExpense, type ExpenseErrors, type ExpenseInput } from "@/lib/ledger/commands";
import { computeExpense } from "@/lib/ledger/engine";
import { useTrip } from "@/lib/ledger/hooks";
import { bestOfferForMethod, optimisePayment } from "@/lib/ledger/offers";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type SplitMode } from "@/lib/ledger/types";
import { formatMoney, parseAmount, sumPaise, type Paise } from "@/lib/money";

const paiseToInput = (p: Paise) => (p / 100).toFixed(p % 100 === 0 ? 0 : 2);

export default function ExpenseFormScreen() {
  const params = useLocalSearchParams<{ id?: string; itineraryItemId?: string; payerId?: string; methodId?: string; discount?: string; amount?: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();

  const existing = params.id ? trip?.state.expenses.find((e) => e.id === params.id) : undefined;
  const editing = !!existing;
  const linkedItem = trip?.state.itinerary.find((i) => i.id === (existing?.itineraryItemId ?? params.itineraryItemId));

  const seedAmount = params.amount ? Number(params.amount) : linkedItem ? (linkedItem.actualPaise ?? linkedItem.estimatedPaise) : 0;

  const [title, setTitle] = useState(existing?.title ?? linkedItem?.title ?? "");
  const [vendor, setVendor] = useState(existing?.vendor ?? linkedItem?.vendor ?? "");
  const [amount, setAmount] = useState(existing ? paiseToInput(existing.amountPaise) : seedAmount ? paiseToInput(seedAmount) : "");
  const [date, setDate] = useState(existing?.date ?? linkedItem?.date ?? todayIso());
  const [category, setCategory] = useState<ExpenseCategory>(existing?.category ?? linkedItem?.category ?? "Other");
  const [itemId, setItemId] = useState<string | undefined>(existing?.itineraryItemId ?? params.itineraryItemId ?? undefined);
  const [payerIds, setPayerIds] = useState<string[]>(existing ? existing.payers.map((p) => p.participantId) : params.payerId ? [params.payerId] : trip?.viewerId ? [trip.viewerId] : []);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(existing ? Object.fromEntries(existing.payers.map((p) => [p.participantId, paiseToInput(p.amountPaise)])) : {});
  const [participantIds, setParticipantIds] = useState<string[]>(
    existing ? existing.participants.map((p) => p.participantId) : (linkedItem?.participantIds ?? trip?.state.participants.map((p) => p.id) ?? []),
  );
  const [splitMode, setSplitMode] = useState<SplitMode>(existing?.splitMode ?? (linkedItem?.weights ? "weighted" : "equal"));
  const [weights, setWeights] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (existing) existing.participants.forEach((p) => (map[p.participantId] = existing.splitMode === "weighted" ? p.weight : 1));
    else linkedItem?.participantIds.forEach((pid, i) => (map[pid] = linkedItem.weights?.[i] ?? 1));
    return map;
  });
  const [exact, setExact] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (existing?.splitMode === "exact") existing.participants.forEach((p) => (map[p.participantId] = paiseToInput(p.weight)));
    return map;
  });
  const [methodId, setMethodId] = useState<string | undefined>(existing?.paymentMethodId ?? params.methodId ?? undefined);
  const [discount, setDiscount] = useState(existing?.discountPaise ? paiseToInput(existing.discountPaise) : params.discount ? paiseToInput(Number(params.discount)) : "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [hasPolicy, setHasPolicy] = useState(!!existing?.cancellationPolicy);
  const [refundPercent, setRefundPercent] = useState(String(existing?.cancellationPolicy?.refundPercent ?? linkedItem?.cancellationPolicy?.refundPercent ?? 50));
  const [submitted, setSubmitted] = useState(false);

  const amountParsed = parseAmount(amount);
  const amountPaise = amountParsed.paise ?? 0;
  const discountParsed = parseAmount(discount);

  const input: ExpenseInput | null = useMemo(() => {
    if (!trip) return null;
    const payers =
      payerIds.length === 1
        ? [{ participantId: payerIds[0], amountPaise }]
        : payerIds.map((pid) => ({ participantId: pid, amountPaise: parseAmount(payerAmounts[pid] ?? "").paise ?? 0 }));
    const participants = participantIds.map((pid) => ({
      participantId: pid,
      weight: splitMode === "equal" ? 1 : splitMode === "weighted" ? (weights[pid] ?? 1) : (parseAmount(exact[pid] ?? "").paise ?? 0),
    }));
    return {
      title,
      vendor,
      amountPaise,
      date: date.trim(),
      category,
      payers,
      participants,
      splitMode,
      notes,
      itineraryItemId: itemId,
      paymentMethodId: methodId,
      discountPaise: discount.trim() ? (discountParsed.paise ?? 0) : undefined,
      cancellationPolicy: hasPolicy ? { refundPercent: Number(refundPercent) } : undefined,
      capture: existing?.capture ?? { kind: "manual" },
    };
  }, [trip, title, vendor, amountPaise, date, category, payerIds, payerAmounts, participantIds, splitMode, weights, exact, notes, itemId, methodId, discount, discountParsed.paise, hasPolicy, refundPercent, existing?.capture]);

  const errors: ExpenseErrors = useMemo(() => {
    if (!trip || !input) return {};
    const e = validateExpense(trip.state, input);
    if (amountParsed.error && amount !== "") e.amount = amountParsed.error;
    if (discount.trim() && discountParsed.error) e.discount = discountParsed.error;
    return e;
  }, [trip, input, amountParsed.error, amount, discount, discountParsed.error]);

  const preview = useMemo(() => {
    if (!trip || !input || Object.keys(errors).length) return null;
    return computeExpense({ ...input, id: "preview", status: "active" }, []);
  }, [trip, input, errors]);

  /** Which card the optimiser would pick for this bill, shown as a nudge. */
  const suggestion = useMemo(() => {
    if (!trip || amountPaise <= 0 || editing) return null;
    const result = optimisePayment(trip.state.participants, { amountPaise, category, vendor: vendor.trim() || undefined });
    if (!result.best || result.best.discountPaise <= 0) return null;
    return result.best;
  }, [trip, amountPaise, category, vendor, editing]);

  const chosenMethod = useMemo(() => {
    if (!trip || !methodId) return null;
    for (const p of trip.state.participants) {
      const m = p.paymentMethods?.find((x) => x.id === methodId);
      if (m) return { person: p, method: m };
    }
    return null;
  }, [trip, methodId]);

  const save = useOnce(() => {
    if (!trip || !input) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0] ?? "Check the highlighted fields", "error");
      return;
    }
    try {
      trip.append(editing ? updateExpense(trip.state, existing!.id, input, { actor: trip.actor }) : addExpense(trip.state, input, { actor: trip.actor }));
      toast(
        editing
          ? "Expense updated · shares re-derived"
          : `${input.title.trim()} added · ${participantIds.length} share${participantIds.length === 1 ? "" : "s"} derived${input.discountPaise ? ` · ${formatMoney(input.discountPaise)} saved` : ""}`,
        "success",
      );
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not save the expense", "error");
    }
  });

  if (!trip) {
    return (
      <Screen title="Add expense" back>
        <EmptyState icon="receipt-long" title="No trip open" />
      </Screen>
    );
  }
  if (params.id && !existing) {
    return (
      <Screen title="Edit expense" back>
        <EmptyState icon="receipt-long" title="Expense not found" />
      </Screen>
    );
  }

  const people = trip.state.participants;
  const show = (key: keyof ExpenseErrors) => (submitted ? errors[key] : undefined);
  const payersTotal = payerIds.length > 1 ? sumPaise(payerIds.map((pid) => parseAmount(payerAmounts[pid] ?? "").paise ?? 0)) : amountPaise;
  const exactTotal = sumPaise(participantIds.map((pid) => parseAmount(exact[pid] ?? "").paise ?? 0));
  const plannable = trip.state.itinerary.filter((i) => i.status !== "cancelled");
  const item = plannable.find((i) => i.id === itemId);

  return (
    <Screen
      title={editing ? "Edit expense" : "Record a payment"}
      subtitle={editing ? "Every share re-derives when you save" : "Money that actually moved"}
      back
      footer={<Button label={editing ? "Save changes" : "Record expense"} icon={editing ? "check" : "add"} full onPress={save} />}
    >
      {item ? (
        <Notice tone="blue" icon="link" title={`Paying for "${item.title}"`}>
          {`Estimated ${formatMoney(item.estimatedPaise)}. What you record here becomes the actual, and the plan shows the difference.`}
        </Notice>
      ) : null}

      <Card style={{ gap: 14 }}>
        <TextField label="What was it for?" value={title} onChangeText={setTitle} placeholder="e.g. Homestay · Old Manali" error={show("title")} autoFocus={!editing && !linkedItem} maxLength={80} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Amount charged" value={amount} onChangeText={setAmount} placeholder="0" prefix="₹" keyboardType="decimal-pad" inputMode="decimal" error={show("amount")} style={{ flex: 1.2 }} hint="After any card discount" />
          <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" error={show("date")} style={{ flex: 1 }} />
        </View>
        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </Field>
        <TextField label="Vendor (optional)" value={vendor} onChangeText={setVendor} placeholder="Hotel, operator, restaurant…" maxLength={60} />
        {plannable.length ? (
          <Field label="Part of the plan?" hint="Linking it keeps the estimate and the actual side by side.">
            <View style={styles.chips}>
              <Chip label="Not planned" selected={!itemId} onPress={() => setItemId(undefined)} />
              {plannable.map((i) => (
                <Chip key={i.id} label={`${i.title} · ${formatMoney(i.estimatedPaise)}`} selected={itemId === i.id} onPress={() => setItemId(i.id)} />
              ))}
            </View>
          </Field>
        ) : null}
      </Card>

      <SectionTitle title="Who paid?" />
      <Card style={{ gap: 12 }}>
        <View style={styles.chips}>
          {people.map((p) => (
            <Chip key={p.id} label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name} selected={payerIds.includes(p.id)} onPress={() => setPayerIds((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} left={<Avatar name={p.name} size={20} />} />
          ))}
        </View>
        {payerIds.length > 1 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={type.small}>How much did each person pay?</Text>
              <TextLink label="Split evenly" onPress={() => setPayerAmounts(Object.fromEntries(evenPayers(amountPaise, payerIds).map((p) => [p.participantId, paiseToInput(p.amountPaise)])))} icon="balance" />
            </View>
            {payerIds.map((pid) => (
              <TextField key={pid} label={trip.name(pid)} value={payerAmounts[pid] ?? ""} onChangeText={(v) => setPayerAmounts({ ...payerAmounts, [pid]: v })} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" />
            ))}
            <Text style={[type.caption, payersTotal !== amountPaise && amountPaise > 0 ? { color: colors.coralText } : null]}>
              {formatMoney(payersTotal)} of {formatMoney(amountPaise)} accounted for
            </Text>
          </View>
        ) : null}
        {show("payers") ? <Text style={styles.error}>{errors.payers}</Text> : null}
      </Card>

      {suggestion && !methodId ? (
        <Notice tone="mint" icon="credit-card" title={`${trip.name(suggestion.participantId)}'s ${suggestion.method.label} would save ${formatMoney(suggestion.discountPaise)}`}>
          {`${suggestion.offer?.title ?? "Best available offer"} — ${suggestion.offer?.terms ?? "no conditions"}. Set the payer and card below to record it.`}
        </Notice>
      ) : null}

      <SectionTitle title="Card & discount" />
      <Card style={{ gap: 12 }}>
        <Field label="Paid with" hint="Only cards registered on this trip appear here.">
          <View style={styles.chips}>
            <Chip label="Not recorded" selected={!methodId} onPress={() => setMethodId(undefined)} />
            {people.flatMap((p) =>
              (p.paymentMethods ?? []).map((m) => (
                <Chip
                  key={m.id}
                  label={`${trip.short(p.id)} · ${m.label}`}
                  selected={methodId === m.id}
                  onPress={() => {
                    setMethodId(m.id);
                    if (!payerIds.includes(p.id)) setPayerIds([p.id]);
                    const best = bestOfferForMethod(m, { amountPaise, category, vendor: vendor.trim() || undefined });
                    if (best.discountPaise > 0 && !discount.trim()) setDiscount(paiseToInput(best.discountPaise));
                  }}
                />
              )),
            )}
          </View>
        </Field>
        <TextField label="Discount captured (optional)" value={discount} onChangeText={setDiscount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" error={show("discount")} hint="Off the bill, so it benefits the whole group. Points stay with the cardholder." />
        {chosenMethod && discountParsed.paise ? (
          <Text style={type.caption}>
            Bill was {formatMoney(amountPaise + (discountParsed.paise ?? 0))} before the offer · {chosenMethod.method.label} saved {formatMoney(discountParsed.paise)}
          </Text>
        ) : null}
        <TextLink label="Open the optimiser" icon="insights" onPress={() => router.push({ pathname: "/optimizer", params: { amount: String(amountPaise), category, vendor } })} />
      </Card>

      <SectionTitle title="Who shares the cost?" count={participantIds.length} />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TextLink label="Everyone" onPress={() => setParticipantIds(people.map((p) => p.id))} />
          <TextLink label="Nobody" onPress={() => setParticipantIds([])} />
          {trip.viewerId ? <TextLink label="Just me" onPress={() => setParticipantIds([trip.viewerId!])} /> : null}
        </View>
        <View style={styles.chips}>
          {people.map((p) => (
            <Chip key={p.id} label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name} selected={participantIds.includes(p.id)} onPress={() => setParticipantIds((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} left={<Avatar name={p.name} size={20} />} />
          ))}
        </View>
        <Segmented
          value={splitMode}
          onChange={setSplitMode}
          options={[
            { value: "equal", label: "Equal" },
            { value: "weighted", label: "By shares" },
            { value: "exact", label: "Exact" },
          ]}
        />
        {splitMode === "weighted" ? (
          <View style={{ gap: 8 }}>
            <Text style={type.small}>Give each person a number of shares — rooms, beds, nights, seats.</Text>
            {participantIds.map((pid) => (
              <View key={pid} style={styles.weightRow}>
                <Avatar name={trip.fullName(pid)} size={26} />
                <Text style={[type.body, { flex: 1 }]}>{trip.name(pid)}</Text>
                <Stepper label={`${trip.name(pid)} shares`} value={weights[pid] ?? 1} min={0} max={20} onChange={(v) => setWeights({ ...weights, [pid]: v })} />
              </View>
            ))}
          </View>
        ) : null}
        {splitMode === "exact" ? (
          <View style={{ gap: 8 }}>
            {participantIds.map((pid) => (
              <TextField key={pid} label={trip.name(pid)} value={exact[pid] ?? ""} onChangeText={(v) => setExact({ ...exact, [pid]: v })} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" />
            ))}
            <Text style={[type.caption, exactTotal !== amountPaise && amountPaise > 0 ? { color: colors.coralText } : null]}>
              {formatMoney(exactTotal)} of {formatMoney(amountPaise)} assigned
            </Text>
          </View>
        ) : null}
        {show("participants") ? <Text style={styles.error}>{errors.participants}</Text> : null}
      </Card>

      {preview ? (
        <Card tone="soft" style={{ gap: 8 }}>
          <Text style={type.label}>Derived shares</Text>
          {Object.entries(preview.shares).map(([pid, share]) => (
            <View key={pid} style={styles.previewRow}>
              <Avatar name={trip.fullName(pid)} size={22} />
              <Text style={[type.body, { flex: 1 }]}>{trip.name(pid)}</Text>
              <Money paise={share} style={{ fontSize: 14 }} />
            </View>
          ))}
          <Text style={type.caption}>Adds up to {formatMoney(sumPaise(Object.values(preview.shares)))} — no paisa lost to rounding.</Text>
        </Card>
      ) : (
        <Notice tone="grey" icon="auto-awesome">
          Shares appear here as soon as the amount and participants are valid.
        </Notice>
      )}

      <SectionTitle title="More" />
      <Card style={{ gap: 14 }}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: "700" }]}>Vendor refund policy</Text>
            <Text style={type.caption}>How much comes back if this booking is cancelled.</Text>
          </View>
          <Switch value={hasPolicy} onValueChange={setHasPolicy} accessibilityLabel="Vendor refund policy" trackColor={{ false: colors.line, true: "#B8C9F4" }} thumbColor={hasPolicy ? colors.blue : colors.white} />
        </View>
        {hasPolicy ? (
          <View style={{ gap: 10 }}>
            <View style={styles.chips}>
              {["0", "25", "50", "75", "100"].map((pct) => (
                <Chip key={pct} label={`${pct}%`} selected={refundPercent === pct} onPress={() => setRefundPercent(pct)} />
              ))}
            </View>
            <TextField label="Refundable %" value={refundPercent} onChangeText={(v) => setRefundPercent(v.replace(/[^0-9]/g, "").slice(0, 3))} keyboardType="number-pad" error={show("policy")} />
          </View>
        ) : null}
        <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="Anything the group should know" multiline maxLength={300} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { fontSize: 13, color: colors.coralText, fontWeight: "600" },
  weightRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
});
