import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";

import { createTrip as createTripCommand, type TripInput } from "./commands";
import { buildDemoEvents, DEMO_TRIP_ID, DEMO_VIEWER_ID } from "./demo";
import { computeLedger, type Ledger } from "./engine";
import { reduceEvents } from "./reduce";
import type { LedgerEvent, ParticipantId, TripState } from "./types";

/**
 * The store holds one append-only event log per trip and persists it. Trip
 * state, the budget and every balance are derived from the log on read
 * (memoised), never stored. Swapping AsyncStorage for a backend means posting
 * events to an API and replaying the same reducer server-side — nothing else
 * changes.
 */

const STORAGE_KEY = "grouptrip-ledger/v2";
const LEGACY_KEY = "grouptrip-ledger/v1";

export type Session = { phone: string; name: string; signedInAt: number };

type Persisted = {
  version: 2;
  tripOrder: string[];
  logs: Record<string, LedgerEvent[]>;
  activeTripId: string | null;
  /** Which participant "you" are, per trip. */
  viewer: Record<string, ParticipantId>;
  session: Session | null;
};

type Action =
  | { type: "hydrate"; data: Persisted }
  | { type: "append"; tripId: string; events: LedgerEvent[] }
  | { type: "createTrip"; tripId: string; events: LedgerEvent[]; viewerId?: ParticipantId }
  | { type: "deleteTrip"; tripId: string }
  | { type: "switchTrip"; tripId: string | null }
  | { type: "setViewer"; tripId: string; participantId: ParticipantId }
  | { type: "signIn"; session: Session }
  | { type: "signOut" }
  | { type: "reset"; data: Persisted };

function empty(session: Session | null = null): Persisted {
  return { version: 2, tripOrder: [], logs: {}, activeTripId: null, viewer: {}, session };
}

export function demoData(now = Date.now(), session: Session | null = null): Persisted {
  return {
    version: 2,
    tripOrder: [DEMO_TRIP_ID],
    logs: { [DEMO_TRIP_ID]: buildDemoEvents(now) },
    activeTripId: null,
    viewer: { [DEMO_TRIP_ID]: DEMO_VIEWER_ID },
    session,
  };
}

function reducer(state: Persisted, action: Action): Persisted {
  switch (action.type) {
    case "hydrate":
    case "reset":
      return action.data;
    case "append": {
      const log = state.logs[action.tripId];
      if (!log) return state;
      return { ...state, logs: { ...state.logs, [action.tripId]: [...log, ...action.events] } };
    }
    case "createTrip":
      return {
        ...state,
        tripOrder: [action.tripId, ...state.tripOrder],
        logs: { ...state.logs, [action.tripId]: action.events },
        activeTripId: action.tripId,
        viewer: action.viewerId ? { ...state.viewer, [action.tripId]: action.viewerId } : state.viewer,
      };
    case "deleteTrip": {
      const { [action.tripId]: _removed, ...logs } = state.logs;
      const { [action.tripId]: _v, ...viewer } = state.viewer;
      const tripOrder = state.tripOrder.filter((id) => id !== action.tripId);
      return { ...state, logs, viewer, tripOrder, activeTripId: state.activeTripId === action.tripId ? null : state.activeTripId };
    }
    case "switchTrip":
      if (action.tripId === null) return { ...state, activeTripId: null };
      return state.logs[action.tripId] ? { ...state, activeTripId: action.tripId } : state;
    case "setViewer":
      return { ...state, viewer: { ...state.viewer, [action.tripId]: action.participantId } };
    case "signIn":
      return { ...state, session: action.session };
    case "signOut":
      return { ...state, session: null, activeTripId: null };
    default:
      return state;
  }
}

export type TripSummary = { id: string; state: TripState; ledger: Ledger; viewerId: ParticipantId | null; events: LedgerEvent[] };

type StoreApi = {
  ready: boolean;
  session: Session | null;
  trips: TripSummary[];
  activeTripId: string | null;
  /** Append events to a trip's log (defaults to the active trip). */
  append: (events: LedgerEvent | LedgerEvent[], tripId?: string) => void;
  createTrip: (input: TripInput, opts?: { actor?: ParticipantId | "system" }) => string;
  deleteTrip: (tripId: string) => void;
  switchTrip: (tripId: string | null) => void;
  setViewer: (participantId: ParticipantId, tripId?: string) => void;
  signIn: (session: Omit<Session, "signedInAt">) => void;
  signOut: () => void;
  resetDemo: () => void;
  clearAll: () => void;
};

const StoreContext = createContext<StoreApi | null>(null);

function isPersisted(value: unknown): value is Persisted {
  if (!value || typeof value !== "object") return false;
  const v = value as Persisted;
  return v.version === 2 && Array.isArray(v.tripOrder) && typeof v.logs === "object" && v.logs !== null;
}

export function LedgerStoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, empty());
  const hydrated = useRef(false);
  const [ready, setReady] = useReducer(() => true, false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: Persisted | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isPersisted(parsed)) next = parsed;
        } else {
          // A v1 log used a different itinerary-free shape; start fresh rather than half-migrate.
          await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
        }
      } catch (error) {
        console.warn("[ledger] could not read saved data, starting from the demo", error);
      }
      if (cancelled) return;
      dispatch({ type: "hydrate", data: next ?? demoData() });
      hydrated.current = true;
      setReady();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch((error) => console.warn("[ledger] could not save", error));
  }, [data]);

  const trips = useMemo<TripSummary[]>(() => {
    const out: TripSummary[] = [];
    for (const id of data.tripOrder) {
      const state = reduceEvents(data.logs[id] ?? []);
      if (!state) continue;
      const viewer = data.viewer[id];
      out.push({
        id,
        state,
        ledger: computeLedger(state),
        viewerId: viewer && state.participants.some((p) => p.id === viewer) ? viewer : (state.participants[0]?.id ?? null),
        events: data.logs[id] ?? [],
      });
    }
    return out;
  }, [data.logs, data.tripOrder, data.viewer]);

  const append = useCallback(
    (events: LedgerEvent | LedgerEvent[], tripId?: string) => {
      const id = tripId ?? data.activeTripId;
      if (!id) return;
      dispatch({ type: "append", tripId: id, events: Array.isArray(events) ? events : [events] });
    },
    [data.activeTripId],
  );

  const api = useMemo<StoreApi>(
    () => ({
      ready,
      session: data.session,
      trips,
      activeTripId: data.activeTripId,
      append,
      createTrip: (input, opts) => {
        const { tripId, events } = createTripCommand(input, { actor: opts?.actor ?? "system" });
        dispatch({ type: "createTrip", tripId, events });
        return tripId;
      },
      deleteTrip: (tripId) => dispatch({ type: "deleteTrip", tripId }),
      switchTrip: (tripId) => dispatch({ type: "switchTrip", tripId }),
      setViewer: (participantId, tripId) => {
        const id = tripId ?? data.activeTripId;
        if (id) dispatch({ type: "setViewer", tripId: id, participantId });
      },
      signIn: (session) => dispatch({ type: "signIn", session: { ...session, signedInAt: Date.now() } }),
      signOut: () => dispatch({ type: "signOut" }),
      resetDemo: () => dispatch({ type: "reset", data: demoData(Date.now(), data.session) }),
      clearAll: () => dispatch({ type: "reset", data: empty(data.session) }),
    }),
    [ready, trips, data.activeTripId, data.session, append],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside LedgerStoreProvider");
  return ctx;
}

/** The active trip with its derived ledger, or null when no trip is open. */
export function useActiveTrip(): (TripSummary & { actor: ParticipantId | "system" }) | null {
  const store = useStore();
  const summary = store.trips.find((t) => t.id === store.activeTripId) ?? null;
  if (!summary) return null;
  return { ...summary, actor: summary.viewerId ?? "system" };
}
