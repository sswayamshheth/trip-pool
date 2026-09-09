import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, ListRow, Notice, Screen, SectionTitle } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useFeedback } from "@/lib/feedback";
import { useTrip } from "@/lib/ledger/hooks";
import { useStore } from "@/lib/ledger/store";
import { formatMoney } from "@/lib/money";

export default function SettingsScreen() {
  const router = useRouter();
  const store = useStore();
  const trip = useTrip();
  const { confirm, toast } = useFeedback();

  const resetDemo = async () => {
    const ok = await confirm({ title: "Reload the demo trip?", message: "Your current trips are replaced with the six-person Manali demo. This cannot be undone.", confirmLabel: "Reload demo", destructive: true });
    if (ok) {
      store.resetDemo();
      toast("Demo trip loaded", "success");
      router.replace("/overview");
    }
  };

  const clearAll = async () => {
    const ok = await confirm({ title: "Delete all trips?", message: "Every trip, expense and payment on this device is removed.", confirmLabel: "Delete everything", destructive: true });
    if (ok) {
      store.clearAll();
      toast("All data cleared", "info");
      router.replace("/");
    }
  };

  const deleteTrip = async () => {
    if (!trip) return;
    const ok = await confirm({ title: `Delete "${trip.state.trip.name}"?`, message: "The whole trip and its history are removed from this device.", confirmLabel: "Delete trip", destructive: true });
    if (ok) {
      store.deleteTrip(trip.id);
      toast("Trip deleted", "info");
      router.replace("/");
    }
  };

  return (
    <Screen title="Settings" back>
      {trip ? (
        <>
          <SectionTitle title="You are" />
          <Card style={{ gap: 12 }}>
            <Text style={type.small}>{"The app shows balances and \"what's next\" from this person's point of view. Switch to demo the group from anyone's side."}</Text>
            <View style={styles.chips}>
              {trip.state.participants.map((p) => (
                <Chip key={p.id} label={p.name} selected={trip.isViewer(p.id)} onPress={() => store.setViewer(p.id, trip.id)} left={<Avatar name={p.name} size={20} />} />
              ))}
            </View>
          </Card>

          <SectionTitle title="This trip" />
          <Card style={{ paddingVertical: 4 }}>
            <ListRow title="Edit trip details" subtitle={`${trip.state.trip.destination} · ${trip.state.trip.startDate} → ${trip.state.trip.endDate}`} onPress={() => router.push({ pathname: "/trips/new", params: { id: trip.id } })} chevron style={styles.rowBorder} />
            <ListRow title="Members" subtitle={`${trip.state.participants.length} people`} onPress={() => router.push("/members")} chevron style={styles.rowBorder} />
            <ListRow title="All groups" subtitle={`${store.trips.length} trip${store.trips.length === 1 ? "" : "s"} on this device`} onPress={() => router.replace("/")} chevron />
          </Card>

          <SectionTitle title="Ledger integrity" />
          <Card style={{ gap: 6 }}>
            <Text style={type.body}>
              {trip.events.length} events · {trip.ledger.expenses.length} expenses · {trip.state.refunds.length} refunds · {trip.state.settlements.length} payments
            </Text>
            <Text style={[type.small, { color: trip.ledger.reconciliationPaise === 0 ? colors.mintText : colors.coralText, fontWeight: "700" }]}>
              Sum of all balances: {formatMoney(trip.ledger.reconciliationPaise)} {trip.ledger.reconciliationPaise === 0 ? "· reconciles exactly" : "· does not reconcile"}
            </Text>
            <Text style={type.caption}>All amounts are integer paise. Balances are recomputed from the event log on every change; nothing is stored as a running total.</Text>
          </Card>
        </>
      ) : null}

      <SectionTitle title="Data" />
      <Card style={{ gap: 10 }}>
        <Text style={type.small}>Everything is stored on this device. Replacing storage with an API means posting the same events to a server — the ledger logic does not change.</Text>
        <View style={styles.actions}>
          <Button label="Reload demo trip" icon="refresh" variant="secondary" onPress={resetDemo} />
          {trip ? <Button label="Delete this trip" icon="delete-outline" variant="ghost" onPress={deleteTrip} /> : null}
          <Button label="Clear all data" icon="delete-forever" variant="ghost" onPress={clearAll} />
        </View>
      </Card>

      <Notice tone="grey" icon="info-outline" title="GroupTrip Ledger · prototype">
        The itinerary is the ledger: bookings, participation and time are the primary keys, money is derived. Deterministic arithmetic only — no AI computes a balance.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
