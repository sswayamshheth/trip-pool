# GroupTrip Ledger

Group travel coordination and settlement. **The itinerary is the ledger**: you build the plan, and the budget, everyone's share, refunds and settlements are all derived from it — never entered by hand.

Built for HackCelestial 3.0 · PS-3 (Hospitality & Travel). Expo / React Native, one codebase for web, iOS and Android.

## Run it

```bash
npm install
npm run dev:metro        # web dev server on http://localhost:8081
npm run android          # or ios — Expo Go / dev client
```

Sign in with any 10-digit mobile number — the app generates the verification code and shows it on screen (no SMS backend). You land on **Your trips**, and the six-person Manali demo is already there: ₹1.78 lakh planned across ten itinerary items, nine expenses, a refund, a confirmed and a pending UPI settlement, and cards for every member. Profile → *Reload demo trip* restores it at any time.

## Check it

```bash
npm test                 # vitest — 79 tests
npm run check            # tsc --noEmit
npm run lint             # expo lint
npm run build:web        # static export to dist/
```

## How it works

```
lib/money.ts               integer paise, Indian grouping, largest-remainder allocation
lib/ledger/types.ts        the event log — trip, participants, itinerary, expenses, refunds, settlements
lib/ledger/reduce.ts       replay events → current trip state (pure)
lib/ledger/budget.ts       itinerary → estimate, categories, per-person, planned vs actual, diffs, what-if
lib/ledger/engine.ts       derive shares, balances, vendor ledger; prove Σ balances = 0
lib/ledger/settlement.ts   minimise transfers (zero-sum partition + greedy)
lib/ledger/offers.ts       curated bank offers, the payment optimiser and the savings analyser
lib/ledger/commands.ts     validated intents → events; every money-conservation rule lives here
lib/ledger/store.tsx       append-only log per trip, persisted with AsyncStorage
lib/itinerary/pdf-text.ts  PDF text-layer extraction (pako inflate, no OCR)
lib/itinerary/parse.ts     itinerary text → structured draft items, with the source line kept as evidence
app/(home)/                Trips · Payments · Profile
app/(trip)/                Trip · Plan · Spend · Settle · Activity
```

**The flow.** Sign in → your groups → create one (details → itinerary → budget → members) → open it → edit the plan → record what actually gets paid → optimise who pays → refunds → settle → close.

**Money.** Every amount is an integer number of paise. Splits use largest-remainder allocation so shares always sum exactly to the amount; the reconciliation (`Σ net balances = ₹0`) is shown on the Trip, Members, Budget and Settings screens.

**Itinerary → budget.** An itinerary item carries an estimate and who it is for. The trip estimate, the category breakdown and each person's participation-aware estimate all derive from those items — change one and every number moves, with a plain-language summary of what changed and by how much. **What if…** applies changes to a copy of the state and shows the difference before anything is committed.

**Planned vs actual.** Recording a payment against an item makes it *booked*: the estimate stays, the actual arrives, and the variance is shown. What the group still owes a vendor is tracked separately from what members owe each other — two different ledgers, kept apart.

**Participation-derived splits.** An expense has payers (one or several, each with an amount) and participants with a weight — equal, weighted (rooms / beds / nights) or exact amounts. Shares recompute from the current participant set every time anything changes.

**Refund routing.** A refund reduces the expense's *effective* cost and credits the people who bore it, in proportion to their share. Whoever actually received the money has their contribution reduced by the same amount, so their receivable from the others drops. Cancelling applies the vendor's saved policy: only the recoverable part comes back, the unrecoverable remainder stays split.

**Payment optimiser.** A curated offer dataset (10 offers, 8 popular Indian cards) plus a deterministic constraint solve over bank, card, network, category, minimum spend, offer cap and the payer's remaining credit headroom. Same inputs, same recommendation. The **analyser** then compares what each payment actually captured against what the best available card would have saved. Only card metadata is stored — bank, network, name, last four digits — never a card number.

**Settlement.** Net balances (after confirmed payments) are partitioned into zero-sum groups (exact bitmask DP up to 16 people), then each group is settled largest-debtor → largest-creditor. Payments have three explicit states: *initiated* (payer says it's sent — opens a `upi://pay` intent on a phone) → *confirmed* (recipient confirms; only now do balances move) → recorded in history.

**Audit trail.** Nothing is edited in place. Every change is an event with actor and timestamp; edits carry before/after, so "why did my share change?" resolves to a specific line.

## Importing an itinerary

Create a trip → *Upload PDF*, *Paste text*, or add items by hand. PDFs are read **on the device**: the text layer is extracted (`pako` inflate over the content streams) and parsed by deterministic pattern matching — no model, no upload, no OCR. Every extracted row keeps the source line as evidence and must be reviewed before it is saved. A scanned PDF with no text layer is reported as such rather than guessed at.

## Deploy

`npm run build:web` produces a static site in `dist/`; `vercel.json` carries the clean-URL rewrites the dynamic routes need. The backend under `server/` is the untouched template scaffold — replacing AsyncStorage with an API means posting the same events to a server and running the same reducer there.

## Honest limitations

- **Single device.** No accounts or sync; state lives in local storage. The store is shaped so a backend is a drop-in replacement.
- **No real payment rails.** UPI is an intent hand-off to the phone's own UPI app; no money passes through this app, and the trip kitty is tracked, not held.
- **No camera QR scan.** The QR screen parses a pasted or demo `upi://pay` payload for real; live camera decoding is not built.
- **No OCR.** Receipt photos and scanned PDFs are not read.
- **Offers are a curated dataset**, not a live feed — ingestion at scale is the genuine engineering problem here, and it isn't solved.
- **INR only.** No multi-currency.
