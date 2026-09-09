import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Segmented, Sheet, Stat, TextField } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { formatRelative } from "@/lib/dates";
import { useFeedback, useGuarded, useOnce } from "@/lib/feedback";
import { CommandError, recordContribution, removeContribution } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import type { SettlementMethod } from "@/lib/ledger/types";
import { formatMoney, parseAmount, sumPaise } from "@/lib/money";

/**
 * The trip kitty: money members put in up front so one person isn't fronting
 * everything. Tracked, never held by this app — the transfer happens in the
 * members' own UPI apps and is recorded here.
 */
export default function FundingScreen() {
  const trip = useTrip();
  const { toast, confirm } = useFeedback();
  const guarded = useGuarded();

  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<string | undefined>(trip?.viewerId ?? undefined);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<SettlementMethod>("upi");
  const [reference, setReference] = useState("");

  const save = useOnce(() => {
    if (!trip || !who) return;
    const parsed = parseAmount(amount);
    if (parsed.error || !parsed.paise) {
      toast(parsed.error ?? "Enter an amount", "error");
      return;
    }
    try {
      trip.append(recordContribution(trip.state, { participantId: who, amountPaise: parsed.paise, method, reference }, { actor: trip.actor }));
      toast(`${formatMoney(parsed.paise)} recorded from ${trip.short(who)}`, "success");
      setAmount("");
      setReference("");
      setOpen(false);
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not record it", "error");
    }
  });

  if (!trip) {
    return (
      <Screen title="Trip kitty" back>
        <EmptyState icon="savings" title="No trip open" />
      </Screen>
    );
  }

  const target = trip.state.trip.fundingTargetPaise ?? 0;
  const people = trip.state.participants;
  const collected = sumPaise(trip.state.contributions.map((c) => c.amountPaise));
  const required = target * people.length;
  const remaining = Math.max(0, required - collected);
  const history = [...trip.state.contributions].sort((a, b) => b.ts - a.ts);

  return (
    <Screen
      title="Trip kitty"
      subtitle={target ? `${formatMoney(collected)} of ${formatMoney(required)} collected` : `${formatMoney(collected)} collected`}
      back
      right={<Button label="Add" accessibilityLabel="Record a contribution" icon="add" small onPress={() => setOpen(true)} />}
    >
      <Notice tone="blue" icon="account-balance" title="Tracked, not held">
        This app never holds anyone&apos;s money. Members transfer to whoever is coordinating, and the amounts are recorded here so nobody has to remember who has paid in.
      </Notice>

      <View style={styles.stats}>
        <Stat label="Collected" value={formatMoney(collected)} sub={`${new Set(trip.state.contributions.map((c) => c.participantId)).size} of ${people.length} members`} tone="mint" />
        {target ? <Stat label="Target each" value={formatMoney(target)} sub={`${formatMoney(required)} in total`} tone="blue" /> : null}
        {target ? <Stat label="Still to come" value={formatMoney(remaining)} sub={remaining ? "outstanding" : "fully funded"} tone={remaining ? "amber" : undefined} /> : null}
      </View>

      {target ? (
        <Card style={{ gap: 6 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${required > 0 ? Math.max(2, Math.min(100, (collected / required) * 100)) : 0}%` }]} />
          </View>
          <Text style={type.caption}>{required > 0 ? `${Math.round((collected / required) * 100)}% funded` : "No target set"}</Text>
        </Card>
      ) : null}

      <SectionTitle title="By member" />
      <Card style={{ gap: 4 }}>
        {people.map((p, i) => {
          const paid = sumPaise(trip.state.contributions.filter((c) => c.participantId === p.id).map((c) => c.amountPaise));
          const done = target === 0 ? paid > 0 : paid >= target;
          return (
            <View key={p.id} style={[styles.row, i < people.length - 1 && styles.rowBorder]}>
              <Avatar name={p.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>{trip.isViewer(p.id) ? `${p.name} (you)` : p.name}</Text>
                <Text style={type.caption}>{target ? `${formatMoney(paid)} of ${formatMoney(target)}` : `${formatMoney(paid)} contributed`}</Text>
              </View>
              {done ? (
                <Pill label="Funded" tone="mint" small icon="check" />
              ) : (
                <Button
                  label="Record"
                  small
                  variant="secondary"
                  accessibilityLabel={`Record a contribution from ${p.name}`}
                  onPress={() => {
                    setWho(p.id);
                    if (target) setAmount(((target - paid) / 100).toFixed(0));
                    setOpen(true);
                  }}
                />
              )}
            </View>
          );
        })}
      </Card>

      <SectionTitle title="Contributions" count={history.length} />
      {history.length === 0 ? (
        <Card>
          <EmptyState icon="savings" title="Nothing in the kitty yet" message="Record the first contribution once someone transfers in." action={<Button label="Record a contribution" icon="add" onPress={() => setOpen(true)} />} />
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          {history.map((c, i) => (
            <View key={c.id} style={[styles.row, i < history.length - 1 && styles.rowBorder]}>
              <View style={[styles.icon, { backgroundColor: colors.mint }]}>
                <Icon name={c.method === "upi" ? "qr-code-2" : "payments"} size={17} color={colors.mintText} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>{trip.name(c.participantId)}</Text>
                <Text style={type.caption}>
                  {formatRelative(c.ts)} · {c.method === "upi" ? "UPI" : "Cash"}
                  {c.reference ? ` · ${c.reference}` : ""}
                </Text>
              </View>
              <Money paise={c.amountPaise} />
              <Button
                label="Remove"
                variant="ghost"
                small
                accessibilityLabel={`Remove ${trip.possessiveLower(c.participantId)} contribution`}
                onPress={async () => {
                  const ok = await confirm({ title: "Remove this contribution?", message: `${formatMoney(c.amountPaise)} from ${trip.name(c.participantId)}.`, confirmLabel: "Remove", destructive: true });
                  if (ok) guarded(() => trip.append(removeContribution(trip.state, c.id, { actor: trip.actor })), "Contribution removed");
                }}
              />
            </View>
          ))}
        </Card>
      )}

      <Notice tone="grey" icon="info-outline">
        Kitty contributions are separate from what members owe each other. Balances on the Settle tab move only when real expenses are recorded — this is the float that funds them.
      </Notice>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Record a contribution" footer={<Button label="Record" icon="check" full onPress={save} />}>
        <View style={{ gap: 14 }}>
          <View style={styles.chips}>
            {people.map((p) => (
              <Button key={p.id} label={trip.isViewer(p.id) ? `${p.name} (you)` : p.name} small variant={who === p.id ? "primary" : "ghost"} onPress={() => setWho(p.id)} />
            ))}
          </View>
          <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" autoFocus />
          <Segmented value={method} onChange={setMethod} options={[{ value: "upi", label: "UPI" }, { value: "cash", label: "Cash" }]} />
          <TextField label="Reference (optional)" value={reference} onChangeText={setReference} placeholder="UPI reference or note" maxLength={40} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.mintStrong },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
