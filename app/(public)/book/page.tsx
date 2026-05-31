"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Loader2, Users, ChevronLeft, CalendarDays, Clock, PartyPopper } from "lucide-react";
import { CardStep } from "./card-step";

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${String(m).padStart(2, "0")}${period}`;
}

function dateLabel(d: string): string {
  if (d === localDate(0)) return "Today";
  if (d === localDate(1)) return "Tomorrow";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function periodOf(t: string): "Breakfast" | "Lunch" | "Dinner" {
  const [h, m] = t.split(":").map(Number);
  const mins = h * 60 + m;
  if (mins < 11 * 60 + 30) return "Breakfast";
  if (mins < 16 * 60) return "Lunch";
  return "Dinner";
}

interface SlotAvailability { time: string; available: boolean }

const OCCASIONS = [
  { label: "🎂 Birthday", value: "Birthday celebration" },
  { label: "💍 Anniversary", value: "Anniversary celebration" },
  { label: "🎉 Celebration", value: "Special occasion" },
  { label: "💼 Business", value: "Business meal" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [step, setStep] = useState<"when" | "who" | "card">("when");
  const [card, setCard] = useState<{ clientSecret: string; amountCents: number } | null>(null);
  const [form, setForm] = useState({
    date: localDate(0), time: "", partySize: 2,
    name: "", phone: "", email: "", notes: "",
  });
  const [occasion, setOccasion] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{
    id: string; name: string; date: string; time: string; partySize: number;
    table?: { number: number } | null;
  } | null>(null);

  const set = (field: string, value: string | number) => setForm((f) => ({ ...f, [field]: value }));

  const fetchSlots = useCallback(async (date: string, partySize: number) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/public/reservations?date=${date}&partySize=${partySize}`);
      if (!res.ok) return;
      const data: { slots: SlotAvailability[] } = await res.json();
      setSlots(data.slots);
      // Drop the selected time if it's no longer bookable.
      setForm((f) => (data.slots.find((s) => s.time === f.time && s.available) ? f : { ...f, time: "" }));
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => { fetchSlots(form.date, form.partySize); }, [form.date, form.partySize, fetchSlots]);

  // Step 2 → either go straight to booking, or collect a card hold first.
  async function proceed() {
    setError(null);
    setLoading(true);
    try {
      const pi = await fetch("/api/public/reservations/payment-intent", { method: "POST" });
      const piData = await pi.json().catch(() => ({}));
      if (pi.ok && piData.required && piData.clientSecret) {
        setCard({ clientSecret: piData.clientSecret, amountCents: piData.amountCents });
        setStep("card");
        return;
      }
      await finalize();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function finalize(stripePaymentIntentId?: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/public/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          notes: [occasion, form.notes].filter(Boolean).join(" — ") || undefined,
          stripePaymentIntentId,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error === "card_required" ? "A card is required to hold this reservation." : (d.error ?? "Couldn't complete your reservation."));
      }
      setConfirmed(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("when");
      fetchSlots(form.date, form.partySize);
    } finally {
      setLoading(false);
    }
  }

  // ── Confirmation ────────────────────────────────────────────────────────────
  if (confirmed) {
    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">You&apos;re booked!</h2>
          <p className="text-gray-500 mb-6">A confirmation text is on its way. We can&apos;t wait to host you.</p>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-left space-y-2.5 text-sm">
            <Row label="Name" value={confirmed.name} />
            <Row label="Date" value={dateLabel(confirmed.date)} />
            <Row label="Time" value={formatTime(confirmed.time)} />
            <Row label="Party" value={`${confirmed.partySize} ${confirmed.partySize === 1 ? "guest" : "guests"}`} />
            {confirmed.table && <Row label="Table" value={`Table ${confirmed.table.number}`} />}
            <Row label="Confirmation" value={confirmed.id.slice(-8).toUpperCase()} />
          </div>
          <button
            onClick={() => { setConfirmed(null); setStep("when"); setOccasion(null); setForm((f) => ({ ...f, name: "", phone: "", email: "", notes: "", time: "" })); fetchSlots(form.date, form.partySize); }}
            className="mt-6 text-sm font-medium text-amber-700 hover:text-amber-800"
          >
            Make another reservation
          </button>
        </div>
      </div>
    );
  }

  const grouped = (["Breakfast", "Lunch", "Dinner"] as const)
    .map((p) => ({ period: p, slots: slots.filter((s) => periodOf(s.time) === p) }))
    .filter((g) => g.slots.length > 0);
  const anyAvailable = slots.some((s) => s.available);

  // ── Wizard ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Reserve a Table</h2>
        <p className="text-gray-500 mt-1 text-sm">Instant confirmation. We&apos;ll text you the details.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4 text-xs font-medium">
        <span className={step === "when" ? "text-amber-700" : "text-gray-400"}>1 · When</span>
        <span className="h-px flex-1 bg-gray-200" />
        <span className={step === "who" ? "text-amber-700" : "text-gray-400"}>2 · Your details</span>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6 space-y-5">
        {step === "when" ? (
          <>
            {/* Party size */}
            <div>
              <Label icon={<Users className="h-3.5 w-3.5" />}>Party size</Label>
              <div className="grid grid-cols-8 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button key={n} type="button" onClick={() => set("partySize", n)}
                    className={pill(form.partySize === n)}>{n}{n === 8 ? "+" : ""}</button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div>
              <Label icon={<CalendarDays className="h-3.5 w-3.5" />}>Date</Label>
              <div className="flex flex-wrap gap-1.5">
                {[0, 1, 2, 3, 4].map((off) => {
                  const d = localDate(off);
                  return (
                    <button key={d} type="button" onClick={() => set("date", d)} className={pill(form.date === d)}>
                      {off === 0 ? "Today" : off === 1 ? "Tom" : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </button>
                  );
                })}
                <input type="date" min={localDate(0)} value={form.date} onChange={(e) => set("date", e.target.value)}
                  className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>

            {/* Time slots grouped by period */}
            <div>
              <Label icon={<Clock className="h-3.5 w-3.5" />}>
                Time {loadingSlots && <Loader2 className="h-3 w-3 animate-spin text-gray-400 inline ml-1" />}
              </Label>
              {!anyAvailable && !loadingSlots ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  Fully booked for {form.partySize} on {dateLabel(form.date)}. Try another date or party size.
                </p>
              ) : (
                <div className="space-y-3">
                  {grouped.map(({ period, slots: ps }) => (
                    <div key={period}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{period}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {ps.map(({ time, available }) => (
                          <button key={time} type="button" disabled={!available}
                            onClick={() => set("time", time)}
                            className={cn(
                              "py-2 rounded-lg text-sm font-medium border transition-colors",
                              !available ? "border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed"
                                : form.time === time ? "bg-amber-600 border-amber-600 text-white"
                                : "border-gray-300 text-gray-700 hover:border-amber-400 hover:text-amber-700",
                            )}>
                            {formatTime(time)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="button" disabled={!form.time}
              onClick={() => setStep("who")}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm transition-colors">
              {form.time ? `Continue · ${dateLabel(form.date)} at ${formatTime(form.time)}` : "Select a time"}
            </button>
          </>
        ) : step === "card" && card ? (
          <CardStep
            clientSecret={card.clientSecret}
            holdAmountCents={card.amountCents}
            onAuthorized={(pi) => finalize(pi)}
            onBack={() => setStep("who")}
          />
        ) : (
          <>
            {/* Summary chip */}
            <button type="button" onClick={() => setStep("when")}
              className="flex w-full items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-900 hover:bg-amber-100 transition-colors">
              <ChevronLeft className="h-4 w-4" />
              <span className="font-semibold">{dateLabel(form.date)} · {formatTime(form.time)}</span>
              <span className="text-amber-700">· {form.partySize} {form.partySize === 1 ? "guest" : "guests"}</span>
              <span className="ml-auto text-xs text-amber-600">Change</span>
            </button>

            <div>
              <Label>Name</Label>
              <input type="text" required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" className={input} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 000-0000" className={input} />
              </div>
              <div>
                <Label>Email</Label>
                <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" className={input} />
              </div>
            </div>
            <div>
              <Label icon={<PartyPopper className="h-3.5 w-3.5" />}>Occasion <span className="text-gray-400 font-normal">(optional)</span></Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {OCCASIONS.map(({ label, value }) => (
                  <button key={value} type="button" onClick={() => setOccasion((p) => (p === value ? null : value))}
                    className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                      occasion === value ? "bg-amber-600 border-amber-600 text-white" : "border-gray-300 text-gray-600 hover:border-amber-400")}>
                    {label}
                  </button>
                ))}
              </div>
              <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)}
                placeholder="Allergies, seating preferences…" className={cn(input, "resize-none")} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

            <button type="button" disabled={loading || !form.name.trim()} onClick={proceed}
              className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Confirming…" : "Confirm Reservation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }

const input = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500";

function pill(active: boolean) {
  return cn(
    "py-1.5 px-2 rounded-lg text-sm font-medium border transition-colors text-center",
    active ? "bg-amber-600 border-amber-600 text-white" : "border-gray-300 text-gray-700 hover:border-amber-400",
  );
}

function Label({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
      {icon}{children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-900">{value}</span>
    </div>
  );
}
