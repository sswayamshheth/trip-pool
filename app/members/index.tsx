import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, ListRow, Money, Notice, Pill, Screen } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useTrip } from "@/lib/ledger/hooks";
import { formatMoney } from "@/lib/money";

export default function MembersScreen() {
  const router = useRouter();
  const trip = useTrip();

  if (!trip) {
    return (
      <Screen title="Members" back>
        <EmptyState icon="group" title="No trip selected" />
      </Screen>
    );
  }

  const { state, ledger } = trip;
  const rows = state.participants.map((p) => ({ p, b: ledger.balances[p.id] }));
  const missingUpi = rows.filter(({ p }) => !p.upiId).length;

  return (
    <Screen title="Members" subtitle={`${rows.length} on this trip`} back right={<Button label="Add" accessibilityLabel="Add member" icon="person-add-alt-1" small onPress={() => router.push("/members/form")} />}>
      {missingUpi ? (
        <Notice tone="amber" icon="qr-code-2">
          {`${missingUpi} member${missingUpi === 1 ? " has" : "s have"} no UPI ID yet. Add one so payments can go straight to them.`}
        </Notice>
      ) : null}
      <Card style={{ paddingVertical: 4 }}>
        {rows.map(({ p, b }, i) => (
          <ListRow
            key={p.id}
            left={<Avatar name={p.name} size={40} />}
            title={trip.isViewer(p.id) ? `${p.name} (you)` : p.name}
            subtitle={p.upiId ?? "No UPI ID"}
            right={
              <View style={{ alignItems: "flex-end", gap: 3 }}>
                <Money paise={b.netPaise} tone="auto" signed />
                <Pill label={b.netPaise > 0 ? "gets back" : b.netPaise < 0 ? "owes" : "settled"} tone={b.netPaise > 0 ? "mint" : b.netPaise < 0 ? "coral" : "grey"} small />
              </View>
            }
            onPress={() => router.push({ pathname: "/members/[id]", params: { id: p.id } })}
            chevron
            style={i < rows.length - 1 ? styles.rowBorder : undefined}
          />
        ))}
      </Card>
      <Text style={type.caption}>
        Totals: paid {formatMoney(rows.reduce((s, r) => s + r.b.paidPaise - r.b.refundsReceivedPaise, 0))} · shares {formatMoney(rows.reduce((s, r) => s + r.b.sharePaise, 0))} · net {formatMoney(ledger.reconciliationPaise)}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
