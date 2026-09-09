import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Stat, Tappable } from "@/components/kit";
import { colors, radius, space, type } from "@/constants/design";
import { useTrip } from "@/lib/ledger/hooks";
import { analysePayments } from "@/lib/ledger/offers";
import { formatMoney } from "@/lib/money";

/** What each payment actually saved, and what the best card would have saved. */
export default function AnalyserScreen() {
  const router = useRouter();
  const trip = useTrip();
  const analysis = useMemo(() => (trip ? analysePayments(trip.state) : null), [trip]);

  if (!trip || !analysis) {
    return (
      <Screen title="Savings analyser" back>
        <EmptyState icon="insights" title="No trip open" />
      </Screen>
    );
  }

  const captureRate = analysis.potentialPaise > 0 ? analysis.capturedPaise / analysis.potentialPaise : 1;

  return (
    <Screen title="Savings analyser" subtitle={`${formatMoney(analysis.capturedPaise)} captured across ${analysis.payments.length} payments`} back>
      <Card tone="ink" style={{ gap: 14, padding: space.xl }}>
        <View>
          <Text style={[type.label, { color: "#91B8EE" }]}>Captured with card offers</Text>
          <Text style={styles.big}>{formatMoney(analysis.capturedPaise)}</Text>
          <Text style={styles.meta}>off {formatMoney(trip.ledger.totals.grossPaise + analysis.capturedPaise)} of bills — money the group never had to split</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, captureRate * 100)}%` }]} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.meta}>{Math.round(captureRate * 100)}% of what was available</Text>
            <Text style={styles.meta}>{analysis.missedPaise > 0 ? `${formatMoney(analysis.missedPaise)} left on the table` : "nothing missed"}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.stats}>
        <Stat label="Captured" value={formatMoney(analysis.capturedPaise)} sub="actually discounted" tone="mint" />
        <Stat label="Available" value={formatMoney(analysis.potentialPaise)} sub="with the best card each time" />
        <Stat label="Missed" value={formatMoney(analysis.missedPaise)} sub={analysis.missedPaise ? "a different card would have saved more" : "best card used every time"} tone={analysis.missedPaise ? "amber" : undefined} />
      </View>

      {analysis.byCard.length ? (
        <>
          <SectionTitle title="By card" count={analysis.byCard.length} />
          <Card style={{ gap: 4 }}>
            {analysis.byCard.map((c, i) => (
              <View key={c.label} style={[styles.row, i < analysis.byCard.length - 1 && styles.rowBorder]}>
                <View style={[styles.icon, { backgroundColor: colors.lavender }]}>
                  <Icon name="credit-card" size={18} color={colors.lavenderText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{c.label}</Text>
                  <Text style={type.caption}>
                    {c.bank} · {c.count} payment{c.count === 1 ? "" : "s"}
                  </Text>
                </View>
                <Money paise={c.capturedPaise} style={{ color: colors.mintText }} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {analysis.byMember.length ? (
        <>
          <SectionTitle title="By member" count={analysis.byMember.length} />
          <Card style={{ gap: 4 }}>
            {analysis.byMember.map((m, i) => (
              <View key={m.participantId} style={[styles.row, i < analysis.byMember.length - 1 && styles.rowBorder]}>
                <Avatar name={m.name} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{trip.name(m.participantId)}</Text>
                  <Text style={type.caption}>
                    put {m.count} bill{m.count === 1 ? "" : "s"} on their card for the group
                  </Text>
                </View>
                <Money paise={m.capturedPaise} style={{ color: colors.mintText }} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Every payment" count={analysis.payments.length} />
      {analysis.payments.length === 0 ? (
        <Card>
          <EmptyState icon="insights" title="No payments yet" message="Once someone pays a bill, this shows what the card earned and whether another card would have done better." />
        </Card>
      ) : (
        analysis.payments.map((p) => (
          <Tappable key={p.expense.id} onPress={() => router.push({ pathname: "/expense/[id]", params: { id: p.expense.id } })} label={`Open ${p.expense.title}`} style={styles.paymentCard}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                  {p.expense.title}
                </Text>
                <Text style={type.caption}>
                  {formatMoney(p.expense.amountPaise)} paid by {trip.short(p.payerId)}
                  {p.method ? ` · ${p.method.label}` : " · no card recorded"}
                </Text>
              </View>
              {p.capturedPaise > 0 ? <Pill label={`saved ${formatMoney(p.capturedPaise)}`} tone="mint" small /> : <Pill label="no offer" tone="grey" small />}
            </View>
            {p.missedPaise > 0 && p.bestOption ? (
              <View style={styles.missRow}>
                <Icon name="lightbulb-outline" size={15} color={colors.amberText} />
                <Text style={[type.caption, { flex: 1, color: colors.amberText }]}>
                  {trip.possessive(p.bestOption.participantId)} {p.bestOption.method.label} would have saved {formatMoney(p.bestPossiblePaise)} — {formatMoney(p.missedPaise)} more
                </Text>
              </View>
            ) : p.capturedPaise > 0 ? (
              <View style={styles.missRow}>
                <Icon name="check-circle" size={15} color={colors.mintText} />
                <Text style={[type.caption, { flex: 1, color: colors.mintText }]}>
                  Best available card was used{p.offer ? ` · ${p.offer.title}` : ""}
                </Text>
              </View>
            ) : null}
          </Tappable>
        ))
      )}

      <Notice tone="blue" icon="verified-user" title="Deterministic, not guessed">
        Every figure here comes from the same rules engine the optimiser uses. No model estimates a discount — the offer, its cap and the bill decide it.
      </Notice>

      <Button label="Plan the next payment" icon="credit-card" variant="secondary" onPress={() => router.push("/optimizer")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { color: colors.white, fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -1, marginTop: 4, fontVariant: ["tabular-nums"] },
  meta: { color: "#B6C6DA", fontSize: 12, marginTop: 3 },
  track: { height: 7, borderRadius: 4, backgroundColor: "#27456D", overflow: "hidden" },
  fill: { height: 7, borderRadius: 4, backgroundColor: "#7FE3B6" },
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  paymentCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 },
  missRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg, borderRadius: radius.sm, padding: 8 },
});
