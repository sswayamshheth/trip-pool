import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle } from "@/components/kit";
import { colors, radius, space, type } from "@/constants/design";
import { formatRelative } from "@/lib/dates";
import { useFeedback, useGuarded } from "@/lib/feedback";
import { cancelSettlement, confirmSettlement } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import type { SettlementData } from "@/lib/ledger/types";
import { formatMoney } from "@/lib/money";

export default function SettleScreen() {
  const router = useRouter();
  const trip = useTrip();
  const guarded = useGuarded();
  const { confirm } = useFeedback();

  if (!trip) {
    return (
      <Screen title="Settle up" back tabs>
        <EmptyState icon="swap-horiz" title="No trip selected" message="Create a trip first." action={<Button label="Create a trip" onPress={() => router.push("/trips/new")} />} />
      </Screen>
    );
  }

  const { ledger, state, viewerId } = trip;
  const pending = ledger.pendingSettlements;
  const history = [...state.settlements].filter((s) => s.status !== "initiated").sort((a, b) => (b.confirmedTs ?? b.cancelledTs ?? b.initiatedTs) - (a.confirmedTs ?? a.cancelledTs ?? a.initiatedTs));
  const transfers = ledger.transfers;
  const saved = Math.max(0, ledger.naiveTransferCount - transfers.length);
  const allSettled = transfers.length === 0 && pending.length === 0;

  const onConfirm = (s: SettlementData) => {
    guarded(() => trip.append(confirmSettlement(state, s.id, { actor: trip.actor })), `${formatMoney(s.amountPaise)} from ${trip.short(s.from)} recorded as received`);
  };
  const onCancel = async (s: SettlementData) => {
    const ok = await confirm({ title: "Cancel this payment?", message: `${trip.name(s.from)} → ${trip.name(s.to)} · ${formatMoney(s.amountPaise)}. The balance goes back to unpaid.`, confirmLabel: "Cancel payment", destructive: true });
    if (ok) guarded(() => trip.append(cancelSettlement(state, s.id, { actor: trip.actor }, "Cancelled before confirmation")), "Payment cancelled");
  };

  return (
    <Screen title="Settle up" subtitle={allSettled ? "Everyone is square" : `${transfers.length + pending.length} payment${transfers.length + pending.length === 1 ? "" : "s"} to close the trip`} back tabs>
      <Card tone="ink" style={styles.hero}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroNumber}>{transfers.length}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{transfers.length === 0 ? (pending.length ? "Only confirmations left" : "Trip fully settled") : `${transfers.length} payment${transfers.length === 1 ? "" : "s"} settle the trip`}</Text>
            <Text style={styles.heroMeta}>
              {transfers.length === 0
                ? "Every balance is at zero once pending payments confirm."
                : `Instead of ${ledger.naiveTransferCount} if everyone paid back whoever fronted each bill${saved ? ` · ${saved} fewer transfer${saved === 1 ? "" : "s"}` : ""}`}
            </Text>
          </View>
        </View>
      </Card>

      {pending.length > 0 ? (
        <>
          <SectionTitle title="Awaiting confirmation" count={pending.length} />
          {pending.map((s) => (
            <Card key={s.id} style={{ gap: 12 }}>
              <TransferHeader from={trip.fullName(s.from)} to={trip.fullName(s.to)} fromLabel={trip.short(s.from)} toLabel={trip.short(s.to)} amount={s.amountPaise} status={<Pill label="Initiated" tone="amber" icon="schedule" />} />
              <Text style={type.small}>
                {trip.name(s.from)} marked this as paid {formatRelative(s.initiatedTs)} via {s.method === "upi" ? "UPI" : "cash"}
                {s.reference ? ` · ref ${s.reference}` : ""}. Balances update only when {trip.name(s.to)} confirms it arrived.
              </Text>
              <View style={styles.actions}>
                <Button label={viewerId === s.to ? "Confirm received" : `Confirm as ${trip.short(s.to)}`} icon="check" variant="success" small onPress={() => onConfirm(s)} />
                <Button label="Cancel" variant="ghost" small onPress={() => onCancel(s)} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle title="Recommended payments" count={transfers.length} />
      {transfers.length === 0 ? (
        <Card>
          <EmptyState icon="celebration" title={pending.length ? "Nothing more to pay" : "All settled"} message={pending.length ? "Once the pending payments above are confirmed, the trip is closed." : "Every member's balance is zero."} />
        </Card>
      ) : (
        transfers.map((t) => {
          const upi = trip.participant(t.to)?.upiId;
          const mine = t.from === viewerId;
          return (
            <Card key={`${t.from}-${t.to}`} style={{ gap: 12 }}>
              <TransferHeader from={trip.fullName(t.from)} to={trip.fullName(t.to)} fromLabel={trip.short(t.from)} toLabel={trip.short(t.to)} amount={t.amountPaise} status={<Pill label="Due" tone="coral" icon="arrow-forward" />} />
              <Text style={type.small}>{upi ? `Pay to ${upi}` : `${trip.name(t.to)} hasn't added a UPI ID yet — record a cash payment or ask them to add one.`}</Text>
              <View style={styles.actions}>
                <Button
                  label={mine ? "Pay via UPI" : `Record ${trip.possessiveLower(t.from)} payment`}
                  icon={mine ? "qr-code-2" : "payments"}
                  small
                  onPress={() => router.push({ pathname: "/pay", params: { from: t.from, to: t.to, amount: String(t.amountPaise) } })}
                />
              </View>
            </Card>
          );
        })
      )}

      <Notice icon="alt-route" tone="blue" title="How these payments are chosen">
        {"Every member's net balance (paid − their derived shares, adjusted for confirmed payments) is netted across the group. Balances that cancel each other out are paired directly, and the rest is settled largest-debtor to largest-creditor, so nobody pays someone who then pays someone else."}
      </Notice>

      <SectionTitle title="Payment history" count={history.length} />
      {history.length === 0 ? (
        <Card>
          <Text style={type.bodyMuted}>No confirmed payments yet.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {history.map((s, i) => (
            <View key={s.id} style={[styles.historyRow, i < history.length - 1 && styles.rowBorder]}>
              <Icon name={s.status === "confirmed" ? "check-circle" : "cancel"} size={20} color={s.status === "confirmed" ? colors.mintText : colors.faint} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                  {trip.short(s.from)} → {trip.short(s.to)}
                </Text>
                <Text style={type.caption}>
                  {s.status === "confirmed" ? `Confirmed ${formatRelative(s.confirmedTs ?? s.initiatedTs)}` : `Cancelled ${formatRelative(s.cancelledTs ?? s.initiatedTs)}`} · {s.method === "upi" ? "UPI" : "Cash"}
                  {s.reference ? ` · ${s.reference}` : ""}
                </Text>
              </View>
              <Money paise={s.amountPaise} style={s.status === "cancelled" ? { color: colors.faint, textDecorationLine: "line-through" } : undefined} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function TransferHeader({ from, to, fromLabel, toLabel, amount, status }: { from: string; to: string; fromLabel: string; toLabel: string; amount: number; status: React.ReactNode }) {
  return (
    <View style={styles.transfer}>
      <View style={styles.party}>
        <Avatar name={from} size={40} />
        <Text style={styles.partyName} numberOfLines={1}>
          {fromLabel}
        </Text>
      </View>
      <View style={styles.arrow}>
        <Money paise={amount} style={{ fontSize: 17 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <View style={styles.arrowLine} />
          <Icon name="arrow-forward" size={16} color={colors.muted} />
        </View>
        {status}
      </View>
      <View style={styles.party}>
        <Avatar name={to} size={40} />
        <Text style={styles.partyName} numberOfLines={1}>
          {toLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { padding: space.xl },
  heroBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: "#27456D", alignItems: "center", justifyContent: "center" },
  heroNumber: { color: colors.white, fontSize: 24, fontWeight: "800" },
  heroTitle: { color: colors.white, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  heroMeta: { color: "#B6C6DA", fontSize: 12, marginTop: 3, lineHeight: 17 },
  transfer: { flexDirection: "row", alignItems: "center", gap: 8 },
  party: { alignItems: "center", gap: 4, width: 76 },
  partyName: { ...type.small, fontWeight: "700", color: colors.ink },
  arrow: { flex: 1, alignItems: "center", gap: 4 },
  arrowLine: { width: 60, height: 2, backgroundColor: colors.line, borderRadius: 1 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  chip: { borderRadius: radius.pill },
});
