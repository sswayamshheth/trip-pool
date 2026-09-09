import { newId } from "@/lib/id";
import { isValidIso } from "@/lib/dates";
import { allocate, isPaise, sumPaise, type Paise } from "@/lib/money";
import { computeBudget } from "./budget";
import { computeLedger } from "./engine";
import type {
  ContributionData,
  ExpenseCategory,
  ExpenseData,
  ExpenseId,
  ItineraryItem,
  ItineraryItemId,
  LedgerEvent,
  ParticipantData,
  ParticipantId,
  PaymentMethod,
  PaymentMethodId,
  RefundData,
  SettlementData,
  SettlementId,
  SettlementMethod,
  TripMeta,
  TripState,
} from "./types";

/**
 * Commands validate intent against current state and return the event(s) to
 * append. They never mutate state; the store appends what they return. Every
 * rule that protects money conservation lives here so the UI cannot bypass it.
 */

export class CommandError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "CommandError";
    this.field = field;
  }
}

type Ctx = { actor: ParticipantId | "system"; now?: number };

function base(ctx: Ctx) {
  return { id: newId("ev"), ts: ctx.now ?? Date.now(), actor: ctx.actor };
}

const UPI_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
export function isValidUpiId(value: string): boolean {
  return UPI_RE.test(value.trim());
}

export function normaliseName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function assertOpen(state: TripState) {
  if (state.trip.status === "closed") throw new CommandError("This trip is closed. Reopen it before making changes.");
}

// ---------------------------------------------------------------- trips

export type TripInput = { name: string; destination: string; startDate: string; endDate: string; description?: string };

export function validateTrip(input: TripInput): Partial<Record<keyof TripInput, string>> {
  const errors: Partial<Record<keyof TripInput, string>> = {};
  if (!normaliseName(input.name)) errors.name = "Give the trip a name";
  else if (normaliseName(input.name).length > 60) errors.name = "Keep the name under 60 characters";
  if (!normaliseName(input.destination)) errors.destination = "Where are you going?";
  if (!isValidIso(input.startDate)) errors.startDate = "Use YYYY-MM-DD";
  if (!isValidIso(input.endDate)) errors.endDate = "Use YYYY-MM-DD";
  if (!errors.startDate && !errors.endDate && input.endDate < input.startDate) errors.endDate = "End date is before the start";
  return errors;
}

export function createTrip(input: TripInput, ctx: Ctx): { tripId: string; events: LedgerEvent[] } {
  const errors = validateTrip(input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const trip: TripMeta = {
    id: newId("trip"),
    name: normaliseName(input.name),
    destination: normaliseName(input.destination),
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description?.trim() || undefined,
    currency: "INR",
    status: "active",
  };
  return { tripId: trip.id, events: [{ ...base(ctx), type: "TRIP_CREATED", trip }] };
}

export function updateTrip(state: TripState, input: TripInput, ctx: Ctx): LedgerEvent {
  const errors = validateTrip(input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const after: Partial<TripMeta> = {
    name: normaliseName(input.name),
    destination: normaliseName(input.destination),
    startDate: input.startDate,
    endDate: input.endDate,
    description: input.description?.trim() || undefined,
  };
  const before: Partial<TripMeta> = {};
  for (const key of Object.keys(after) as (keyof TripMeta)[]) {
    if (state.trip[key] !== after[key]) (before as Record<string, unknown>)[key] = state.trip[key];
    else delete (after as Record<string, unknown>)[key];
  }
  if (Object.keys(after).length === 0) throw new CommandError("Nothing changed");
  return { ...base(ctx), type: "TRIP_UPDATED", before, after };
}

export function closeTrip(state: TripState, ctx: Ctx): LedgerEvent {
  if (state.trip.status === "closed") throw new CommandError("This trip is already closed");
  const ledger = computeLedger(state);
  const budget = computeBudget(state);
  const outstanding = sumPaise(
    Object.values(ledger.balances)
      .map((b) => b.netPaise)
      .filter((n) => n > 0),
  );
  return {
    ...base(ctx),
    type: "TRIP_CLOSED",
    summary: {
      plannedPaise: budget.estimatedPaise,
      actualPaise: ledger.totals.spendPaise,
      settledPaise: sumPaise(ledger.confirmedSettlements.map((s) => s.amountPaise)),
      outstandingPaise: outstanding,
    },
  };
}

export function reopenTrip(state: TripState, ctx: Ctx): LedgerEvent {
  if (state.trip.status !== "closed") throw new CommandError("This trip is already open");
  return { ...base(ctx), type: "TRIP_REOPENED" };
}

// ---------------------------------------------------------------- participants

export type ParticipantInput = { name: string; upiId?: string; phone?: string };

export function validateParticipant(state: TripState | null, input: ParticipantInput, excludeId?: ParticipantId) {
  const errors: Partial<Record<keyof ParticipantInput, string>> = {};
  const name = normaliseName(input.name);
  if (!name) errors.name = "Enter a name";
  else if (name.length > 40) errors.name = "Keep the name under 40 characters";
  else if (state?.participants.some((p) => p.id !== excludeId && p.name.toLowerCase() === name.toLowerCase())) {
    errors.name = `${name} is already on this trip`;
  }
  const upi = input.upiId?.trim();
  if (upi && !isValidUpiId(upi)) errors.upiId = "UPI IDs look like name@bank";
  const phone = input.phone?.replace(/\s/g, "");
  if (phone && !/^(\+91)?[6-9]\d{9}$/.test(phone)) errors.phone = "Enter a 10-digit Indian mobile number";
  return errors;
}

export function addParticipant(state: TripState, input: ParticipantInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const errors = validateParticipant(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const participant: ParticipantData = {
    id: newId("p"),
    name: normaliseName(input.name),
    upiId: input.upiId?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    paymentMethods: [],
  };
  return { ...base(ctx), type: "PARTICIPANT_ADDED", participant };
}

export function updateParticipant(state: TripState, participantId: ParticipantId, input: ParticipantInput, ctx: Ctx): LedgerEvent {
  const current = state.participants.find((p) => p.id === participantId);
  if (!current) throw new CommandError("That member is no longer on the trip");
  const errors = validateParticipant(state, input, participantId);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const after: Partial<ParticipantData> = {
    name: normaliseName(input.name),
    upiId: input.upiId?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
  };
  const before: Partial<ParticipantData> = {};
  for (const key of ["name", "upiId", "phone"] as const) {
    if ((current[key] ?? "") !== (after[key] ?? "")) before[key] = current[key];
    else delete after[key];
  }
  if (Object.keys(after).length === 0) throw new CommandError("Nothing changed");
  return { ...base(ctx), type: "PARTICIPANT_UPDATED", participantId, before, after };
}

/** Why a member can't be removed, or null if they can. */
export function removalBlocker(state: TripState, participantId: ParticipantId): string | null {
  const p = state.participants.find((x) => x.id === participantId);
  if (!p) return "That member is no longer on the trip";
  if (state.participants.length === 1) return "A trip needs at least one member";
  const paid = state.expenses.filter((e) => e.payers.some((x) => x.participantId === participantId));
  if (paid.length) return `${p.name} paid for ${paid.length} expense${paid.length === 1 ? "" : "s"}. Change the payer first.`;
  const refunds = state.refunds.filter((r) => r.receivedBy === participantId);
  if (refunds.length) return `${p.name} received a refund. Edit that refund first.`;
  const settlements = state.settlements.filter((s) => s.status !== "cancelled" && (s.from === participantId || s.to === participantId));
  if (settlements.length) return `${p.name} is part of a settlement. Cancel or keep it first.`;
  const contributions = state.contributions.filter((c) => c.participantId === participantId);
  if (contributions.length) return `${p.name} contributed to the trip kitty. Remove that contribution first.`;
  const sole = state.expenses.filter((e) => e.participants.length === 1 && e.participants[0].participantId === participantId);
  if (sole.length) return `${p.name} is the only person on "${sole[0].title}". Edit or delete that expense first.`;
  return null;
}

export function removeParticipant(state: TripState, participantId: ParticipantId, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const blocker = removalBlocker(state, participantId);
  if (blocker) throw new CommandError(blocker);
  const p = state.participants.find((x) => x.id === participantId)!;
  return {
    ...base(ctx),
    type: "PARTICIPANT_REMOVED",
    participantId,
    name: p.name,
    removedFromExpenses: state.expenses.filter((e) => e.participants.some((x) => x.participantId === participantId)).map((e) => e.id),
    removedFromItinerary: state.itinerary.filter((i) => i.participantIds.includes(participantId)).map((i) => i.id),
  };
}

// ---------------------------------------------------------------- payment methods

export type PaymentMethodInput = {
  label: string;
  bank: string;
  kind: PaymentMethod["kind"];
  network?: PaymentMethod["network"];
  last4?: string;
  headroomPaise?: Paise;
  upiId?: string;
};

export function validatePaymentMethod(input: PaymentMethodInput) {
  const errors: Partial<Record<keyof PaymentMethodInput, string>> = {};
  if (!normaliseName(input.label)) errors.label = "Name the card or account";
  if (!normaliseName(input.bank)) errors.bank = "Which bank?";
  if (input.last4 && !/^\d{4}$/.test(input.last4)) errors.last4 = "Exactly four digits — never the full number";
  if (input.upiId && !isValidUpiId(input.upiId)) errors.upiId = "UPI IDs look like name@bank";
  if (input.headroomPaise !== undefined && (!isPaise(input.headroomPaise) || input.headroomPaise < 0)) errors.headroomPaise = "Enter a valid limit";
  return errors;
}

export function addPaymentMethod(state: TripState, participantId: ParticipantId, input: PaymentMethodInput, ctx: Ctx): LedgerEvent {
  if (!state.participants.some((p) => p.id === participantId)) throw new CommandError("That member is no longer on the trip");
  const errors = validatePaymentMethod(input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const method: PaymentMethod = {
    id: newId("pm"),
    kind: input.kind,
    label: normaliseName(input.label),
    bank: normaliseName(input.bank),
    network: input.network,
    last4: input.last4 || undefined,
    headroomPaise: input.headroomPaise,
    upiId: input.upiId?.trim() || undefined,
  };
  return { ...base(ctx), type: "PAYMENT_METHOD_ADDED", participantId, method };
}

export function removePaymentMethod(state: TripState, participantId: ParticipantId, methodId: PaymentMethodId, ctx: Ctx): LedgerEvent {
  const p = state.participants.find((x) => x.id === participantId);
  const method = p?.paymentMethods?.find((m) => m.id === methodId);
  if (!method) throw new CommandError("That payment method no longer exists");
  if (state.expenses.some((e) => e.paymentMethodId === methodId && e.status === "active")) {
    throw new CommandError(`${method.label} was used on an expense. Change that expense first.`);
  }
  return { ...base(ctx), type: "PAYMENT_METHOD_REMOVED", participantId, methodId, label: method.label };
}

// ---------------------------------------------------------------- itinerary

export type ItineraryInput = {
  title: string;
  category: ExpenseCategory;
  date: string;
  endDate?: string;
  time?: string;
  location?: string;
  vendor?: string;
  estimatedPaise: Paise;
  actualPaise?: Paise;
  participantIds: ParticipantId[];
  weights?: number[];
  notes?: string;
  cancellationPolicy?: { refundPercent: number; note?: string };
  status?: ItineraryItem["status"];
};

export type ItineraryErrors = Partial<Record<"title" | "date" | "endDate" | "estimated" | "actual" | "participants" | "policy", string>>;

export function validateItinerary(state: TripState, input: ItineraryInput): ItineraryErrors {
  const errors: ItineraryErrors = {};
  const ids = new Set(state.participants.map((p) => p.id));
  if (!normaliseName(input.title)) errors.title = "What is this item?";
  else if (normaliseName(input.title).length > 80) errors.title = "Keep the title under 80 characters";
  if (!isValidIso(input.date)) errors.date = "Use YYYY-MM-DD";
  if (input.endDate && !isValidIso(input.endDate)) errors.endDate = "Use YYYY-MM-DD";
  else if (input.endDate && isValidIso(input.date) && input.endDate < input.date) errors.endDate = "End date is before the start";
  if (!isPaise(input.estimatedPaise) || input.estimatedPaise < 0) errors.estimated = "Enter a valid estimate";
  if (input.actualPaise !== undefined && (!isPaise(input.actualPaise) || input.actualPaise < 0)) errors.actual = "Enter a valid booked price";
  if (input.participantIds.length === 0) errors.participants = "Pick who this is for";
  else if (input.participantIds.some((id) => !ids.has(id))) errors.participants = "Someone here is not on this trip";
  else if (new Set(input.participantIds).size !== input.participantIds.length) errors.participants = "Each person can appear once";
  if (input.weights && input.weights.length !== input.participantIds.length) errors.participants = "Shares must match the people picked";
  else if (input.weights && (input.weights.some((w) => !Number.isFinite(w) || w < 0) || !input.weights.some((w) => w > 0))) {
    errors.participants = "At least one share must be more than zero";
  }
  if (input.cancellationPolicy) {
    const pct = input.cancellationPolicy.refundPercent;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.policy = "Refundable percentage must be 0–100";
  }
  return errors;
}

export function buildItineraryItem(input: ItineraryInput, id = newId("it"), source: ItineraryItem["source"] = "manual"): ItineraryItem {
  return {
    id,
    title: normaliseName(input.title),
    category: input.category,
    date: input.date,
    endDate: input.endDate || undefined,
    time: input.time?.trim() || undefined,
    location: input.location?.trim() || undefined,
    vendor: input.vendor?.trim() || undefined,
    estimatedPaise: input.estimatedPaise,
    actualPaise: input.actualPaise,
    participantIds: [...input.participantIds],
    weights: input.weights ? [...input.weights] : undefined,
    status: input.status ?? "planned",
    notes: input.notes?.trim() || undefined,
    cancellationPolicy: input.cancellationPolicy
      ? { refundPercent: Math.round(input.cancellationPolicy.refundPercent), note: input.cancellationPolicy.note?.trim() || undefined }
      : undefined,
    expenseIds: [],
    source,
  };
}

export function addItineraryItem(state: TripState, input: ItineraryInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const errors = validateItinerary(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  return { ...base(ctx), type: "ITINERARY_ITEM_ADDED", item: buildItineraryItem(input) };
}

export function importItinerary(state: TripState, items: ItineraryInput[], sourceName: string, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  if (items.length === 0) throw new CommandError("Nothing to import");
  const built = items.map((input, i) => {
    const errors = validateItinerary(state, input);
    const first = Object.entries(errors)[0];
    if (first) throw new CommandError(`Item ${i + 1} (${input.title || "untitled"}): ${first[1]}`, first[0]);
    return buildItineraryItem(input, newId("it"), "imported");
  });
  return { ...base(ctx), type: "ITINERARY_IMPORTED", items: built, sourceName };
}

export function updateItineraryItem(state: TripState, itemId: ItineraryItemId, input: ItineraryInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const current = state.itinerary.find((i) => i.id === itemId);
  if (!current) throw new CommandError("That itinerary item no longer exists");
  const errors = validateItinerary(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const after: ItineraryItem = {
    ...buildItineraryItem(input, itemId, current.source),
    status: input.status ?? current.status,
    expenseIds: current.expenseIds,
  };
  if (JSON.stringify(current) === JSON.stringify(after)) throw new CommandError("Nothing changed");
  return { ...base(ctx), type: "ITINERARY_ITEM_UPDATED", itemId, before: current, after };
}

export function removeItineraryItem(state: TripState, itemId: ItineraryItemId, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const item = state.itinerary.find((i) => i.id === itemId);
  if (!item) throw new CommandError("That itinerary item no longer exists");
  if (item.expenseIds.length) {
    throw new CommandError(`"${item.title}" already has ${item.expenseIds.length} payment${item.expenseIds.length === 1 ? "" : "s"} against it. Cancel it instead of removing it.`);
  }
  return { ...base(ctx), type: "ITINERARY_ITEM_REMOVED", itemId, item };
}

/** Turns a planned item into an expense form draft: money actually moving. */
export function expenseDraftFromItem(item: ItineraryItem, payerId: ParticipantId): ExpenseInput {
  const amount = item.actualPaise ?? item.estimatedPaise;
  return {
    title: item.title,
    vendor: item.vendor,
    amountPaise: amount,
    date: item.date,
    category: item.category,
    payers: [{ participantId: payerId, amountPaise: amount }],
    participants: item.participantIds.map((id, i) => ({ participantId: id, weight: item.weights?.[i] ?? 1 })),
    splitMode: item.weights ? "weighted" : "equal",
    notes: item.notes,
    cancellationPolicy: item.cancellationPolicy,
    itineraryItemId: item.id,
  };
}

// ---------------------------------------------------------------- expenses

export type ExpenseInput = Omit<ExpenseData, "id">;

export type ExpenseErrors = Partial<Record<"title" | "amount" | "date" | "payers" | "participants" | "policy" | "discount", string>>;

export function validateExpense(state: TripState, input: ExpenseInput): ExpenseErrors {
  const errors: ExpenseErrors = {};
  const ids = new Set(state.participants.map((p) => p.id));
  if (!normaliseName(input.title)) errors.title = "What was this for?";
  else if (normaliseName(input.title).length > 80) errors.title = "Keep the title under 80 characters";
  if (!isPaise(input.amountPaise) || input.amountPaise < 0) errors.amount = "Enter a valid amount";
  else if (input.amountPaise === 0) errors.amount = "Amount must be more than ₹0";
  if (!isValidIso(input.date)) errors.date = "Use YYYY-MM-DD";

  if (input.payers.length === 0) errors.payers = "Who paid?";
  else if (input.payers.some((p) => !ids.has(p.participantId))) errors.payers = "A payer is not on this trip";
  else if (input.payers.some((p) => !isPaise(p.amountPaise) || p.amountPaise < 0)) errors.payers = "Payer amounts must be valid";
  else if (new Set(input.payers.map((p) => p.participantId)).size !== input.payers.length) errors.payers = "Each payer can appear once";
  else if (!errors.amount && sumPaise(input.payers.map((p) => p.amountPaise)) !== input.amountPaise) {
    errors.payers = "Payer amounts must add up to the expense amount";
  }

  if (input.participants.length === 0) errors.participants = "Pick at least one person to share this";
  else if (input.participants.some((p) => !ids.has(p.participantId))) errors.participants = "A participant is not on this trip";
  else if (new Set(input.participants.map((p) => p.participantId)).size !== input.participants.length) errors.participants = "Each person can appear once";
  else if (input.participants.some((p) => !Number.isFinite(p.weight) || p.weight < 0)) errors.participants = "Shares must be valid";
  else if (!input.participants.some((p) => p.weight > 0)) errors.participants = "At least one share must be more than zero";
  else if (input.splitMode === "exact" && !errors.amount && sumPaise(input.participants.map((p) => p.weight)) !== input.amountPaise) {
    errors.participants = "Exact shares must add up to the expense amount";
  }

  if (input.cancellationPolicy) {
    const pct = input.cancellationPolicy.refundPercent;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) errors.policy = "Refundable percentage must be 0–100";
  }
  if (input.discountPaise !== undefined) {
    if (!isPaise(input.discountPaise) || input.discountPaise < 0) errors.discount = "Enter a valid discount";
    else if (!errors.amount && input.discountPaise > input.amountPaise) errors.discount = "Discount can't be more than the bill";
  }
  if (input.itineraryItemId && !state.itinerary.some((i) => i.id === input.itineraryItemId)) {
    errors.title = "The linked itinerary item no longer exists";
  }
  return errors;
}

function cleanExpense(input: ExpenseInput): ExpenseInput {
  return {
    ...input,
    title: normaliseName(input.title),
    vendor: input.vendor?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    participants: input.participants.filter((p) => p.weight > 0 || input.splitMode !== "equal"),
    cancellationPolicy: input.cancellationPolicy
      ? { refundPercent: Math.round(input.cancellationPolicy.refundPercent), note: input.cancellationPolicy.note?.trim() || undefined }
      : undefined,
  };
}

export function addExpense(state: TripState, input: ExpenseInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const errors = validateExpense(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const expense: ExpenseData = { id: newId("x"), ...cleanExpense(input) };
  return { ...base(ctx), type: "EXPENSE_ADDED", expense };
}

export function updateExpense(state: TripState, expenseId: ExpenseId, input: ExpenseInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const current = state.expenses.find((e) => e.id === expenseId);
  if (!current) throw new CommandError("That expense no longer exists");
  if (current.status === "cancelled") throw new CommandError("Cancelled bookings can't be edited");
  const errors = validateExpense(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const refunded = sumPaise(state.refunds.filter((r) => r.expenseId === expenseId).map((r) => r.amountPaise));
  if (input.amountPaise < refunded) {
    throw new CommandError("This expense already has refunds totalling more than the new amount", "amount");
  }
  const { status: _s, cancellation: _c, ...beforeData } = current;
  const after: ExpenseData = { id: expenseId, ...cleanExpense(input) };
  if (JSON.stringify(beforeData) === JSON.stringify(after)) throw new CommandError("Nothing changed");
  return { ...base(ctx), type: "EXPENSE_UPDATED", expenseId, before: beforeData as ExpenseData, after };
}

export function deleteExpense(state: TripState, expenseId: ExpenseId, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const current = state.expenses.find((e) => e.id === expenseId);
  if (!current) throw new CommandError("That expense no longer exists");
  const { status: _s, cancellation: _c, ...data } = current;
  return { ...base(ctx), type: "EXPENSE_DELETED", expenseId, expense: data as ExpenseData };
}

/** Preview of what cancelling under the vendor's policy would do — shown before the user confirms. */
export function previewCancellation(state: TripState, expenseId: ExpenseId, refundPercent?: number) {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) throw new CommandError("That expense no longer exists");
  const pct = refundPercent ?? expense.cancellationPolicy?.refundPercent ?? 0;
  const already = sumPaise(state.refunds.filter((r) => r.expenseId === expenseId).map((r) => r.amountPaise));
  const recoverable = Math.min(expense.amountPaise - already, Math.round((expense.amountPaise * pct) / 100));
  const loss = expense.amountPaise - already - recoverable;
  const receivedBy = expense.payers.length ? [...expense.payers].sort((a, b) => b.amountPaise - a.amountPaise)[0].participantId : undefined;
  return { expense, refundPercent: pct, recoverablePaise: Math.max(0, recoverable), lossPaise: Math.max(0, loss), receivedBy };
}

export function cancelExpense(
  state: TripState,
  expenseId: ExpenseId,
  opts: { refundPercent?: number; receivedBy?: ParticipantId; date: string; reason?: string },
  ctx: Ctx,
): LedgerEvent {
  assertOpen(state);
  const preview = previewCancellation(state, expenseId, opts.refundPercent);
  if (preview.expense.status === "cancelled") throw new CommandError("This booking is already cancelled");
  if (!Number.isFinite(preview.refundPercent) || preview.refundPercent < 0 || preview.refundPercent > 100) {
    throw new CommandError("Refundable percentage must be 0–100", "policy");
  }
  if (!isValidIso(opts.date)) throw new CommandError("Use YYYY-MM-DD", "date");
  let refund: RefundData | undefined;
  if (preview.recoverablePaise > 0) {
    const receivedBy = opts.receivedBy ?? preview.receivedBy;
    if (!receivedBy || !state.participants.some((p) => p.id === receivedBy)) throw new CommandError("Who received the refund?", "receivedBy");
    refund = {
      id: newId("rf"),
      expenseId,
      amountPaise: preview.recoverablePaise,
      receivedBy,
      date: opts.date,
      reason: opts.reason?.trim() || `Cancelled · ${preview.refundPercent}% refundable`,
      source: "cancellation",
    };
  }
  return {
    ...base(ctx),
    type: "EXPENSE_CANCELLED",
    expenseId,
    refund,
    recoverablePaise: preview.recoverablePaise,
    lossPaise: preview.lossPaise,
    refundPercent: preview.refundPercent,
  };
}

// ---------------------------------------------------------------- refunds

export type RefundInput = { expenseId: ExpenseId; amountPaise: Paise; receivedBy: ParticipantId; date: string; reason?: string };

export function refundableRemaining(state: TripState, expenseId: ExpenseId): Paise {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) return 0;
  const already = sumPaise(state.refunds.filter((r) => r.expenseId === expenseId).map((r) => r.amountPaise));
  return Math.max(0, expense.amountPaise - already);
}

export function validateRefund(state: TripState, input: RefundInput) {
  const errors: Partial<Record<"amount" | "receivedBy" | "date", string>> = {};
  const expense = state.expenses.find((e) => e.id === input.expenseId);
  if (!expense) return { amount: "That expense no longer exists" };
  const remaining = refundableRemaining(state, input.expenseId);
  if (!isPaise(input.amountPaise) || input.amountPaise <= 0) errors.amount = "Enter a refund amount";
  else if (input.amountPaise > remaining) errors.amount = `Only ${remaining} paise remain refundable on this expense`;
  if (!state.participants.some((p) => p.id === input.receivedBy)) errors.receivedBy = "Who received the money?";
  if (!isValidIso(input.date)) errors.date = "Use YYYY-MM-DD";
  return errors;
}

export function recordRefund(state: TripState, input: RefundInput, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const errors = validateRefund(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const refund: RefundData = {
    id: newId("rf"),
    expenseId: input.expenseId,
    amountPaise: input.amountPaise,
    receivedBy: input.receivedBy,
    date: input.date,
    reason: input.reason?.trim() || undefined,
    source: "manual",
  };
  return { ...base(ctx), type: "REFUND_RECORDED", refund };
}

export function deleteRefund(state: TripState, refundId: string, ctx: Ctx): LedgerEvent {
  assertOpen(state);
  const refund = state.refunds.find((r) => r.id === refundId);
  if (!refund) throw new CommandError("That refund no longer exists");
  if (refund.source === "cancellation") throw new CommandError("This refund came from a cancellation and can't be removed on its own");
  return { ...base(ctx), type: "REFUND_DELETED", refundId, refund };
}

// ---------------------------------------------------------------- settlements

export type SettlementInput = { from: ParticipantId; to: ParticipantId; amountPaise: Paise; method: SettlementMethod; reference?: string };

export function validateSettlement(state: TripState, input: SettlementInput) {
  const errors: Partial<Record<"from" | "to" | "amount", string>> = {};
  const ids = new Set(state.participants.map((p) => p.id));
  if (!ids.has(input.from)) errors.from = "Payer is not on this trip";
  if (!ids.has(input.to)) errors.to = "Recipient is not on this trip";
  if (input.from === input.to) errors.to = "Payer and recipient must be different people";
  if (!isPaise(input.amountPaise) || input.amountPaise <= 0) errors.amount = "Enter an amount";
  if (!errors.from && !errors.to && !errors.amount) {
    // Guard against over-paying: the payer must currently owe at least this much once pending payments are counted.
    const ledger = computeLedger(state);
    const owes = -ledger.balances[input.from].provisionalNetPaise;
    if (owes <= 0) errors.amount = `${state.participants.find((p) => p.id === input.from)?.name} doesn't owe anything right now`;
    else if (input.amountPaise > owes) errors.amount = `That's more than the ${owes} paise still owed`;
  }
  return errors;
}

export function initiateSettlement(state: TripState, input: SettlementInput, ctx: Ctx): LedgerEvent {
  const errors = validateSettlement(state, input);
  const first = Object.entries(errors)[0];
  if (first) throw new CommandError(first[1], first[0]);
  const settlement: SettlementData = {
    id: newId("st"),
    from: input.from,
    to: input.to,
    amountPaise: input.amountPaise,
    method: input.method,
    reference: input.reference?.trim() || undefined,
    initiatedTs: ctx.now ?? Date.now(),
    status: "initiated",
  };
  return { ...base(ctx), type: "SETTLEMENT_INITIATED", settlement };
}

export function confirmSettlement(state: TripState, settlementId: SettlementId, ctx: Ctx): LedgerEvent {
  const s = state.settlements.find((x) => x.id === settlementId);
  if (!s) throw new CommandError("That payment no longer exists");
  if (s.status !== "initiated") throw new CommandError(`This payment is already ${s.status}`);
  return { ...base(ctx), type: "SETTLEMENT_CONFIRMED", settlementId, confirmedTs: ctx.now ?? Date.now() };
}

export function cancelSettlement(state: TripState, settlementId: SettlementId, ctx: Ctx, reason?: string): LedgerEvent {
  const s = state.settlements.find((x) => x.id === settlementId);
  if (!s) throw new CommandError("That payment no longer exists");
  if (s.status === "cancelled") throw new CommandError("This payment is already cancelled");
  if (s.status === "confirmed") throw new CommandError("Confirmed payments can't be cancelled. Record a payment in the other direction instead.");
  return { ...base(ctx), type: "SETTLEMENT_CANCELLED", settlementId, reason };
}

// ---------------------------------------------------------------- contributions (trip funding)

export function recordContribution(
  state: TripState,
  input: { participantId: ParticipantId; amountPaise: Paise; method: SettlementMethod; reference?: string },
  ctx: Ctx,
): LedgerEvent {
  assertOpen(state);
  if (!state.participants.some((p) => p.id === input.participantId)) throw new CommandError("That member is not on the trip");
  if (!isPaise(input.amountPaise) || input.amountPaise <= 0) throw new CommandError("Enter an amount", "amount");
  const contribution: ContributionData = {
    id: newId("ct"),
    participantId: input.participantId,
    amountPaise: input.amountPaise,
    method: input.method,
    reference: input.reference?.trim() || undefined,
    ts: ctx.now ?? Date.now(),
  };
  return { ...base(ctx), type: "CONTRIBUTION_RECORDED", contribution };
}

export function removeContribution(state: TripState, contributionId: string, ctx: Ctx): LedgerEvent {
  const contribution = state.contributions.find((c) => c.id === contributionId);
  if (!contribution) throw new CommandError("That contribution no longer exists");
  return { ...base(ctx), type: "CONTRIBUTION_REMOVED", contributionId, contribution };
}

// ---------------------------------------------------------------- UPI helpers

/** Build a UPI intent URL. Never executes a transaction; the phone's UPI app does. */
export function upiIntentUrl(opts: { vpa: string; name: string; amountPaise: Paise; note?: string }): string {
  const amount = (opts.amountPaise / 100).toFixed(2);
  const params = new URLSearchParams({ pa: opts.vpa, pn: opts.name, am: amount, cu: "INR" });
  if (opts.note) params.set("tn", opts.note.slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

/** Parses a scanned/pasted UPI QR payload into its parts. */
export function parseUpiIntent(raw: string): { vpa: string; name?: string; amountPaise?: Paise; note?: string } | null {
  const text = raw.trim();
  if (!text) return null;
  if (isValidUpiId(text)) return { vpa: text };
  const match = /^upi:\/\/pay\?(.*)$/i.exec(text);
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const vpa = params.get("pa");
  if (!vpa || !isValidUpiId(vpa)) return null;
  const am = params.get("am");
  const amount = am ? Number(am) : NaN;
  return {
    vpa,
    name: params.get("pn") ?? undefined,
    amountPaise: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined,
    note: params.get("tn") ?? undefined,
  };
}

/** Splits an amount evenly across payers for the "several people paid" form. */
export function evenPayers(amountPaise: Paise, ids: ParticipantId[]) {
  const parts = allocate(
    amountPaise,
    ids.map(() => 1),
  );
  return ids.map((participantId, i) => ({ participantId, amountPaise: parts[i] }));
}
