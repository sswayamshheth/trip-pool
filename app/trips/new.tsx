import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Avatar, Button, Card, Chip, EmptyState, Field, Icon, IconButton, Money, Notice, Screen, SectionTitle, Sheet, Tappable, TextField, TextLink, type IconName } from "@/components/kit";
import { categoryTone, colors, radius, space, type } from "@/constants/design";
import { toIso, todayIso } from "@/lib/dates";
import { useFeedback, useOnce } from "@/lib/feedback";
import { addParticipant, buildItineraryItem, CommandError, normaliseName, validateTrip, type ItineraryInput } from "@/lib/ledger/commands";
import { reduceEvents } from "@/lib/ledger/reduce";
import { useStore } from "@/lib/ledger/store";
import { EXPENSE_CATEGORIES, type ExpenseCategory, type LedgerEvent, type TripState } from "@/lib/ledger/types";
import { pickItineraryFile } from "@/lib/itinerary/import";
import { parseItineraryText, SAMPLE_ITINERARY_TEXT, type DraftItem } from "@/lib/itinerary/parse";
import { formatMoney, parseAmount, sumPaise } from "@/lib/money";

type Step = 0 | 1 | 2 | 3;
const STEPS = ["Trip", "Itinerary", "Budget", "Members"];

/** A draft item in the wizard — participants are assigned when the trip is created. */
type Draft = {
  key: string;
  title: string;
  category: ExpenseCategory;
  date: string;
  endDate?: string;
  vendor?: string;
  amount: string;
  evidence?: string;
  confidence?: DraftItem["confidence"];
};

let draftSeq = 0;
const nextKey = () => `d${++draftSeq}`;

function plusDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export default function NewTripScreen() {
  const router = useRouter();
  const store = useStore();
  const { toast } = useFeedback();

  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(plusDays(todayIso(), 3));
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const [headcount, setHeadcount] = useState("");
  const [you, setYou] = useState(store.session?.name && store.session.name !== "You" ? store.session.name : "");
  const [others, setOthers] = useState<string[]>([]);
  const [memberDraft, setMemberDraft] = useState("");
  const [yourUpi, setYourUpi] = useState("");

  const tripErrors = useMemo(() => validateTrip({ name, destination, startDate, endDate }), [name, destination, startDate, endDate]);

  const items = useMemo(
    () =>
      drafts.map((d) => ({
        draft: d,
        paise: parseAmount(d.amount).paise ?? 0,
      })),
    [drafts],
  );
  const estimatedPaise = sumPaise(items.map((i) => i.paise));
  const people = useMemo(() => [normaliseName(you) || "You", ...others], [you, others]);
  const perPersonCount = Math.max(1, Number(headcount) || people.length || 1);

  const categories = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const { draft, paise } of items) map.set(draft.category, (map.get(draft.category) ?? 0) + paise);
    return [...map.entries()]
      .map(([category, paise]) => ({ category, paise, fraction: estimatedPaise > 0 ? paise / estimatedPaise : 0 }))
      .sort((a, b) => b.paise - a.paise);
  }, [items, estimatedPaise]);

  // ---------------------------------------------------------------- itinerary import

  const applyParsed = (text: string, sourceName: string) => {
    const parsed = parseItineraryText(text, { fallbackYear: Number(startDate.slice(0, 4)) });
    if (parsed.items.length === 0) {
      setImportNote(
        parsed.textLength > 0
          ? `Read ${parsed.textLength} characters from ${sourceName} but found no priced lines. Add the items by hand below.`
          : `Could not read any text from ${sourceName}.`,
      );
      toast("No itinerary lines found — add them by hand", "error");
      return;
    }
    if (parsed.destination && !destination.trim()) setDestination(parsed.destination);
    if (parsed.startDate) setStartDate(parsed.startDate);
    if (parsed.endDate) setEndDate(parsed.endDate);
    if (parsed.travellers) setHeadcount(String(parsed.travellers));
    if (!name.trim() && parsed.destination) setName(`${parsed.destination} trip`);
    setDrafts((current) => [
      ...current,
      ...parsed.items.map((i) => ({
        key: nextKey(),
        title: i.title,
        category: i.category,
        date: i.date ?? parsed.startDate ?? startDate,
        endDate: i.endDate,
        vendor: i.vendor,
        amount: (i.estimatedPaise / 100).toFixed(i.estimatedPaise % 100 ? 2 : 0),
        evidence: i.evidence,
        confidence: i.confidence,
      })),
    ]);
    setImportNote(
      `Found ${parsed.items.length} item${parsed.items.length === 1 ? "" : "s"} in ${sourceName}${parsed.unmatched.length ? ` · ${parsed.unmatched.length} line${parsed.unmatched.length === 1 ? "" : "s"} skipped` : ""}. Check every row before continuing.`,
    );
    toast(`${parsed.items.length} items extracted — review them`, "success");
  };

  const uploadPdf = useOnce(async () => {
    setImporting(true);
    setImportNote(null);
    const result = await pickItineraryFile();
    setImporting(false);
    if (!result.ok) {
      if (result.reason === "cancelled") return;
      setImportNote(result.message);
      toast(result.message, "error");
      return;
    }
    applyParsed(result.text, result.fileName);
  });

  // ---------------------------------------------------------------- create

  const create = useOnce(() => {
    setSubmitted(true);
    if (Object.keys(tripErrors).length) {
      toast(Object.values(tripErrors)[0]!, "error");
      setStep(0);
      return;
    }
    if (!normaliseName(you)) {
      toast("Add your own name so the app knows who you are", "error");
      setStep(3);
      return;
    }
    const bad = items.find(({ draft, paise }) => draft.title.trim() === "" || paise <= 0);
    if (bad) {
      toast(`"${bad.draft.title || "Untitled"}" needs a title and an amount`, "error");
      setStep(1);
      return;
    }
    try {
      const tripId = store.createTrip({ name, destination, startDate, endDate, description });
      const events: LedgerEvent[] = [];
      let state = reduceEvents([
        {
          id: "tmp",
          ts: Date.now(),
          actor: "system",
          type: "TRIP_CREATED",
          trip: { id: tripId, name: normaliseName(name), destination: normaliseName(destination), startDate, endDate, currency: "INR", status: "active" },
        },
      ]) as TripState;

      let viewerId: string | undefined;
      const memberIds: string[] = [];
      for (const memberName of people) {
        const ev = addParticipant(state, { name: memberName, upiId: memberIds.length === 0 ? yourUpi : undefined }, { actor: "system" });
        events.push(ev);
        const participant = (ev as Extract<LedgerEvent, { type: "PARTICIPANT_ADDED" }>).participant;
        state = { ...state, participants: [...state.participants, participant] };
        memberIds.push(participant.id);
        if (!viewerId) viewerId = participant.id;
      }

      if (items.length) {
        const built = items.map(({ draft, paise }) =>
          buildItineraryItem(
            {
              title: draft.title,
              category: draft.category,
              date: draft.date,
              endDate: draft.endDate,
              vendor: draft.vendor,
              estimatedPaise: paise,
              participantIds: memberIds,
            } as ItineraryInput,
            undefined,
            drafts.some((d) => d.evidence) ? "imported" : "manual",
          ),
        );
        events.push({ id: `ev_import_${tripId}`, ts: Date.now(), actor: viewerId ?? "system", type: "ITINERARY_IMPORTED", items: built, sourceName: drafts.some((d) => d.evidence) ? "imported itinerary" : "manual entry" });
      }

      store.append(events, tripId);
      if (viewerId) store.setViewer(viewerId, tripId);
      store.switchTrip(tripId);
      toast(`${normaliseName(name)} created · ${people.length} members · ${items.length} itinerary items`, "success");
      router.replace("/(trip)/overview");
    } catch (error) {
      toast(error instanceof CommandError ? error.message : "Could not create the trip", "error");
    }
  });

  const addMember = () => {
    const n = normaliseName(memberDraft);
    if (!n) return;
    if ([normaliseName(you), ...others].map((x) => x.toLowerCase()).includes(n.toLowerCase())) {
      toast(`${n} is already on the list`, "error");
      return;
    }
    setOthers((o) => [...o, n]);
    setMemberDraft("");
  };

  const canAdvance = step === 0 ? Object.keys(tripErrors).length === 0 : step === 3 ? normaliseName(you).length > 0 : true;

  return (
    <Screen
      title="New trip"
      subtitle={`Step ${step + 1} of 4 · ${STEPS[step]}`}
      back
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          {step > 0 ? <Button label="Back" variant="ghost" onPress={() => setStep((s) => (s - 1) as Step)} /> : null}
          {step < 3 ? (
            <Button
              label={step === 1 && drafts.length === 0 ? "Skip for now" : "Continue"}
              icon="arrow-forward"
              full
              onPress={() => {
                if (step === 0) setSubmitted(true);
                if (!canAdvance) {
                  toast(Object.values(tripErrors)[0] ?? "Check the highlighted fields", "error");
                  return;
                }
                setStep((s) => (s + 1) as Step);
              }}
            />
          ) : (
            <Button label="Create trip" icon="check" full onPress={create} />
          )}
        </View>
      }
    >
      <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of 4`}>
        {STEPS.map((label, i) => (
          <View key={label} style={{ flex: 1, gap: 4 }}>
            <View style={[styles.progressBar, i <= step && { backgroundColor: colors.blue }]} />
            <Text style={[type.caption, i === step && { color: colors.blueText, fontWeight: "800" }]}>{label}</Text>
          </View>
        ))}
      </View>

      {step === 0 ? (
        <Card style={{ gap: 14 }}>
          <TextField label="Trip name" value={name} onChangeText={setName} placeholder="e.g. Manali Trip" autoFocus error={submitted ? tripErrors.name : undefined} maxLength={60} />
          <TextField label="Destination" value={destination} onChangeText={setDestination} placeholder="Manali, Himachal Pradesh" error={submitted ? tripErrors.destination : undefined} maxLength={60} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextField label="Start" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" error={submitted ? tripErrors.startDate : undefined} style={{ flex: 1 }} />
            <TextField label="End" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" error={submitted ? tripErrors.endDate : undefined} style={{ flex: 1 }} />
          </View>
          <TextField label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What's the plan?" multiline maxLength={200} />
        </Card>
      ) : null}

      {step === 1 ? (
        <>
          <Notice tone="blue" icon="auto-awesome" title="The itinerary is the ledger">
            Add what you plan to do and roughly what it costs. The budget, everyone&apos;s estimated share and — once you book — the real ledger all follow from these lines.
          </Notice>

          <View style={styles.importRow}>
            <Tappable onPress={uploadPdf} label="Upload an itinerary PDF" style={[styles.importCard, importing && { opacity: 0.6 }]}>
              <View style={[styles.importIcon, { backgroundColor: colors.blueSoft }]}>
                <Icon name="upload-file" size={22} color={colors.blue} />
              </View>
              <Text style={[type.body, { fontWeight: "700" }]}>{importing ? "Reading…" : "Upload PDF"}</Text>
              <Text style={type.caption}>Read on your device</Text>
            </Tappable>
            <Tappable onPress={() => setPasteOpen(true)} label="Paste itinerary text" style={styles.importCard}>
              <View style={[styles.importIcon, { backgroundColor: colors.lavender }]}>
                <Icon name="content-paste" size={22} color={colors.lavenderText} />
              </View>
              <Text style={[type.body, { fontWeight: "700" }]}>Paste text</Text>
              <Text style={type.caption}>From an email</Text>
            </Tappable>
            <Tappable onPress={() => setEditing({ key: nextKey(), title: "", category: "Stay", date: startDate, amount: "" })} label="Add an itinerary item by hand" style={styles.importCard}>
              <View style={[styles.importIcon, { backgroundColor: colors.mint }]}>
                <Icon name="edit-note" size={22} color={colors.mintText} />
              </View>
              <Text style={[type.body, { fontWeight: "700" }]}>Add by hand</Text>
              <Text style={type.caption}>One line at a time</Text>
            </Tappable>
          </View>

          {importNote ? (
            <Notice tone={drafts.length ? "mint" : "amber"} icon={drafts.length ? "fact-check" : "warning-amber"}>
              {importNote}
            </Notice>
          ) : null}

          <SectionTitle title="Itinerary" count={drafts.length} action={drafts.length ? "Clear all" : undefined} onAction={() => setDrafts([])} />
          {drafts.length === 0 ? (
            <Card>
              <EmptyState
                icon="event-note"
                title="Nothing planned yet"
                message="Upload a PDF, paste an email, or add items by hand. You can also skip this and build the itinerary inside the trip."
                action={<Button label="Try the sample itinerary" variant="ghost" icon="bolt" onPress={() => applyParsed(SAMPLE_ITINERARY_TEXT, "the sample itinerary")} />}
              />
            </Card>
          ) : (
            drafts.map((d) => {
              const tone = categoryTone[d.category] ?? categoryTone.Other;
              const paise = parseAmount(d.amount).paise ?? 0;
              return (
                <View key={d.key} style={styles.draftRow}>
                  {/* The row and its remove control are siblings: a button inside a button is invalid on the web. */}
                  <Tappable onPress={() => setEditing(d)} label={`Edit ${d.title}`} style={styles.draftMain}>
                    <View style={[styles.draftIcon, { backgroundColor: tone.bg }]}>
                      <Icon name={tone.icon as IconName} size={18} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[type.body, { fontWeight: "700" }]} numberOfLines={1}>
                        {d.title || "Untitled item"}
                      </Text>
                      <Text style={type.caption} numberOfLines={1}>
                        {d.category} · {d.date}
                        {d.vendor ? ` · ${d.vendor}` : ""}
                      </Text>
                      {d.evidence ? (
                        <Text style={[type.caption, { color: colors.faint }]} numberOfLines={1}>
                          from: {d.evidence}
                        </Text>
                      ) : null}
                    </View>
                    {d.confidence === "low" ? <Icon name="help-outline" size={16} color={colors.amberText} /> : null}
                    <Money paise={paise} style={{ fontSize: 14 }} />
                  </Tappable>
                  <IconButton icon="close" label={`Remove ${d.title}`} onPress={() => setDrafts((c) => c.filter((x) => x.key !== d.key))} size={18} />
                </View>
              );
            })
          )}
          {drafts.length ? (
            <View style={styles.totalRow}>
              <Text style={[type.body, { fontWeight: "700", flex: 1 }]}>Estimated so far</Text>
              <Money paise={estimatedPaise} style={{ fontSize: 17 }} />
            </View>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Card tone="ink" style={{ gap: 6, padding: space.xl }}>
            <Text style={[type.label, { color: "#91B8EE" }]}>Estimated trip cost</Text>
            <Text style={styles.bigNumber}>{formatMoney(estimatedPaise)}</Text>
            <Text style={{ color: "#B6C6DA", fontSize: 12 }}>
              from {drafts.length} itinerary item{drafts.length === 1 ? "" : "s"} · nothing has been booked or paid yet
            </Text>
          </Card>

          {estimatedPaise === 0 ? (
            <Notice tone="amber" icon="info-outline">
              No itinerary items yet, so there is nothing to estimate. Go back a step to add some, or continue and build the plan inside the trip.
            </Notice>
          ) : (
            <>
              <SectionTitle title="Where the money goes" />
              <Card style={{ gap: 12 }}>
                {categories.map((c) => {
                  const tone = categoryTone[c.category] ?? categoryTone.Other;
                  return (
                    <View key={c.category} style={{ gap: 5 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={[styles.dot, { backgroundColor: tone.fg }]} />
                        <Text style={[type.body, { flex: 1 }]}>{c.category}</Text>
                        <Text style={type.caption}>{Math.round(c.fraction * 100)}%</Text>
                        <Money paise={c.paise} style={{ fontSize: 14 }} />
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.max(2, c.fraction * 100)}%`, backgroundColor: tone.fg }]} />
                      </View>
                    </View>
                  );
                })}
              </Card>

              <SectionTitle title="Per person" />
              <Card style={{ gap: 12 }}>
                <TextField
                  label="How many people are travelling?"
                  value={headcount}
                  onChangeText={(v) => setHeadcount(v.replace(/[^0-9]/g, "").slice(0, 2))}
                  placeholder={String(people.length)}
                  keyboardType="number-pad"
                  hint="You'll name them in the next step. Change this and the per-person figure updates."
                />
                <View style={styles.perPerson}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.label}>Roughly per person</Text>
                    <Money paise={Math.round(estimatedPaise / perPersonCount)} style={{ fontSize: 24 }} />
                  </View>
                  <Text style={[type.caption, { flex: 1, textAlign: "right" }]}>
                    {formatMoney(estimatedPaise)} ÷ {perPersonCount}. Once people opt in and out of individual items, each person&apos;s real estimate will differ from this flat split.
                  </Text>
                </View>
              </Card>
            </>
          )}
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card style={{ gap: 14 }}>
            <TextField label="Your name" value={you} onChangeText={setYou} placeholder="So the group recognises you" autoFocus autoCapitalize="words" maxLength={40} error={submitted && !normaliseName(you) ? "Add your own name" : undefined} />
            <TextField label="Your UPI ID (optional)" value={yourUpi} onChangeText={(v) => setYourUpi(v.replace(/\s/g, ""))} placeholder="name@bank" autoCapitalize="none" hint="Needed only to receive money. Everyone can add theirs later." />
            <Field label="Who else is coming?" hint="Names are enough now — UPI IDs and cards can be added inside the trip.">
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                <TextField label="" value={memberDraft} onChangeText={setMemberDraft} placeholder="Name" maxLength={40} autoCapitalize="words" style={{ flex: 1 }} onSubmitEditing={addMember} returnKeyType="done" blurOnSubmit={false} />
                <Button label="Add" icon="add" variant="secondary" onPress={addMember} style={{ marginTop: 24 }} />
              </View>
              {others.length ? (
                <View style={styles.chips}>
                  {others.map((n) => (
                    <Chip key={n} label={n} selected icon="close" onPress={() => setOthers((o) => o.filter((x) => x !== n))} left={<Avatar name={n} size={20} />} />
                  ))}
                </View>
              ) : (
                <Text style={type.caption}>Just you so far.</Text>
              )}
            </Field>
          </Card>

          <SectionTitle title="Ready to create" />
          <Card style={{ gap: 8 }}>
            <Row label="Trip" value={normaliseName(name) || "—"} />
            <Row label="Where" value={normaliseName(destination) || "—"} />
            <Row label="When" value={`${startDate} → ${endDate}`} />
            <Row label="Itinerary" value={`${drafts.length} item${drafts.length === 1 ? "" : "s"}`} />
            <Row label="Estimated" value={formatMoney(estimatedPaise)} />
            <Row label="Members" value={`${people.length} · ${people.join(", ")}`} />
            {estimatedPaise > 0 ? <Row label="Each, roughly" value={formatMoney(Math.round(estimatedPaise / Math.max(1, people.length)))} /> : null}
          </Card>
          {estimatedPaise > 0 && people.length > 1 ? (
            <Notice tone="mint" icon="groups">
              {`Every itinerary item starts shared by all ${people.length}. Open any item afterwards to take people off it — the budget and everyone's share re-derive immediately.`}
            </Notice>
          ) : null}
        </>
      ) : null}

      <Sheet visible={pasteOpen} onClose={() => setPasteOpen(false)} title="Paste your itinerary" footer={
        <Button
          label="Extract items"
          icon="auto-awesome"
          full
          onPress={() => {
            if (!pasted.trim()) {
              toast("Paste some text first", "error");
              return;
            }
            applyParsed(pasted, "the pasted text");
            setPasted("");
            setPasteOpen(false);
          }}
        />
      }>
        <View style={{ gap: 12 }}>
          <Text style={type.small}>Paste a confirmation email or a plain-text itinerary. Lines with a rupee amount become itinerary items you can check and correct.</Text>
          <TextField label="Itinerary text" value={pasted} onChangeText={setPasted} placeholder={"Hotel Old Manali  Rs 62,000\nParagliding  Rs 18,000"} multiline />
          <TextLink label="Use the sample itinerary" icon="bolt" onPress={() => setPasted(SAMPLE_ITINERARY_TEXT)} />
        </View>
      </Sheet>

      <DraftEditor
        draft={editing}
        onClose={() => setEditing(null)}
        onSave={(d) => {
          setDrafts((current) => (current.some((x) => x.key === d.key) ? current.map((x) => (x.key === d.key ? d : x)) : [...current, d]));
          setEditing(null);
        }}
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <Text style={[type.small, { width: 96 }]}>{label}</Text>
      <Text style={[type.body, { flex: 1, fontWeight: "600" }]}>{value}</Text>
    </View>
  );
}

function DraftEditor({ draft, onClose, onSave }: { draft: Draft | null; onClose: () => void; onSave: (d: Draft) => void }) {
  const { toast } = useFeedback();
  const [local, setLocal] = useState<Draft | null>(draft);
  const key = draft?.key;
  if (draft && local?.key !== key) setLocal(draft);
  if (!local) return null;

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) => setLocal((d) => (d ? { ...d, [field]: value } : d));
  const parsed = parseAmount(local.amount);

  return (
    <Sheet
      visible={draft !== null}
      onClose={onClose}
      title={draft?.title ? "Edit item" : "Add itinerary item"}
      footer={
        <Button
          label="Save item"
          icon="check"
          full
          onPress={() => {
            if (!local.title.trim()) {
              toast("Give the item a title", "error");
              return;
            }
            if (parsed.error || !parsed.paise) {
              toast(parsed.error ?? "Enter an estimated cost", "error");
              return;
            }
            onSave(local);
          }}
        />
      }
    >
      <View style={{ gap: 14 }}>
        <TextField label="What is it?" value={local.title} onChangeText={(v) => set("title", v)} placeholder="e.g. Homestay · Old Manali" autoFocus maxLength={80} />
        <Field label="Category">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <Chip key={c} label={c} selected={local.category === c} onPress={() => set("category", c)} />
            ))}
          </ScrollView>
        </Field>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextField label="Estimated cost" value={local.amount} onChangeText={(v) => set("amount", v)} prefix="₹" placeholder="0" keyboardType="decimal-pad" inputMode="decimal" style={{ flex: 1.1 }} error={local.amount && parsed.error ? parsed.error : undefined} />
          <TextField label="Date" value={local.date} onChangeText={(v) => set("date", v)} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
        </View>
        {local.category === "Stay" ? <TextField label="Checkout date (optional)" value={local.endDate ?? ""} onChangeText={(v) => set("endDate", v || undefined)} placeholder="YYYY-MM-DD" hint="Used to work out nights when you change the dates." /> : null}
        <TextField label="Vendor (optional)" value={local.vendor ?? ""} onChangeText={(v) => set("vendor", v || undefined)} placeholder="Hotel, operator, restaurant…" maxLength={60} />
        {local.evidence ? (
          <Notice tone="grey" icon="description" title="Extracted from">
            {local.evidence}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: "row", gap: 8, marginBottom: 4 },
  progressBar: { height: 4, borderRadius: 2, backgroundColor: colors.line },
  importRow: { flexDirection: "row", gap: 8 },
  importCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 4, alignItems: "flex-start", minHeight: 104 },
  importIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  draftRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingVertical: 8, paddingLeft: 12, paddingRight: 6 },
  draftMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, paddingVertical: 2 },
  draftIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  totalRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  bigNumber: { color: colors.white, fontSize: 32, lineHeight: 38, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  dot: { width: 9, height: 9, borderRadius: 5 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
  perPerson: { flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
});
