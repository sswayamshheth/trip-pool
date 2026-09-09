import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Icon, ListRow, Money, Notice, Screen, SectionTitle, Stat } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useFeedback } from "@/lib/feedback";
import { analysePayments } from "@/lib/ledger/offers";
import { useStore } from "@/lib/ledger/store";
import { formatMoney, sumPaise } from "@/lib/money";

export default function ProfileScreen() {
  const router = useRouter();
  const store = useStore();
  const { confirm, toast } = useFeedback();

  const name = store.session?.name ?? "You";
  const totalSaved = sumPaise(
    store.trips.map((t) => {
      const analysis = analysePayments(t.state);
      return analysis.byMember.find((m) => m.participantId === t.viewerId)?.capturedPaise ?? 0;
    }),
  );
  const tripsClosed = store.trips.filter((t) => t.state.trip.status === "closed").length;
  const spendShare = sumPaise(store.trips.map((t) => (t.viewerId ? (t.ledger.balances[t.viewerId]?.sharePaise ?? 0) : 0)));

  const signOut = async () => {
    const ok = await confirm({ title: "Sign out?", message: "Your trips stay on this device and come back when you sign in again.", confirmLabel: "Sign out" });
    if (ok) {
      store.signOut();
      router.replace("/login");
    }
  };

  const resetDemo = async () => {
    const ok = await confirm({ title: "Reload the demo trip?", message: "Your current trips are replaced with the six-person Manali demo. This cannot be undone.", confirmLabel: "Reload demo", destructive: true });
    if (ok) {
      store.resetDemo();
      toast("Demo trip loaded", "success");
      router.replace("/(home)/trips");
    }
  };

  const clearAll = async () => {
    const ok = await confirm({ title: "Delete all trips?", message: "Every trip, expense and payment on this device is removed.", confirmLabel: "Delete everything", destructive: true });
    if (ok) {
      store.clearAll();
      toast("All data cleared", "info");
      router.replace("/(home)/trips");
    }
  };

  return (
    <Screen title="Profile" tabs>
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar name={name} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={type.title} numberOfLines={1}>
              {name}
            </Text>
            <Text style={type.small}>{store.session?.phone ?? "Not signed in"}</Text>
          </View>
        </View>
      </Card>

      <View style={styles.stats}>
        <Stat label="Trips" value={String(store.trips.length)} sub={tripsClosed ? `${tripsClosed} closed` : "all active"} tone="blue" />
        <Stat label="Your share" value={formatMoney(spendShare)} sub="across every trip" />
        <Stat label="Card savings" value={formatMoney(totalSaved)} sub="offers you captured" tone="mint" />
      </View>

      <SectionTitle title="Payments" />
      <Card style={{ paddingVertical: 4 }}>
        <ListRow title="Payment methods" subtitle="Cards and the offers they unlock" onPress={() => router.push("/payments/methods")} chevron style={styles.rowBorder} left={<Icon name="credit-card" size={20} color={colors.ink2} />} />
        <ListRow title="Pay a UPI ID" subtitle="Anyone, in or out of a trip" onPress={() => router.push("/payments/send")} chevron style={styles.rowBorder} left={<Icon name="alternate-email" size={20} color={colors.ink2} />} />
        <ListRow title="Scan a QR" subtitle="Parse any upi://pay code" onPress={() => router.push("/payments/scan")} chevron left={<Icon name="qr-code-scanner" size={20} color={colors.ink2} />} />
      </Card>

      <SectionTitle title="Your trips" />
      <Card style={{ paddingVertical: 4 }}>
        {store.trips.length === 0 ? (
          <Text style={[type.bodyMuted, { paddingVertical: 10 }]}>No trips yet.</Text>
        ) : (
          store.trips.map((t, i) => {
            const me = t.viewerId ? t.ledger.balances[t.viewerId] : null;
            return (
              <ListRow
                key={t.id}
                title={t.state.trip.name}
                subtitle={`${t.state.participants.length} members · ${formatMoney(t.ledger.budget.estimatedPaise)} planned`}
                right={me ? <Money paise={me.netPaise} tone="auto" signed style={{ fontSize: 14 }} /> : undefined}
                onPress={() => {
                  store.switchTrip(t.id);
                  router.push("/(trip)/overview");
                }}
                chevron
                style={i < store.trips.length - 1 ? styles.rowBorder : undefined}
              />
            );
          })
        )}
      </Card>

      <SectionTitle title="Data" />
      <Card style={{ gap: 10 }}>
        <Text style={type.small}>Everything is stored on this device as an append-only event log. Replacing storage with an API means posting the same events to a server — the ledger logic does not change.</Text>
        <View style={styles.actions}>
          <Button label="Reload demo trip" icon="refresh" variant="secondary" onPress={resetDemo} />
          <Button label="Clear all data" icon="delete-forever" variant="ghost" onPress={clearAll} />
          <Button label="Sign out" icon="logout" variant="ghost" onPress={signOut} />
        </View>
      </Card>

      <Notice tone="grey" icon="info-outline" title="GroupTrip Ledger · prototype">
        The itinerary is the ledger: bookings, participation and time are the primary keys, and money is derived. All arithmetic is deterministic — no model computes a balance.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
