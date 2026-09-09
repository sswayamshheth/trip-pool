import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { ExpenseRow } from "@/components/expense-row";
import { Avatar, Button, Card, EmptyState, Icon, Money, Notice, Pill, Screen, SectionTitle, Stat, TextLink } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useFeedback, useGuarded } from "@/lib/feedback";
import { removalBlocker, removeParticipant } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";
import { useStore } from "@/lib/ledger/store";
import { formatMoney } from "@/lib/money";

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const trip = useTrip();
  const store = useStore();
  const guarded = useGuarded();
  const { confirm, toast } = useFeedback();

  const p = trip?.participant(id ?? "");
  if (!trip || !p) {
    return (
      <Screen title="Member" back>
        <EmptyState icon="person-off" title="Member not found" message="They may have left the trip." action={<Button label="Back to members" onPress={() => router.replace("/members")} />} />
      </Screen>
    );
  }

  const b = trip.ledger.balances[p.id];
  const involved = trip.ledger.expenses.filter((c) => c.expense.participants.some((x) => x.participantId === p.id) || c.expense.payers.some((x) => x.participantId === p.id));
  const blocker = removalBlocker(trip.state, p.id);
  const outgoing = trip.ledger.transfers.filter((t) => t.from === p.id);
  const incoming = trip.ledger.transfers.filter((t) => t.to === p.id);

  const onRemove = async () => {
    if (blocker) {
      toast(blocker, "error");
      return;
    }
    const affected = trip.state.expenses.filter((e) => e.participants.some((x) => x.participantId === p.id)).length;
    const ok = await confirm({
      title: `Remove ${p.name} from the trip?`,
      message: affected ? `They will be taken off ${affected} expense${affected === 1 ? "" : "s"} and everyone else's shares on those will re-derive.` : "They are not part of any expense.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    if (guarded(() => trip.append(removeParticipant(trip.state, p.id, { actor: trip.actor })), `${p.name} removed · shares re-derived`)) router.back();
  };

  const copyUpi = async () => {
    if (!p.upiId) return;
    await Clipboard.setStringAsync(p.upiId);
    toast(`Copied ${p.upiId}`, "success");
  };

  return (
    <Screen title={p.name} subtitle={trip.isViewer(p.id) ? "This is you" : undefined} back right={<Button label="Edit" icon="edit" small variant="secondary" onPress={() => router.push({ pathname: "/members/form", params: { id: p.id } })} />}>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={p.name} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.label}>{b.netPaise > 0 ? "Gets back" : b.netPaise < 0 ? "Owes" : "Balance"}</Text>
            <Money paise={Math.abs(b.netPaise)} style={{ fontSize: 26, lineHeight: 32, color: b.netPaise > 0 ? colors.mintText : b.netPaise < 0 ? colors.coralText : colors.ink }} />
          </View>
          <Pill label={b.netPaise > 0 ? "Creditor" : b.netPaise < 0 ? "Debtor" : "Settled"} tone={b.netPaise > 0 ? "mint" : b.netPaise < 0 ? "coral" : "grey"} />
        </View>
        <View style={styles.upiRow}>
          <Icon name="qr-code-2" size={18} color={p.upiId ? colors.blue : colors.faint} />
          <Text style={[type.body, { flex: 1 }, !p.upiId && { color: colors.muted }]} numberOfLines={1}>
            {p.upiId ?? "No UPI ID yet"}
          </Text>
          {p.upiId ? <TextLink label="Copy" icon="content-copy" onPress={copyUpi} /> : <TextLink label="Add UPI ID" onPress={() => router.push({ pathname: "/members/form", params: { id: p.id } })} />}
        </View>
        {p.phone ? <Text style={type.small}>Phone {p.phone}</Text> : null}
      </Card>

      <View style={styles.stats}>
        <Stat label="Paid to vendors" value={formatMoney(b.paidPaise)} sub={b.refundsReceivedPaise ? `− ${formatMoney(b.refundsReceivedPaise)} refunds received` : undefined} />
        <Stat label="Their shares" value={formatMoney(b.sharePaise)} sub={`across ${involved.filter((c) => c.expense.participants.some((x) => x.participantId === p.id)).length} expenses`} />
        <Stat label="Settled" value={formatMoney(b.settledOutPaise + b.settledInPaise)} sub={b.pendingPaise ? `${formatMoney(Math.abs(b.pendingPaise))} pending` : "confirmed payments"} />
      </View>

      <SectionTitle title="Cards" />
      <Card style={{ gap: 10 }}>
        {(p.paymentMethods ?? []).length === 0 ? (
          <Text style={type.bodyMuted}>No cards registered. The optimiser can only recommend a card it knows about.</Text>
        ) : (
          (p.paymentMethods ?? []).map((m) => (
            <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Icon name="credit-card" size={18} color={colors.lavenderText} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]}>{m.label}</Text>
                <Text style={type.caption}>{m.bank}{m.last4 ? " · ••" + m.last4 : ""}</Text>
              </View>
              {m.headroomPaise !== undefined ? <Money paise={m.headroomPaise} style={{ fontSize: 13 }} /> : null}
            </View>
          ))
        )}
        <Button label="Manage cards" icon="credit-card" small variant="secondary" onPress={() => router.push({ pathname: "/members/methods", params: { id: p.id } })} />
      </Card>

      <Notice tone="blue" icon="calculate" title="How this balance is derived">
        {`${formatMoney(b.paidPaise)} paid − ${formatMoney(b.refundsReceivedPaise)} refunds + ${formatMoney(b.settledOutPaise)} sent − ${formatMoney(b.settledInPaise)} received − ${formatMoney(b.sharePaise)} shares = ${formatMoney(b.netPaise, { signed: true })}`}
      </Notice>

      {outgoing.length || incoming.length ? (
        <>
          <SectionTitle title="To settle" />
          <Card style={{ gap: 8 }}>
            {outgoing.map((t) => (
              <View key={t.to} style={styles.transfer}>
                <Text style={[type.body, { flex: 1 }]}>
                  Pays {trip.name(t.to)}
                </Text>
                <Money paise={t.amountPaise} style={{ color: colors.coralText }} />
                <Button label="Record" small variant="secondary" onPress={() => router.push({ pathname: "/pay", params: { from: t.from, to: t.to, amount: String(t.amountPaise) } })} />
              </View>
            ))}
            {incoming.map((t) => (
              <View key={t.from} style={styles.transfer}>
                <Text style={[type.body, { flex: 1 }]}>
                  Receives from {trip.name(t.from)}
                </Text>
                <Money paise={t.amountPaise} style={{ color: colors.mintText }} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Expenses involved" count={involved.length} />
      {involved.length === 0 ? (
        <Card>
          <Text style={type.bodyMuted}>Not part of any expense yet.</Text>
        </Card>
      ) : (
        involved.map((item) => <ExpenseRow key={item.expense.id} item={item} trip={trip} compact />)
      )}

      <View style={styles.actions}>
        {!trip.isViewer(p.id) ? <Button label="View as this member" icon="visibility" variant="ghost" onPress={() => { store.setViewer(p.id, trip.id); toast(`Now viewing as ${p.name}`, "info"); }} /> : null}
        <Button label="Remove from trip" icon="person-remove" variant="ghost" onPress={onRemove} disabled={!!blocker} accessibilityLabel={blocker ? `Cannot remove: ${blocker}` : "Remove from trip"} />
      </View>
      {blocker ? <Text style={type.caption}>{blocker}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  upiRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bg, borderRadius: 12, padding: 10 },
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  transfer: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
