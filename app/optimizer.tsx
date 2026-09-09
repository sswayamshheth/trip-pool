import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Money, Notice, Pill, Screen, SectionTitle, TextField } from "@/components/kit";
import { colors, space, type } from "@/constants/design";
import { useTrip } from "@/lib/ledger/hooks";
import { optimisePayment, type OfferOption } from "@/lib/ledger/offers";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/ledger/types";
import { formatMoney, parseAmount } from "@/lib/money";

/**
 * Who should put this bill on which card. A deterministic constraint solve
 * over a curated offer dataset: bank, card, category, minimum spend, offer
 * cap and remaining credit headroom. Same inputs, same answer, every time.
 */
export default function OptimizerScreen() {
  const params = useLocalSearchParams<{ amount?: string; category?: string; vendor?: string; itemId?: string }>();
  const router = useRouter();
  const trip = useTrip();

  const item = params.itemId && trip ? trip.state.itinerary.find((i) => i.id === params.itemId) : undefined;
  const initialAmount = item ? item.actualPaise ?? item.estimatedPaise : Number(params.amount ?? 0);

  const [amount, setAmount] = useState(initialAmount > 0 ? (initialAmount / 100).toFixed(initialAmount % 100 ? 2 : 0) : "");
  const [category, setCategory] = useState<ExpenseCategory>((item?.category ?? (params.category as ExpenseCategory)) || "Stay");
  const [vendor, setVendor] = useState(item?.vendor ?? params.vendor ?? "");

  const parsed = parseAmount(amount);
  const amountPaise = parsed.paise ?? 0;

  const result = useMemo(() => {
    if (!trip || amountPaise <= 0) return null;
    return optimisePayment(trip.state.participants, { amountPaise, category, vendor: vendor.trim() || undefined });
  }, [trip, amountPaise, category, vendor]);

  if (!trip) {
    return (
      <Screen title="Who should pay?" back>
        <EmptyState icon="credit-card" title="No trip open" />
      </Screen>
    );
  }

  const withCards = trip.state.participants.filter((p) => (p.paymentMethods?.length ?? 0) > 0);

  return (
    <Screen title="Who should pay?" subtitle="Card-aware payment optimiser" back>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Bill amount" value={amount} onChangeText={setAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" autoFocus={!initialAmount} error={amount && parsed.error ? parsed.error : undefined} style={{ flex: 1.1 }} />
          <TextField label="Vendor (optional)" value={vendor} onChangeText={setVendor} placeholder="Hotel, operator…" style={{ flex: 1 }} />
        </View>
        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
        </Field>
      </Card>

      {withCards.length === 0 ? (
        <Notice tone="amber" icon="credit-card-off" title="No cards on file">
          The optimiser can only recommend a card it knows about. Add cards from Members — only the bank, network and last four digits are stored, never a card number.
        </Notice>
      ) : null}

      {result?.best ? (
        <>
          <Card tone="ink" style={{ gap: 14, padding: space.xl }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Recommended</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={result.best.participantName} size={46} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroName}>{trip.name(result.best.participantId)}</Text>
                <Text style={styles.heroMeta}>
                  {result.best.method.label} · {result.best.method.bank}
                  {result.best.method.last4 ? ` ••${result.best.method.last4}` : ""}
                </Text>
              </View>
            </View>
            <View style={styles.savingBox}>
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { color: "#91B8EE" }]}>Group saves</Text>
                <Text style={styles.saving}>{formatMoney(result.best.discountPaise)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type.label, { color: "#91B8EE" }]}>Group pays</Text>
                <Text style={styles.saving}>{formatMoney(amountPaise - result.best.discountPaise)}</Text>
              </View>
            </View>
            <Text style={styles.heroMeta}>
              {result.best.offer
                ? `${result.best.offer.title} — ${result.best.offer.terms}.`
                : "No offer applies to this bill, so pick anyone; this card simply has the headroom."}
              {result.runnerUp && result.edgePaise > 0
                ? ` That is ${formatMoney(result.edgePaise)} better than the next option (${trip.possessiveLower(result.runnerUp.participantId)} ${result.runnerUp.method.label}).`
                : ""}
            </Text>
            <Text style={[styles.heroMeta, { color: "#7FE3B6" }]}>
              The discount belongs to the group — it lowers the bill everyone shares. Points and cashback stay with the person whose card it was.
            </Text>
          </Card>

          {item ? (
            <Button
              label={`Record this payment by ${trip.short(result.best.participantId)}`}
              icon="paid"
              onPress={() =>
                router.push({
                  pathname: "/expense/form",
                  params: {
                    itineraryItemId: item.id,
                    payerId: result.best!.participantId,
                    methodId: result.best!.method.id,
                    discount: String(result.best!.discountPaise),
                    amount: String(amountPaise - result.best!.discountPaise),
                  },
                })
              }
            />
          ) : null}

          <SectionTitle title="Every option" count={result.options.length} />
          <Card style={{ gap: 4 }}>
            {result.options.map((o, i) => (
              <OptionRow key={`${o.participantId}-${o.method.id}`} option={o} best={i === 0} amountPaise={amountPaise} name={trip.name(o.participantId)} last={i === result.options.length - 1} />
            ))}
          </Card>
        </>
      ) : amountPaise > 0 && withCards.length > 0 ? (
        <Notice tone="grey" icon="search-off">
          No card on this trip can take a bill of {formatMoney(amountPaise)} — check the remaining limits on the members&apos; cards.
        </Notice>
      ) : (
        <Notice tone="grey" icon="calculate">
          Enter a bill amount to see who should pay it and on which card.
        </Notice>
      )}

      <Notice tone="blue" icon="rule" title="How the answer is reached">
        Offers are filtered by bank, card, network and category, then checked against minimum spend and the payer&apos;s remaining limit, and finally capped. Options are ranked by rupees saved, with ties broken on headroom — so the recommendation is reproducible, not a guess.
      </Notice>
    </Screen>
  );
}

function OptionRow({ option, best, amountPaise, name, last }: { option: OfferOption; best: boolean; amountPaise: number; name: string; last: boolean }) {
  return (
    <View style={[styles.optionRow, !last && styles.rowBorder]}>
      <Avatar name={option.participantName} size={32} muted={!option.affordable} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
            {name}
          </Text>
          {best ? <Pill label="Best" tone="mint" small /> : null}
        </View>
        <Text style={type.caption} numberOfLines={1}>
          {option.method.label} · {option.offer ? option.offer.title : "no offer applies"}
        </Text>
        {!option.affordable ? (
          <Text style={[type.caption, { color: colors.coralText }]}>
            Only {formatMoney(option.method.headroomPaise ?? 0)} of limit left — can&apos;t take {formatMoney(amountPaise)}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Money paise={option.discountPaise} style={{ fontSize: 14, color: option.discountPaise > 0 ? colors.mintText : colors.muted }} />
        <Text style={type.caption}>saved</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroName: { color: colors.white, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  heroMeta: { color: "#B6C6DA", fontSize: 12, lineHeight: 18 },
  savingBox: { flexDirection: "row", gap: 16, borderTopWidth: 1, borderTopColor: "#2D4668", paddingTop: 14 },
  saving: { color: "#7FE3B6", fontSize: 22, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
