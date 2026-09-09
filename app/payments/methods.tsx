import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, Chip, EmptyState, Field, Icon, Money, Notice, Screen, Sheet, TextField } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { addPaymentMethod, CommandError, removePaymentMethod } from "@/lib/ledger/commands";
import { KNOWN_CARDS, offersForMethod } from "@/lib/ledger/offers";
import { useStore } from "@/lib/ledger/store";
import type { PaymentMethod } from "@/lib/ledger/types";
import { parseAmount } from "@/lib/money";

/**
 * Your cards, across every trip. Only the bank, network, card name and last
 * four digits are stored — never a card number — which is exactly what the
 * offer engine needs and nothing more.
 */
export default function MethodsScreen() {
  const router = useRouter();
  const store = useStore();
  const { toast, confirm } = useFeedback();

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [bank, setBank] = useState("");
  const [network, setNetwork] = useState<PaymentMethod["network"]>("Visa");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");

  /** Cards on the "you" participant, de-duplicated across trips. */
  const cards = useMemo(() => {
    const map = new Map<string, { method: PaymentMethod; trips: { id: string; name: string; methodId: string }[] }>();
    for (const t of store.trips) {
      const me = t.state.participants.find((p) => p.id === t.viewerId);
      for (const m of me?.paymentMethods ?? []) {
        const key = `${m.bank}|${m.label}`;
        const row = map.get(key) ?? { method: m, trips: [] };
        row.trips.push({ id: t.id, name: t.state.trip.name, methodId: m.id });
        map.set(key, row);
      }
    }
    return [...map.values()];
  }, [store.trips]);

  const reset = () => {
    setLabel("");
    setBank("");
    setNetwork("Visa");
    setLast4("");
    setLimit("");
  };

  const save = useOnce(() => {
    if (!label.trim() || !bank.trim()) {
      toast("Name the card and its bank", "error");
      return;
    }
    if (last4 && !/^\d{4}$/.test(last4)) {
      toast("Last four digits only — exactly four", "error");
      return;
    }
    const parsedLimit = limit ? parseAmount(limit) : { paise: undefined, error: undefined };
    if (limit && parsedLimit.error) {
      toast(parsedLimit.error, "error");
      return;
    }
    const targets = store.trips.filter((t) => t.viewerId);
    if (targets.length === 0) {
      toast("Join or create a trip first — cards live with your trip profile", "error");
      return;
    }
    try {
      for (const t of targets) {
        store.append(
          addPaymentMethod(t.state, t.viewerId!, { label, bank, kind: "credit-card", network, last4: last4 || undefined, headroomPaise: parsedLimit.paise }, { actor: t.viewerId! }),
          t.id,
        );
      }
      toast(`${label.trim()} added to ${targets.length} trip${targets.length === 1 ? "" : "s"}`, "success");
      reset();
      setOpen(false);
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not add the card", "error");
    }
  });

  const remove = async (row: (typeof cards)[number]) => {
    const ok = await confirm({ title: `Remove ${row.method.label}?`, message: "It is taken off every trip and the optimiser stops considering it.", confirmLabel: "Remove", destructive: true });
    if (!ok) return;
    let failed = 0;
    for (const t of row.trips) {
      const trip = store.trips.find((x) => x.id === t.id);
      if (!trip?.viewerId) continue;
      try {
        store.append(removePaymentMethod(trip.state, trip.viewerId, t.methodId, { actor: trip.viewerId }), t.id);
      } catch {
        failed += 1;
      }
    }
    toast(failed ? `Kept on ${failed} trip${failed === 1 ? "" : "s"} where it was used to pay` : `${row.method.label} removed`, failed ? "error" : "success");
  };

  return (
    <Screen title="Payment methods" subtitle="Card metadata only — never a card number" back right={<Button label="Add" accessibilityLabel="Add a card" icon="add" small onPress={() => setOpen(true)} />}>
      <Notice tone="blue" icon="shield" title="What is stored">
        The bank, the card name, the network and the last four digits. That is all the offer engine needs, and it keeps this prototype entirely outside PCI-DSS scope.
      </Notice>

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon="credit-card-off"
            title="No cards yet"
            message="Add the cards you actually carry. The optimiser then names who should pay each bill to capture the biggest bank discount."
            action={<Button label="Add a card" icon="add" onPress={() => setOpen(true)} />}
          />
        </Card>
      ) : (
        cards.map((row) => {
          const offers = offersForMethod(row.method);
          return (
            <Card key={`${row.method.bank}-${row.method.label}`} style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={styles.cardIcon}>
                  <Icon name="credit-card" size={20} color={colors.lavenderText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{row.method.label}</Text>
                  <Text style={type.caption}>
                    {row.method.bank}
                    {row.method.network ? ` · ${row.method.network}` : ""}
                    {row.method.last4 ? ` · ••${row.method.last4}` : ""}
                  </Text>
                </View>
                {row.method.headroomPaise !== undefined ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Money paise={row.method.headroomPaise} style={{ fontSize: 14 }} />
                    <Text style={type.caption}>available</Text>
                  </View>
                ) : null}
              </View>
              {offers.length ? (
                <View style={{ gap: 6 }}>
                  <Text style={type.label}>Offers this card unlocks</Text>
                  {offers.map((o) => (
                    <View key={o.id} style={styles.offerRow}>
                      <Icon name="local-offer" size={14} color={colors.mintText} />
                      <View style={{ flex: 1 }}>
                        <Text style={[type.small, { fontWeight: "700", color: colors.ink }]}>{o.title}</Text>
                        <Text style={type.caption}>{o.terms}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={type.caption}>No curated offer matches this card yet — it can still be used to pay.</Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[type.caption, { flex: 1 }]}>On {row.trips.map((t) => t.name).join(", ")}</Text>
                <Button label="Remove" variant="ghost" small onPress={() => remove(row)} accessibilityLabel={`Remove ${row.method.label}`} />
              </View>
            </Card>
          );
        })
      )}

      <Button label="See who should pay next" icon="credit-card" variant="secondary" onPress={() => router.push("/optimizer")} />

      <Sheet visible={open} onClose={() => setOpen(false)} title="Add a card" footer={<Button label="Add card" icon="check" full onPress={save} />}>
        <View style={{ gap: 14 }}>
          <Field label="Pick a common card" hint="Or type your own below.">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {KNOWN_CARDS.map((c) => (
                <Chip
                  key={c.label}
                  label={c.label}
                  selected={label === c.label}
                  onPress={() => {
                    setLabel(c.label);
                    setBank(c.bank);
                    setNetwork(c.network);
                  }}
                />
              ))}
            </ScrollView>
          </Field>
          <TextField label="Card name" value={label} onChangeText={setLabel} placeholder="e.g. HDFC Regalia" maxLength={40} />
          <TextField label="Bank" value={bank} onChangeText={setBank} placeholder="e.g. HDFC Bank" maxLength={40} />
          <Field label="Network">
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {(["Visa", "Mastercard", "RuPay", "Amex"] as const).map((n) => (
                <Chip key={n} label={n} selected={network === n} onPress={() => setNetwork(n)} />
              ))}
            </View>
          </Field>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextField label="Last 4 digits" value={last4} onChangeText={(v) => setLast4(v.replace(/\D/g, "").slice(0, 4))} placeholder="1234" keyboardType="number-pad" style={{ flex: 1 }} hint="Optional" />
            <TextField label="Available limit" value={limit} onChangeText={setLimit} prefix="₹" placeholder="100000" keyboardType="decimal-pad" style={{ flex: 1.2 }} hint="So the optimiser skips cards that can't take the bill" />
          </View>
          <Notice tone="grey" icon="lock">
            Never enter a full card number. This prototype has nowhere to put one and does not ask for it.
          </Notice>
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
  offerRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.bg, borderRadius: radius.sm, padding: 8 },
});
