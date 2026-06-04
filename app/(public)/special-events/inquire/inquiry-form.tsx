"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";

const TYPES = ["Wine dinner", "Private dinner", "Celebration / party", "Corporate / group", "Other"];

export function InquiryForm({ accent }: { accent: string }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", eventType: TYPES[0], date: "", partySize: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 transition-colors";

  async function submit() {
    setError(null);
    if (!form.name.trim() || !form.email.trim()) { setError("Name and email are required."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/public/events/inquire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined,
          eventType: form.eventType, date: form.date || undefined,
          partySize: form.partySize ? Number(form.partySize) : undefined, message: form.message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); setLoading(false); return; }
      setDone(true);
    } catch { setError("Network error. Please try again."); setLoading(false); }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 size={42} style={{ color: accent }} className="mx-auto mb-3" />
        <h2 className="font-display text-2xl text-stone-900">Thank you — we&apos;ll be in touch</h2>
        <p className="text-sm text-stone-500 mt-2">Your inquiry has reached our events team. We typically respond within a day.</p>
        <Link href="/special-events" className="inline-block text-sm font-medium mt-5" style={{ color: accent }}>← Back to events</Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-7 shadow-sm space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" className={field} />
        <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Email" type="email" className={field} />
        <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone (optional)" type="tel" className={field} />
        <select value={form.eventType} onChange={(e) => set("eventType", e.target.value)} className={field}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div>
          <label className="block text-[11px] font-medium text-stone-400 mb-1 ml-0.5">Preferred date</label>
          <input value={form.date} onChange={(e) => set("date", e.target.value)} type="date" className={field} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-stone-400 mb-1 ml-0.5">Approx. guests</label>
          <input value={form.partySize} onChange={(e) => set("partySize", e.target.value)} placeholder="e.g. 20" inputMode="numeric" className={field} />
        </div>
      </div>
      <textarea value={form.message} onChange={(e) => set("message", e.target.value)} placeholder="Tell us about your event — occasion, vibe, any requests…" rows={4} className={field} />

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button onClick={submit} disabled={loading} className="w-full rounded-xl py-3 font-semibold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ backgroundColor: accent }}>
        {loading ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : "Send inquiry"}
      </button>
    </div>
  );
}
