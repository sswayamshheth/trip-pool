import { useMemo } from "react";

import { firstName } from "@/lib/names";
import { useActiveTrip, useStore } from "./store";
import type { ParticipantData, ParticipantId } from "./types";

/**
 * Everything a screen needs about the active trip, with name helpers that
 * say "You" for the viewer. Returns null when no trip is open.
 */
export function useTrip() {
  const active = useActiveTrip();
  const store = useStore();
  return useMemo(() => {
    if (!active) return null;
    const byId = new Map<ParticipantId, ParticipantData>();
    for (const p of active.state.participants) byId.set(p.id, p);
    const viewerId = active.viewerId;
    const name = (id: ParticipantId | "system") => (id === "system" ? "System" : id === viewerId ? "You" : (byId.get(id)?.name ?? "Former member"));
    const short = (id: ParticipantId | "system") => (id === "system" ? "System" : id === viewerId ? "You" : firstName(byId.get(id)?.name ?? "Former member"));
    const fullName = (id: ParticipantId) => byId.get(id)?.name ?? "Former member";
    /** "Your" for the viewer, "Rohit's" for anyone else — never "You's". */
    const possessive = (id: ParticipantId | "system") => (id === viewerId ? "Your" : `${short(id)}'s`);
    /** Lower-case form for mid-sentence use: "your share" / "Rohit's share". */
    const possessiveLower = (id: ParticipantId | "system") => (id === viewerId ? "your" : `${short(id)}'s`);
    return {
      ...active,
      budget: active.ledger.budget,
      viewerId,
      name,
      short,
      fullName,
      possessive,
      possessiveLower,
      participant: (id: ParticipantId) => byId.get(id),
      isViewer: (id: ParticipantId) => id === viewerId,
      isClosed: active.state.trip.status === "closed",
      append: (events: Parameters<typeof store.append>[0]) => store.append(events, active.id),
    };
  }, [active, store]);
}

export type TripCtx = NonNullable<ReturnType<typeof useTrip>>;
