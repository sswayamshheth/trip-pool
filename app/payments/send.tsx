import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, EmptyState, Money, Notice, Screen, SectionTitle, Tappable, TextField } from "@/components/kit";
import { colors, type } from "@/constants/design";
import { useFeedback, useOnce } from "@/lib/feedback";
import { isValidUpiId, upiIntentUrl } from "@/lib/ledger/commands";
import { useStore } from "@/lib/ledger/store";
import { formatMoney, parseAmount } from "@/lib/money";

/** Pay any UPI ID directly. Group settlements go through the trip instead. */
export default function SendPaymentScreen() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useFeedback();

  const [upi, setUpi] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const parsed = parseAmount(amount);
  const upiValid = isValidUpiId(upi);

  /** Everyone across your trips who has a UPI ID — the realistic payee list. */
  const payees = useMemo(() => {
    const seen = new Map<string, { name: string; upiId: string; trips: string[]; owedPaise: number; from?: string; to?: string; tripId?: string }>();
    for (const t of store.trips) {
      for (const p of t.state.participants) {
        if (!p.upiId || p.id === t.viewerId) continue;
        const row = seen.get(p.upiId) ?? { name: p.name, upiId: p.upiId, trips: [], owedPaise: 0 };
        row.trips.push(t.state.trip.name);
        const transfer = t.ledger.transfers.find((x) => x.from === t.viewerId && x.to === p.id);
        if (transfer) {
          row.owedPaise += transfer.amountPaise;
          row.from = transfer.from;
          row.to = transfer.to;
          row.tripId = t.id;
        }
        seen.set(p.upiId, row);
      }
    }
    return [...seen.values()].sort((a, b) => b.owedPaise - a.owedPaise);
  }, [store.trips]);

  const pay = useOnce(async () => {
    if (!upiValid) {
      toast("Enter a valid UPI ID, like name@bank", "error");
      return;
    }
    if (parsed.error || !parsed.paise) {
      toast(parsed.error ?? "Enter an amount", "error");
      return;
    }
    const url = upiIntentUrl({ vpa: upi.trim(), name: name.trim() || upi.trim(), amountPaise: parsed.paise, note: note.trim() || undefined });
    if (Platform.OS === "web") {
      toast("On a phone this opens your UPI app with the payee and amount filled in", "info");
      return;
    }
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else toast("No UPI app found on this device", "error");
    } catch {
      toast("Could not open a UPI app", "error");
    }
  });

  return (
    <Screen
      title="Pay a UPI ID"
      subtitle="Opens your own UPI app"
      back
      footer={<Button label={`Open UPI app${parsed.paise ? ` · ${formatMoney(parsed.paise)}` : ""}`} icon="open-in-new" full onPress={pay} disabled={!upiValid || !parsed.paise} />}
    >
      <Card style={{ gap: 14 }}>
        <TextField
          label="UPI ID"
          value={upi}
          onChangeText={(v) => setUpi(v.replace(/\s/g, ""))}
          placeholder="name@bank"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoFocus
          error={upi && !upiValid ? "UPI IDs look like name@bank" : undefined}
        />
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Who is this?" maxLength={40} autoCapitalize="words" />
        <TextField label="Amount" value={amount} onChangeText={setAmount} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" error={amount && parsed.error ? parsed.error : undefined} />
        <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="What's it for?" maxLength={50} />
      </Card>

      <SectionTitle title="People in your trips" count={payees.length} />
      {payees.length === 0 ? (
        <Card>
          <EmptyState icon="group" title="Nobody with a UPI ID yet" message="Add UPI IDs to your trip members and they'll show up here." />
        </Card>
      ) : (
        <Card style={{ gap: 4 }}>
          {payees.map((p, i) => (
            <Tappable
              key={p.upiId}
              onPress={() => {
                setUpi(p.upiId);
                setName(p.name);
                if (p.owedPaise > 0) setAmount((p.owedPaise / 100).toFixed(p.owedPaise % 100 ? 2 : 0));
              }}
              label={`Pay ${p.name}`}
              style={[styles.row, i < payees.length - 1 && styles.rowBorder]}
            >
              <Avatar name={p.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {p.upiId} · {p.trips.join(", ")}
                </Text>
              </View>
              {p.owedPaise > 0 ? (
                <View style={{ alignItems: "flex-end" }}>
                  <Money paise={p.owedPaise} style={{ fontSize: 13, color: colors.coralText }} />
                  <Text style={type.caption}>you owe</Text>
                </View>
              ) : null}
            </Tappable>
          ))}
        </Card>
      )}

      <Notice tone="amber" icon="swap-horiz" title="Settling with someone in a trip?">
        Pay them from the trip&apos;s Settle tab instead — that records the payment against the ledger so the balances update. This screen is for paying anyone else.
      </Notice>

      <Button label="Go to my trips" icon="groups" variant="ghost" onPress={() => router.replace("/(home)/trips")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
