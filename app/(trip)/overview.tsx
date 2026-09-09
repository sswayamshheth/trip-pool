import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ExpenseRow } from "@/components/expense-row";
import { Avatar, AvatarStack, Button, Card, EmptyState, Icon, IconButton, ListRow, Money, Notice, Pill, Screen, SectionTitle, Tappable, type IconName } from "@/components/kit";
import { colors, radius, space, type } from "@/constants/design";
import { formatDateRange, formatRelative } from "@/lib/dates";
import { buildNameLookup, describeEvent } from "@/lib/ledger/describe";
import { useTrip } from "@/lib/ledger/hooks";
import { analysePayments } from "@/lib/ledger/offers";
import { useStore } from "@/lib/ledger/store";
import { formatMoney } from "@/lib/money";

export default function OverviewScreen() {
  const router = useRouter();
  const store = useStore();
  const trip = useTrip();

  if (!store.ready) {
    return (
      <Screen tabs>
        <Text style={type.bodyMuted}>Loading…</Text>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen title="Trip" tabs>
        <EmptyState icon="groups" title="No trip open" message="Pick a group from your trips." action={<Button label="Back to trips" icon="groups" onPress={() => router.replace("/(home)/trips")} />} />
      </Screen>
    );
  }

  const { state, ledger, budget, viewerId } = trip;
  const me = viewerId ? ledger.balances[viewerId] : null;
  const myEstimate = viewerId ? (budget.estimatedPerParticipant[viewerId] ?? 0) : 0;
  const outgoing = ledger.transfers.filter((t) => t.from === viewerId);
  const incoming = ledger.transfers.filter((t) => t.to === viewerId);
  const awaitingMe = ledger.pendingSettlements.filter((s) => s.to === viewerId);
  const myPending = ledger.pendingSettlements.filter((s) => s.from === viewerId);
  const recent = [...trip.events].reverse().slice(0, 3);
  const names = buildNameLookup(trip.events, viewerId);
  const settlementsById = new Map(state.settlements.map((s) => [s.id, s]));
  const balances = state.participants.map((p) => ({ p, b: ledger.balances[p.id] })).sort((a, b) => b.b.netPaise - a.b.netPaise);
  const nothingForMe = outgoing.length === 0 && incoming.length === 0 && awaitingMe.length === 0 && myPending.length === 0;
  const analysis = analysePayments(state);

  const tools: { label: string; sub: string; icon: IconName; bg: string; fg: string; to: string }[] = [
    { label: "Who pays?", sub: "Card optimiser", icon: "credit-card", bg: colors.blueSoft, fg: colors.blue, to: "/optimizer" },
    { label: "Savings", sub: `${formatMoney(analysis.capturedPaise)} captured`, icon: "insights", bg: colors.mint, fg: colors.mintText, to: "/analyser" },
    { label: "Vendors", sub: budget.vendorOutstandingPaise ? `${formatMoney(budget.vendorOutstandingPaise)} due` : "all settled", icon: "storefront", bg: colors.amber, fg: colors.amberText, to: "/vendors" },
    { label: "Kitty", sub: `${formatMoney(ledger.totals.contributionsPaise)} in`, icon: "savings", bg: colors.lavender, fg: colors.lavenderText, to: "/funding" },
  ];

  return (
    <Screen
      tabs
      back
      title={state.trip.name}
      subtitle={`${state.trip.destination} · ${formatDateRange(state.trip.startDate, state.trip.endDate)}`}
      right={
        <View style={{ flexDirection: "row", gap: 2 }}>
          <IconButton icon="group" label="Members" onPress={() => router.push("/members")} />
          <IconButton icon="settings" label="Trip settings" onPress={() => router.push("/settings")} />
        </View>
      }
    >
      {trip.isClosed ? (
        <Notice tone="grey" icon="flag" title="This trip is closed">
          The ledger is frozen. Reopen it from the trip statement if something still needs recording.
        </Notice>
      ) : null}

      <Tappable onPress={() => router.push("/members")} label="Members" style={styles.membersRow}>
        <AvatarStack names={state.participants.map((p) => p.name)} size={26} max={6} />
        <Text style={[type.small, { color: colors.blueText, fontWeight: "700" }]}>{state.participants.length} members</Text>
        <Icon name="chevron-right" size={16} color={colors.blue} />
      </Tappable>

      <Card tone="ink" style={styles.hero}>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Planned</Text>
            <Text style={styles.heroAmount}>{formatMoney(budget.estimatedPaise)}</Text>
            <Text style={styles.heroMeta}>{budget.items.length} itinerary items</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Spent</Text>
            <Text style={styles.heroAmount}>{formatMoney(ledger.totals.spendPaise)}</Text>
            <Text style={styles.heroMeta}>
              {budget.variancePaise === 0 ? "on plan" : budget.variancePaise > 0 ? `${formatMoney(budget.variancePaise)} over` : `${formatMoney(-budget.variancePaise)} under`}
            </Text>
          </View>
        </View>
        {me ? (
          <View style={styles.heroPosition}>
            <View style={{ flex: 1 }}>
              <Text style={[type.label, { color: "#91B8EE" }]}>{me.netPaise > 0 ? "You are owed" : me.netPaise < 0 ? "You owe" : "Your position"}</Text>
              <Text style={[styles.heroPositionAmount, { color: me.netPaise > 0 ? "#7FE3B6" : me.netPaise < 0 ? "#FFB3B8" : colors.white }]}>
                {me.netPaise === 0 ? "Settled" : formatMoney(Math.abs(me.netPaise))}
              </Text>
              <Text style={styles.heroMeta}>
                paid {formatMoney(me.paidPaise - me.refundsReceivedPaise)} · share {formatMoney(me.sharePaise)} · estimate {formatMoney(myEstimate)}
                {me.pendingPaise ? ` · ${formatMoney(Math.abs(me.pendingPaise))} awaiting confirmation` : ""}
              </Text>
            </View>
            <Button label="Settle up" small variant="secondary" onPress={() => router.push("/(trip)/settle")} />
          </View>
        ) : null}
      </Card>

      <View style={styles.tools}>
        {tools.map((t) => (
          <Tappable key={t.label} onPress={() => router.push(t.to as never)} label={t.label} style={styles.tool}>
            <View style={[styles.toolIcon, { backgroundColor: t.bg }]}>
              <Icon name={t.icon} size={19} color={t.fg} />
            </View>
            <Text style={[type.small, { fontWeight: "700", color: colors.ink }]}>{t.label}</Text>
            <Text style={type.caption} numberOfLines={1}>
              {t.sub}
            </Text>
          </Tappable>
        ))}
      </View>

      <SectionTitle title="What's next" />
      <Card style={{ gap: 4 }}>
        {nothingForMe ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Icon name="check-circle" size={22} color={colors.mintText} />
            <Text style={[type.body, { flex: 1 }]}>{ledger.transfers.length === 0 ? "Everyone is settled. Nothing to do." : "Nothing for you to pay or receive right now."}</Text>
          </View>
        ) : null}
        {awaitingMe.map((s) => (
          <ListRow
            key={s.id}
            left={<Avatar name={trip.fullName(s.from)} size={36} />}
            title={`${trip.short(s.from)} says they paid you`}
            subtitle={`${formatMoney(s.amountPaise)} via ${s.method === "upi" ? "UPI" : "cash"}${s.reference ? ` · ${s.reference}` : ""}`}
            right={<Pill label="Confirm" tone="amber" icon="schedule" />}
            onPress={() => router.push("/(trip)/settle")}
            label={`Confirm payment from ${trip.short(s.from)}`}
          />
        ))}
        {outgoing.map((t) => (
          <ListRow
            key={`${t.from}-${t.to}`}
            left={<Avatar name={trip.fullName(t.to)} size={36} />}
            title={`Pay ${trip.short(t.to)}`}
            subtitle={trip.participant(t.to)?.upiId ?? "No UPI ID on file"}
            right={<Money paise={t.amountPaise} style={{ color: colors.coralText }} />}
            onPress={() => router.push({ pathname: "/pay", params: { from: t.from, to: t.to, amount: String(t.amountPaise) } })}
            chevron
          />
        ))}
        {myPending.map((s) => (
          <ListRow key={s.id} left={<Avatar name={trip.fullName(s.to)} size={36} />} title={`You paid ${trip.short(s.to)}`} subtitle={`Waiting for ${trip.short(s.to)} to confirm`} right={<Pill label="Pending" tone="amber" icon="schedule" />} onPress={() => router.push("/(trip)/settle")} />
        ))}
        {incoming.map((t) => (
          <ListRow key={`${t.from}-${t.to}-in`} left={<Avatar name={trip.fullName(t.from)} size={36} />} title={`${trip.short(t.from)} pays you`} subtitle="Recommended transfer" right={<Money paise={t.amountPaise} style={{ color: colors.mintText }} />} onPress={() => router.push("/(trip)/settle")} />
        ))}
      </Card>

      <SectionTitle title="Balances" action="Members" onAction={() => router.push("/members")} />
      <Card style={{ paddingVertical: 4 }}>
        {balances.map(({ p, b }, i) => (
          <ListRow
            key={p.id}
            left={<Avatar name={p.name} size={36} />}
            title={trip.isViewer(p.id) ? `${p.name} (you)` : p.name}
            subtitle={`paid ${formatMoney(b.paidPaise - b.refundsReceivedPaise)} · share ${formatMoney(b.sharePaise)}`}
            right={
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Money paise={b.netPaise} tone="auto" signed />
                <Text style={type.caption}>{b.netPaise > 0 ? "gets back" : b.netPaise < 0 ? "owes" : "settled"}</Text>
              </View>
            }
            onPress={() => router.push({ pathname: "/members/[id]", params: { id: p.id } })}
            style={i < balances.length - 1 ? styles.rowBorder : undefined}
          />
        ))}
        <Text style={[type.caption, { paddingVertical: 8 }]}>
          {ledger.transfers.length === 0 ? "Fully settled" : `${ledger.transfers.length} payment${ledger.transfers.length === 1 ? "" : "s"} settle the trip`} · balances reconcile to {formatMoney(ledger.reconciliationPaise)}
        </Text>
      </Card>

      <SectionTitle title="Recent expenses" action="See all" onAction={() => router.push("/(trip)/expenses")} />
      {ledger.expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon="receipt-long"
            title="Nothing spent yet"
            message={budget.items.length ? "Record a payment against an itinerary item when someone actually pays." : "Add the itinerary first, then record what gets paid."}
            action={<Button label={budget.items.length ? "Record a payment" : "Plan the trip"} icon={budget.items.length ? "paid" : "event-note"} onPress={() => router.push(budget.items.length ? "/expense/form" : "/(trip)/itinerary")} />}
          />
        </Card>
      ) : (
        [...ledger.expenses]
          .sort((a, b) => (a.expense.date < b.expense.date ? 1 : -1))
          .slice(0, 3)
          .map((item) => <ExpenseRow key={item.expense.id} item={item} trip={trip} compact />)
      )}

      <SectionTitle title="Recent activity" action="Full trail" onAction={() => router.push("/(trip)/activity")} />
      <Card style={{ paddingVertical: 4 }}>
        {recent.map((e, i) => {
          const d = describeEvent(e, names, { settlements: settlementsById });
          return (
            <ListRow
              key={e.id}
              left={
                <View style={styles.eventIcon}>
                  <Icon name={d.icon as IconName} size={18} color={colors.ink2} />
                </View>
              }
              title={d.title}
              subtitle={`${formatRelative(e.ts)} · ${d.detail}`}
              right={d.amountPaise !== undefined ? <Money paise={d.amountPaise} style={{ fontSize: 13 }} /> : undefined}
              style={i < recent.length - 1 ? styles.rowBorder : undefined}
            />
          );
        })}
      </Card>

      <View style={styles.actions}>
        <Button label="Add expense" icon="add" onPress={() => router.push("/expense/form")} disabled={trip.isClosed} />
        <Button label="Plan an item" icon="event-note" variant="secondary" onPress={() => router.push("/itinerary/form")} disabled={trip.isClosed} />
        <Button label={trip.isClosed ? "Trip statement" : "Close trip"} icon="flag" variant="ghost" onPress={() => router.push("/close")} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  membersRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  hero: { gap: space.lg, padding: space.xl },
  heroAmount: { color: colors.white, fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.7, marginTop: 4, fontVariant: ["tabular-nums"] },
  heroMeta: { color: "#B6C6DA", fontSize: 12, marginTop: 4 },
  heroPosition: { flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#2D4668", paddingTop: space.lg },
  heroPositionAmount: { fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  tools: { flexDirection: "row", gap: 8 },
  tool: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 2, minHeight: 88 },
  toolIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  eventIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 4 },
});
