import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, Chip, EmptyState, Field, Icon, Money, Notice, Screen, SectionTitle, TextField } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { useFeedback, useGuarded, useOnce } from "@/lib/feedback";
import { addPaymentMethod, CommandError, removePaymentMethod } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import { KNOWN_CARDS, offersForMethod } from "@/lib/ledger/offers";
import type { PaymentMethod } from "@/lib/ledger/types";
import { parseAmount } from "@/lib/money";

/** Cards for one member of a trip. Metadata only — never a card number. */
export default function MemberMethodsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip();
  const guarded = useGuarded();
  const { toast, confirm } = useFeedback();

  const [label, setLabel] = useState("");
  const [bank, setBank] = useState("");
  const [network, setNetwork] = useState<PaymentMethod["network"]>("Visa");
  const [last4, setLast4] = useState("");
  const [limit, setLimit] = useState("");

  const person = trip?.participant(id ?? "");

  const save = useOnce(() => {
    if (!trip || !person) return;
    if (!label.trim() || !bank.trim()) {
      toast("Name the card and its bank", "error");
      return;
    }
    const parsedLimit = limit ? parseAmount(limit) : { paise: undefined, error: undefined };
    if (limit && parsedLimit.error) {
      toast(parsedLimit.error, "error");
      return;
    }
    try {
      trip.append(addPaymentMethod(trip.state, person.id, { label, bank, kind: "credit-card", network, last4: last4 || undefined, headroomPaise: parsedLimit.paise }, { actor: trip.actor }));
      toast(`${label.trim()} added for ${trip.short(person.id)}`, "success");
      setLabel("");
      setBank("");
      setLast4("");
      setLimit("");
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not add the card", "error");
    }
  });

  if (!trip || !person) {
    return (
      <Screen title="Cards" back>
        <EmptyState icon="credit-card-off" title="Member not found" action={<Button label="Back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  const methods = person.paymentMethods ?? [];

  return (
    <Screen title={`${trip.possessive(person.id)} cards`} subtitle="Bank, network and last four digits only" back>
      <Notice tone="blue" icon="shield">
        The optimiser can only recommend a card it knows about. Nothing here identifies an account — a full card number is never asked for or stored.
      </Notice>

      <SectionTitle title="Registered" count={methods.length} />
      {methods.length === 0 ? (
        <Card>
          <EmptyState icon="credit-card-off" title="No cards yet" message={`Add ${trip.possessiveLower(person.id)} cards so the optimiser can weigh them against everyone else's.`} />
        </Card>
      ) : (
        methods.map((m) => {
          const offers = offersForMethod(m);
          return (
            <Card key={m.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={styles.cardIcon}>
                  <Icon name="credit-card" size={20} color={colors.lavenderText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{m.label}</Text>
                  <Text style={type.caption}>
                    {m.bank}
                    {m.network ? ` · ${m.network}` : ""}
                    {m.last4 ? ` · ••${m.last4}` : ""}
                  </Text>
                </View>
                {m.headroomPaise !== undefined ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Money paise={m.headroomPaise} style={{ fontSize: 13 }} />
                    <Text style={type.caption}>available</Text>
                  </View>
                ) : null}
              </View>
              {offers.length ? (
                <View style={{ gap: 6 }}>
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
                <Text style={type.caption}>No curated offer matches this card.</Text>
              )}
              <Button
                label="Remove"
                variant="ghost"
                small
                accessibilityLabel={`Remove ${m.label}`}
                onPress={async () => {
                  const ok = await confirm({ title: `Remove ${m.label}?`, message: "The optimiser stops considering it.", confirmLabel: "Remove", destructive: true });
                  if (ok) guarded(() => trip.append(removePaymentMethod(trip.state, person.id, m.id, { actor: trip.actor })), `${m.label} removed`);
                }}
              />
            </Card>
          );
        })
      )}

      <SectionTitle title="Add a card" />
      <Card style={{ gap: 14 }}>
        <Field label="Common cards" hint="Tap one to fill the fields, or type your own.">
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
          <TextField label="Available limit" value={limit} onChangeText={setLimit} prefix="₹" placeholder="100000" keyboardType="decimal-pad" style={{ flex: 1.2 }} hint="Optional" />
        </View>
        <Button label="Add card" icon="add" onPress={save} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.lavender, alignItems: "center", justifyContent: "center" },
  offerRow: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.bg, borderRadius: radius.sm, padding: 8 },
});
