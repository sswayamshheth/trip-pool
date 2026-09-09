import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { Button, Card, EmptyState, Screen, TextField } from "@/components/kit";
import { useFeedback, useOnce } from "@/lib/feedback";
import { CommandError, updateTrip, validateTrip } from "@/lib/ledger/commands";
import { useTrip } from "@/lib/ledger/hooks";

export default function EditTripScreen() {
  const router = useRouter();
  const trip = useTrip();
  const { toast } = useFeedback();

  const [name, setName] = useState(trip?.state.trip.name ?? "");
  const [destination, setDestination] = useState(trip?.state.trip.destination ?? "");
  const [startDate, setStartDate] = useState(trip?.state.trip.startDate ?? "");
  const [endDate, setEndDate] = useState(trip?.state.trip.endDate ?? "");
  const [description, setDescription] = useState(trip?.state.trip.description ?? "");
  const [submitted, setSubmitted] = useState(false);

  const errors = useMemo(() => validateTrip({ name, destination, startDate, endDate }), [name, destination, startDate, endDate]);

  const save = useOnce(() => {
    if (!trip) return;
    setSubmitted(true);
    if (Object.keys(errors).length) {
      toast(Object.values(errors)[0]!, "error");
      return;
    }
    try {
      trip.append(updateTrip(trip.state, { name, destination, startDate, endDate, description }, { actor: trip.actor }));
      toast("Trip updated", "success");
      router.back();
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not save", "error");
    }
  });

  if (!trip) {
    return (
      <Screen title="Trip details" back>
        <EmptyState icon="edit" title="No trip open" />
      </Screen>
    );
  }

  return (
    <Screen title="Trip details" back footer={<Button label="Save changes" icon="check" full onPress={save} />}>
      <Card style={{ gap: 14 }}>
        <TextField label="Trip name" value={name} onChangeText={setName} error={submitted ? errors.name : undefined} maxLength={60} autoFocus />
        <TextField label="Destination" value={destination} onChangeText={setDestination} error={submitted ? errors.destination : undefined} maxLength={60} />
        <TextField label="Start" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" error={submitted ? errors.startDate : undefined} />
        <TextField label="End" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" error={submitted ? errors.endDate : undefined} />
        <TextField label="Description (optional)" value={description} onChangeText={setDescription} multiline maxLength={200} />
      </Card>
    </Screen>
  );
}
