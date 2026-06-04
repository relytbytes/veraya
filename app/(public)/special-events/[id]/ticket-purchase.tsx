"use client";

import { useState } from "react";
import { Minus, Plus, Loader2, Ticket } from "lucide-react";

interface Tier {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  chargeNowCents: number;
  remaining: number;
  active: boolean;
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function TicketPurchase({ eventId, mode, tiers, accent }: { eventId: string; mode: string; tiers: Tier[]; accent: string }) {
  const sellable = tiers.filter((t) => t.active);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setQ = (id: string, delta: number, max: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(max, (q[id] ?? 0) + delta)) }));

  const seats = Object.values(qty).reduce((a, n) => a + n, 0);
  const totalNow = sellable.reduce((a, t) => a + (qty[t.id] ?? 0) * t.chargeNowCents, 0);
  const allSoldOut = sellable.every((t) => t.remaining <= 0);

  async function checkout() {
    setError(null);
    if (!name.trim() || !email.trim()) { setError("Enter your name and email."); return; }
    if (seats === 0) { setError("Choose at least one ticket."); return; }
    setLoading(true);
    try {
      const items = sellable.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => ({ tierId: t.id, quantity: qty[t.id] }));
      const res = await fetch(`/api/public/events/${eventId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, items }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Couldn't start checkout."); setLoading(false); return; }
      window.location.assign(data.url);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  const field = "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:border-stone-400 transition-colors";

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Ticket size={17} style={{ color: accent }} />
        <h2 className="font-display text-xl text-stone-900">{mode === "DEPOSIT" ? "Reserve your seats" : "Get tickets"}</h2>
      </div>
      <p className="text-[13px] text-stone-500 mb-5 leading-relaxed">
        {mode === "DEPOSIT" ? "Pay a deposit now to hold your seats; the balance is settled at the event." : "Secure checkout — you'll receive a confirmation and entry code."}
      </p>

      <div className="space-y-2.5 mb-5">
        {sellable.map((t) => {
          const out = t.remaining <= 0;
          const n = qty[t.id] ?? 0;
          return (
            <div key={t.id} className="rounded-xl border border-stone-200 p-3.5" style={{ opacity: out ? 0.5 : 1 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] text-stone-900">{t.name}</p>
                  {t.description && <p className="text-xs mt-0.5 text-stone-500">{t.description}</p>}
                  <p className="text-sm mt-1 font-medium" style={{ color: accent }}>
                    {money(t.priceCents)}
                    {mode === "DEPOSIT" && t.chargeNowCents !== t.priceCents && <span className="text-stone-400 font-normal"> · {money(t.chargeNowCents)} deposit</span>}
                  </p>
                </div>
                {out ? (
                  <span className="text-xs font-semibold text-stone-400 shrink-0">Sold out</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setQ(t.id, -1, t.remaining)} disabled={n === 0} className="h-7 w-7 rounded-full border border-stone-200 flex items-center justify-center text-stone-600 disabled:opacity-30 hover:bg-stone-50"><Minus size={13} /></button>
                    <span className="w-5 text-center font-bold tabular-nums text-stone-900">{n}</span>
                    <button onClick={() => setQ(t.id, 1, t.remaining)} disabled={n >= t.remaining} className="h-7 w-7 rounded-full flex items-center justify-center text-white disabled:opacity-30" style={{ backgroundColor: accent }}><Plus size={13} /></button>
                  </div>
                )}
              </div>
              {!out && t.remaining <= 6 && <p className="text-[11px] mt-1.5 font-medium" style={{ color: accent }}>Only {t.remaining} left</p>}
            </div>
          );
        })}
      </div>

      {allSoldOut ? (
        <p className="text-center text-sm font-semibold text-stone-400 py-3">This event is sold out.</p>
      ) : (
        <>
          <div className="space-y-2.5 mb-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={field} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className={field} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" className={field} />
          </div>

          {seats > 0 && (
            <div className="flex items-center justify-between mb-3 text-sm">
              <span className="text-stone-500">{seats} {seats === 1 ? "seat" : "seats"} · {mode === "DEPOSIT" ? "deposit due now" : "total"}</span>
              <span className="font-bold text-lg text-stone-900">{money(totalNow)}</span>
            </div>
          )}

          {error && <p className="text-xs mb-3 text-red-600">{error}</p>}

          <button onClick={checkout} disabled={loading || seats === 0} className="w-full rounded-xl py-3 font-semibold text-sm text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-40" style={{ backgroundColor: accent }}>
            {loading ? <><Loader2 size={15} className="animate-spin" /> Redirecting…</> : <>Continue to payment — {money(totalNow)}</>}
          </button>
          <p className="text-[11px] text-center mt-2.5 text-stone-400">Secured by Stripe.</p>
        </>
      )}
    </div>
  );
}
