import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { Button, Card, EmptyState, Notice, Screen, TextField } from "@/components/kit";
import { useFeedback, useOnce } from "@/lib/feedback";
import { addParticipant, CommandError, updateParticipant, validateParticipant } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";

export default function MemberFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();
  const existing = id ? trip?.participant(id) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [upiId, setUpiId] = useState(existing?.upiId ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => (trip ? validateParticipant(trip.state, { name, upiId, phone }, existing?.id) : {}), [trip, name, upiId, phone, existing?.id]);

  const save = useOnce(() => {
    if (!trip) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0] ?? "Check the highlighted fields", "error");
      return;
    }
    try {
      trip.append(existing ? updateParticipant(trip.state, existing.id, { name, upiId, phone }, { actor: trip.actor }) : addParticipant(trip.state, { name, upiId, phone }, { actor: trip.actor }));
      toast(existing ? "Member updated" : `${name.trim()} added to the trip`, "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not save", "error");
    }
  });

  if (!trip) {
    return (
      <Screen title="Add member" back>
        <EmptyState icon="group" title="No trip selected" />
      </Screen>
    );
  }
  if (id && !existing) {
    return (
      <Screen title="Edit member" back>
        <EmptyState icon="person-off" title="Member not found" />
      </Screen>
    );
  }

  return (
    <Screen title={existing ? "Edit member" : "Add member"} back footer={<Button label={existing ? "Save changes" : "Add to trip"} icon={existing ? "check" : "person-add-alt-1"} full onPress={save} />}>
      <Card style={{ gap: 14 }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Full name" autoFocus={!existing} error={submitted ? errors.name : undefined} maxLength={40} autoCapitalize="words" />
        <TextField
          label="UPI ID"
          value={upiId}
          onChangeText={(v) => setUpiId(v.replace(/\s/g, ""))}
          placeholder="name@bank"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          error={submitted ? errors.upiId : undefined}
          hint="Optional now, needed to receive UPI payments. e.g. rohit@ybl, priya@oksbi"
        />
        <TextField label="Phone (optional)" value={phone} onChangeText={setPhone} placeholder="98765 43210" keyboardType="phone-pad" maxLength={20} />
      </Card>
      {!existing ? (
        <Notice tone="blue" icon="info-outline">
          New members start with no shares. Add them to the expenses they are part of and their balance derives from there.
        </Notice>
      ) : null}
    </Screen>
  );
}
