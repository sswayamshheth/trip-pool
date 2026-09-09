import type { Paise } from "@/lib/money";

/**
 * The ledger is an append-only log of events per trip. Every screen derives
 * what it shows by replaying that log (see reduce.ts) and then computing
 * budget, shares, balances and settlements from the derived state
 * (see budget.ts / engine.ts). Nothing stores a running total.
 *
 * The itinerary is the ledger:
 *   ItineraryItem (planned, estimated)
 *     → booked (actual price agreed with a vendor)
 *       → Expense (money actually moved to the vendor)
 *         → shares derived from participation
 *           → balances → refunds → settlement
 */

export type ParticipantId = string;
export type ExpenseId = string;
export type RefundId = string;
export type SettlementId = string;
export type ItineraryItemId = string;
export type PaymentMethodId = string;

export type ExpenseCategory = "Stay" | "Transport" | "Activity" | "Food" | "Local travel" | "Shopping" | "Other";
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Stay", "Transport", "Activity", "Food", "Local travel", "Shopping", "Other"];

export type SplitMode = "equal" | "weighted" | "exact";

export type Participation = {
  participantId: ParticipantId;
  /**
   * Weight used to derive this person's share. Equal split: 1 for everyone.
   * Weighted: e.g. rooms or beds. Exact: the rupee amount entered, in paise,
   * used as a proportional weight so refunds and removals still reconcile.
   */
  weight: number;
};

export type Payer = { participantId: ParticipantId; amountPaise: Paise };

export type CancellationPolicy = {
  /** Percentage of the booking amount the vendor refunds on cancellation, 0–100. */
  refundPercent: number;
  note?: string;
};

// ---------------------------------------------------------------- payment methods

export type PaymentMethodKind = "upi" | "credit-card" | "debit-card" | "netbanking";

/**
 * Card metadata only — never a card number. `label` is what the member calls
 * it ("HDFC Regalia"); `bank` and `network` drive offer eligibility.
 */
export type PaymentMethod = {
  id: PaymentMethodId;
  kind: PaymentMethodKind;
  label: string;
  bank: string;
  network?: "Visa" | "Mastercard" | "RuPay" | "Amex";
  /** Last four digits are safe to store and help a person recognise the card. */
  last4?: string;
  /** For credit cards: how much of the limit is still available, in paise. */
  headroomPaise?: Paise;
  upiId?: string;
  isDefault?: boolean;
};

export type ParticipantData = {
  id: ParticipantId;
  name: string;
  upiId?: string;
  phone?: string;
  paymentMethods?: PaymentMethod[];
};

// ---------------------------------------------------------------- itinerary

export type ItineraryStatus = "planned" | "booked" | "cancelled";

export type ItineraryItem = {
  id: ItineraryItemId;
  title: string;
  category: ExpenseCategory;
  /** ISO date the item starts. */
  date: string;
  /** ISO date it ends (stays spanning nights). Absent = single day. */
  endDate?: string;
  /** "09:30" — optional, only where it means something. */
  time?: string;
  location?: string;
  vendor?: string;
  /** What we expect it to cost, in paise. Drives the budget. */
  estimatedPaise: Paise;
  /**
   * The price actually agreed with the vendor once booked. Absent while the
   * item is only planned. Vendor outstanding is computed from this.
   */
  actualPaise?: Paise;
  /** Who is planned to be part of it — drives per-person estimates. */
  participantIds: ParticipantId[];
  /** Weights matching participantIds for per-room / per-bed style items. */
  weights?: number[];
  status: ItineraryStatus;
  notes?: string;
  cancellationPolicy?: CancellationPolicy;
  /** Expenses recording money actually paid against this item. */
  expenseIds: ExpenseId[];
  /** Where the item came from, for the audit trail. */
  source?: "manual" | "imported" | "demo";
};

export type ExpenseData = {
  id: ExpenseId;
  title: string;
  vendor?: string;
  amountPaise: Paise;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  category: ExpenseCategory;
  payers: Payer[];
  participants: Participation[];
  splitMode: SplitMode;
  notes?: string;
  cancellationPolicy?: CancellationPolicy;
  /** The itinerary item this expense pays for, when there is one. */
  itineraryItemId?: ItineraryItemId;
  /** Which payment method the (first) payer used — drives the analyser. */
  paymentMethodId?: PaymentMethodId;
  /** Bank/card discount actually captured on this payment, in paise. */
  discountPaise?: Paise;
  /** Free-text record of where the booking came from (deep link, receipt, manual). */
  capture?: { kind: "manual" | "receipt" | "deeplink"; reference?: string };
};

export type RefundData = {
  id: RefundId;
  expenseId: ExpenseId;
  amountPaise: Paise;
  /** Who actually received the money back from the vendor. */
  receivedBy: ParticipantId;
  date: string;
  reason?: string;
  source: "manual" | "cancellation";
};

export type SettlementMethod = "upi" | "cash";
export type SettlementStatus = "initiated" | "confirmed" | "cancelled";

export type SettlementData = {
  id: SettlementId;
  from: ParticipantId;
  to: ParticipantId;
  amountPaise: Paise;
  method: SettlementMethod;
  /** UPI transaction reference or note supplied by the payer. */
  reference?: string;
  initiatedTs: number;
  confirmedTs?: number;
  cancelledTs?: number;
  status: SettlementStatus;
};

/** Money a member puts into the trip kitty up front. Tracked, never held by us. */
export type ContributionData = {
  id: string;
  participantId: ParticipantId;
  amountPaise: Paise;
  method: SettlementMethod;
  reference?: string;
  ts: number;
};

export type TripStatus = "active" | "closed";

export type TripMeta = {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  currency: "INR";
  description?: string;
  status: TripStatus;
  /** Optional per-person target the organiser wants everyone to fund. */
  fundingTargetPaise?: Paise;
};

type Base = { id: string; ts: number; actor: ParticipantId | "system" };

export type LedgerEvent =
  | (Base & { type: "TRIP_CREATED"; trip: TripMeta })
  | (Base & { type: "TRIP_UPDATED"; before: Partial<TripMeta>; after: Partial<TripMeta> })
  | (Base & { type: "TRIP_CLOSED"; summary: { plannedPaise: Paise; actualPaise: Paise; settledPaise: Paise; outstandingPaise: Paise } })
  | (Base & { type: "TRIP_REOPENED" })
  | (Base & { type: "PARTICIPANT_ADDED"; participant: ParticipantData })
  | (Base & { type: "PARTICIPANT_UPDATED"; participantId: ParticipantId; before: Partial<ParticipantData>; after: Partial<ParticipantData> })
  | (Base & { type: "PARTICIPANT_REMOVED"; participantId: ParticipantId; name: string; removedFromExpenses: ExpenseId[]; removedFromItinerary: ItineraryItemId[] })
  | (Base & { type: "PAYMENT_METHOD_ADDED"; participantId: ParticipantId; method: PaymentMethod })
  | (Base & { type: "PAYMENT_METHOD_REMOVED"; participantId: ParticipantId; methodId: PaymentMethodId; label: string })
  | (Base & { type: "ITINERARY_ITEM_ADDED"; item: ItineraryItem })
  | (Base & { type: "ITINERARY_ITEM_UPDATED"; itemId: ItineraryItemId; before: ItineraryItem; after: ItineraryItem })
  | (Base & { type: "ITINERARY_ITEM_REMOVED"; itemId: ItineraryItemId; item: ItineraryItem })
  | (Base & { type: "ITINERARY_IMPORTED"; items: ItineraryItem[]; sourceName: string })
  | (Base & { type: "EXPENSE_ADDED"; expense: ExpenseData })
  | (Base & { type: "EXPENSE_UPDATED"; expenseId: ExpenseId; before: ExpenseData; after: ExpenseData })
  | (Base & { type: "EXPENSE_DELETED"; expenseId: ExpenseId; expense: ExpenseData })
  | (Base & {
      type: "EXPENSE_CANCELLED";
      expenseId: ExpenseId;
      /** Refund created by applying the vendor's policy, if any money is recoverable. */
      refund?: RefundData;
      recoverablePaise: Paise;
      lossPaise: Paise;
      refundPercent: number;
    })
  | (Base & { type: "REFUND_RECORDED"; refund: RefundData })
  | (Base & { type: "REFUND_DELETED"; refundId: RefundId; refund: RefundData })
  | (Base & { type: "SETTLEMENT_INITIATED"; settlement: SettlementData })
  | (Base & { type: "SETTLEMENT_CONFIRMED"; settlementId: SettlementId; confirmedTs: number })
  | (Base & { type: "SETTLEMENT_CANCELLED"; settlementId: SettlementId; reason?: string })
  | (Base & { type: "CONTRIBUTION_RECORDED"; contribution: ContributionData })
  | (Base & { type: "CONTRIBUTION_REMOVED"; contributionId: string; contribution: ContributionData });

export type LedgerEventType = LedgerEvent["type"];

/** Derived by replaying events. */
export type TripState = {
  trip: TripMeta;
  participants: ParticipantData[];
  itinerary: ItineraryItem[];
  expenses: ExpenseView[];
  refunds: RefundData[];
  settlements: SettlementData[];
  contributions: ContributionData[];
  closedAt?: number;
};

export type ExpenseView = ExpenseData & {
  status: "active" | "cancelled";
  cancellation?: { recoverablePaise: Paise; lossPaise: Paise; refundPercent: number; ts: number };
};
