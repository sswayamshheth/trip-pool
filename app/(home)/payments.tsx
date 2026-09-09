import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Stat, Tappable, type IconName } from "@/components/kit";
import { colors, radius, type } from "@/constants/design";
import { formatRelative } from "@/lib/dates";
import { analysePayments } from "@/lib/ledger/offers";
import { useStore } from "@/lib/ledger/store";
import type { SettlementData } from "@/lib/ledger/types";
import { formatMoney, sumPaise } from "@/lib/money";

/**
 * Payments across every trip: what you owe, what's coming to you, the cards
 * you've registered, and everything that has moved. Nothing here holds money —
 * UPI hands off to the phone's own app.
 */
export default function PaymentsScreen() {
  const router = useRouter();
  const store = useStore();

  const data = useMemo(() => {
    const outgoing: { tripId: string; tripName: string; from: string; to: string; toName: string; upiId?: string; amountPaise: number }[] = [];
    const incoming: typeof outgoing = [];
    const pending: { tripId: string; tripName: string; settlement: SettlementData; fromName: string; toName: string; mine: boolean }[] = [];
    const history: { tripId: string; tripName: string; settlement: SettlementData; fromName: string; toName: string }[] = [];
    const cards: { tripId: string; tripName: string; label: string; bank: string; last4?: string; headroomPaise?: number }[] = [];
    let savings = 0;

    for (const t of store.trips) {
      const me = t.viewerId;
      const nameOf = (id: string) => t.state.participants.find((p) => p.id === id)?.name ?? "Former member";
      for (const tr of t.ledger.transfers) {
        const row = { tripId: t.id, tripName: t.state.trip.name, from: tr.from, to: tr.to, toName: nameOf(tr.to), upiId: t.state.participants.find((p) => p.id === tr.to)?.upiId, amountPaise: tr.amountPaise };
        if (tr.from === me) outgoing.push(row);
        else if (tr.to === me) incoming.push(row);
      }
      for (const s of t.ledger.pendingSettlements) {
        if (s.from === me || s.to === me) pending.push({ tripId: t.id, tripName: t.state.trip.name, settlement: s, fromName: nameOf(s.from), toName: nameOf(s.to), mine: s.from === me });
      }
      for (const s of t.state.settlements) {
        if (s.status !== "confirmed") continue;
        if (s.from === me || s.to === me) history.push({ tripId: t.id, tripName: t.state.trip.name, settlement: s, fromName: nameOf(s.from), toName: nameOf(s.to) });
      }
      const meParticipant = t.state.participants.find((p) => p.id === me);
      for (const m of meParticipant?.paymentMethods ?? []) {
        cards.push({ tripId: t.id, tripName: t.state.trip.name, label: m.label, bank: m.bank, last4: m.last4, headroomPaise: m.headroomPaise });
      }
      const analysis = analysePayments(t.state);
      savings += analysis.byMember.find((x) => x.participantId === me)?.capturedPaise ?? 0;
    }
    history.sort((a, b) => (b.settlement.confirmedTs ?? 0) - (a.settlement.confirmedTs ?? 0));
    const uniqueCards = cards.filter((c, i) => cards.findIndex((x) => x.label === c.label && x.bank === c.bank) === i);
    return { outgoing, incoming, pending, history, cards: uniqueCards, savings };
  }, [store.trips]);

  const owe = sumPaise(data.outgoing.map((o) => o.amountPaise));
  const due = sumPaise(data.incoming.map((o) => o.amountPaise));

  const actions: { label: string; sub: string; icon: IconName; tone: string; fg: string; onPress: () => void }[] = [
    { label: "Scan QR", sub: "Any UPI QR", icon: "qr-code-scanner", tone: colors.blueSoft, fg: colors.blue, onPress: () => router.push("/payments/scan") },
    { label: "Pay UPI ID", sub: "name@bank", icon: "alternate-email", tone: colors.mint, fg: colors.mintText, onPress: () => router.push("/payments/send") },
    { label: "Methods", sub: "Cards & offers", icon: "credit-card", tone: colors.lavender, fg: colors.lavenderText, onPress: () => router.push("/payments/methods") },
  ];

  return (
    <Screen title="Payments" subtitle="Across every trip" tabs>
      <View style={styles.stats}>
        <Stat label="You owe" value={formatMoney(owe)} sub={`${data.outgoing.length} transfer${data.outgoing.length === 1 ? "" : "s"}`} tone={owe ? "coral" : undefined} />
        <Stat label="Coming to you" value={formatMoney(due)} sub={`${data.incoming.length} transfer${data.incoming.length === 1 ? "" : "s"}`} tone={due ? "mint" : undefined} />
        <Stat label="Card savings" value={formatMoney(data.savings)} sub="offers you captured" tone="blue" />
      </View>

      <View style={styles.actions}>
        {actions.map((a) => (
          <Tappable key={a.label} onPress={a.onPress} label={a.label} style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: a.tone }]}>
              <Icon name={a.icon} size={22} color={a.fg} />
            </View>
            <Text style={[type.body, { fontWeight: "700" }]}>{a.label}</Text>
            <Text style={type.caption}>{a.sub}</Text>
          </Tappable>
        ))}
      </View>

      {data.pending.length ? (
        <>
          <SectionTitle title="Awaiting confirmation" count={data.pending.length} />
          <Card style={{ gap: 4 }}>
            {data.pending.map(({ settlement, tripName, tripId, fromName, toName, mine }, i) => (
              <Tappable
                key={settlement.id}
                onPress={() => {
                  store.switchTrip(tripId);
                  router.push("/(trip)/settle");
                }}
                label={`Open ${tripName}`}
                style={[styles.row, i < data.pending.length - 1 && styles.rowBorder]}
              >
                <Avatar name={mine ? toName : fromName} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                    {mine ? `You paid ${toName}` : `${fromName} says they paid you`}
                  </Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {tripName} · {formatRelative(settlement.initiatedTs)}
                  </Text>
                </View>
                <Money paise={settlement.amountPaise} style={{ fontSize: 14 }} />
                <Pill label={mine ? "Sent" : "Confirm"} tone="amber" small icon="schedule" />
              </Tappable>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="To pay" count={data.outgoing.length} />
      {data.outgoing.length === 0 ? (
        <Card>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check-circle" size={22} color={colors.mintText} />
            <Text style={[type.body, { flex: 1 }]}>Nothing to pay right now.</Text>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          {data.outgoing.map((o, i) => (
            <Tappable
              key={`${o.tripId}-${o.to}`}
              onPress={() => {
                store.switchTrip(o.tripId);
                router.push({ pathname: "/pay", params: { from: o.from, to: o.to, amount: String(o.amountPaise) } });
              }}
              label={`Pay ${o.toName}`}
              style={[styles.row, i < data.outgoing.length - 1 && styles.rowBorder]}
            >
              <Avatar name={o.toName} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                  Pay {o.toName}
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {o.tripName} · {o.upiId ?? "no UPI ID on file"}
                </Text>
              </View>
              <Money paise={o.amountPaise} style={{ color: colors.coralText }} />
              <Icon name="chevron-right" size={18} color={colors.faint} />
            </Tappable>
          ))}
        </Card>
      )}

      {data.cards.length ? (
        <>
          <SectionTitle title="Your cards" count={data.cards.length} action="Manage" onAction={() => router.push("/payments/methods")} />
          <Card style={{ gap: 4 }}>
            {data.cards.map((c, i) => (
              <View key={`${c.label}-${c.bank}`} style={[styles.row, i < data.cards.length - 1 && styles.rowBorder]}>
                <View style={[styles.actionIcon, { backgroundColor: colors.lavender, width: 34, height: 34, borderRadius: 11 }]}>
                  <Icon name="credit-card" size={17} color={colors.lavenderText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[type.body, { fontWeight: "700" }]}>{c.label}</Text>
                  <Text style={type.caption}>
                    {c.bank}
                    {c.last4 ? ` · ••${c.last4}` : ""}
                  </Text>
                </View>
                {c.headroomPaise !== undefined ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Money paise={c.headroomPaise} style={{ fontSize: 13 }} />
                    <Text style={type.caption}>available</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : (
        <Notice tone="amber" icon="credit-card-off" title="No cards registered">
          The optimiser can only recommend a card it knows about. Add yours from a trip&apos;s Members screen — bank and last four digits only.
        </Notice>
      )}

      <SectionTitle title="History" count={data.history.length} />
      {data.history.length === 0 ? (
        <Card>
          <EmptyState icon="history" title="No payments yet" message="Confirmed settlements appear here, across every trip." />
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          {data.history.slice(0, 12).map(({ settlement, tripName, fromName, toName }, i) => (
            <View key={settlement.id} style={[styles.row, i < Math.min(12, data.history.length) - 1 && styles.rowBorder]}>
              <Icon name="check-circle" size={20} color={colors.mintText} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                  {fromName} → {toName}
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {tripName} · {formatRelative(settlement.confirmedTs ?? settlement.initiatedTs)} · {settlement.method === "upi" ? "UPI" : "Cash"}
                  {settlement.reference ? ` · ${settlement.reference}` : ""}
                </Text>
              </View>
              <Money paise={settlement.amountPaise} style={{ fontSize: 14 }} />
            </View>
          ))}
        </Card>
      )}

      <Notice tone="grey" icon="shield" title="No money passes through this app">
        Payments hand off to your own UPI app; what is recorded here is who paid whom, when, and for what.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 8 },
  actionCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 3, minHeight: 100 },
  actionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
