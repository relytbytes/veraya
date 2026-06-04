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

const GOLD = "#d4a853";
const TEXT = "#f5f0e8";
const MUTED = "#8a7a60";
const PANEL = "#231809";
const BORDER = "#3a2e1a";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function TicketPurchase({ eventId, mode, tiers }: { eventId: string; mode: string; tiers: Tier[] }) {
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
      window.location.href = data.url; // → Stripe Checkout
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border p-6" style={{ backgroundColor: PANEL, borderColor: BORDER }}>
      <div className="flex items-center gap-2 mb-1">
        <Ticket size={18} style={{ color: GOLD }} />
        <h2 className="text-lg font-bold" style={{ color: TEXT }}>{mode === "DEPOSIT" ? "Reserve your seats" : "Get tickets"}</h2>
      </div>
      <p className="text-xs mb-5" style={{ color: MUTED }}>
        {mode === "DEPOSIT" ? "Pay a deposit now to hold your seats; the balance is settled at the event." : "Secure checkout — you'll receive a confirmation and entry code by email."}
      </p>

      {/* Tiers */}
      <div className="space-y-3 mb-5">
        {sellable.map((t) => {
          const out = t.remaining <= 0;
          const n = qty[t.id] ?? 0;
          return (
            <div key={t.id} className="rounded-xl border p-3.5" style={{ borderColor: BORDER, opacity: out ? 0.55 : 1 }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm" style={{ color: TEXT }}>{t.name}</p>
                  {t.description && <p className="text-xs mt-0.5" style={{ color: MUTED }}>{t.description}</p>}
                  <p className="text-sm mt-1" style={{ color: GOLD }}>
                    {money(t.priceCents)}
                    {mode === "DEPOSIT" && t.chargeNowCents !== t.priceCents && (
                      <span style={{ color: MUTED }}> · {money(t.chargeNowCents)} deposit</span>
                    )}
                  </p>
                </div>
                {out ? (
                  <span className="text-xs font-semibold shrink-0" style={{ color: MUTED }}>Sold out</span>
                ) : (
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setQ(t.id, -1, t.remaining)} disabled={n === 0} className="h-7 w-7 rounded-full border flex items-center justify-center disabled:opacity-30" style={{ borderColor: BORDER, color: TEXT }}><Minus size={13} /></button>
                    <span className="w-5 text-center font-bold tabular-nums" style={{ color: TEXT }}>{n}</span>
                    <button onClick={() => setQ(t.id, 1, t.remaining)} disabled={n >= t.remaining} className="h-7 w-7 rounded-full flex items-center justify-center disabled:opacity-30" style={{ backgroundColor: GOLD, color: "#1a1208" }}><Plus size={13} /></button>
                  </div>
                )}
              </div>
              {!out && t.remaining <= 6 && <p className="text-[11px] mt-1.5" style={{ color: GOLD }}>Only {t.remaining} left</p>}
            </div>
          );
        })}
      </div>

      {allSoldOut ? (
        <p className="text-center text-sm font-semibold py-3" style={{ color: MUTED }}>This event is sold out.</p>
      ) : (
        <>
          {/* Buyer */}
          <div className="space-y-2.5 mb-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: "#1a1208", borderColor: BORDER, color: TEXT }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: "#1a1208", borderColor: BORDER, color: TEXT }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none" style={{ backgroundColor: "#1a1208", borderColor: BORDER, color: TEXT }} />
          </div>

          {seats > 0 && (
            <div className="flex items-center justify-between mb-3 text-sm">
              <span style={{ color: MUTED }}>{seats} {seats === 1 ? "seat" : "seats"} · {mode === "DEPOSIT" ? "deposit due now" : "total"}</span>
              <span className="font-bold text-lg" style={{ color: TEXT }}>{money(totalNow)}</span>
            </div>
          )}

          {error && <p className="text-xs mb-3" style={{ color: "#e0795a" }}>{error}</p>}

          <button
            onClick={checkout}
            disabled={loading || seats === 0}
            className="w-full rounded-xl py-3 font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ backgroundColor: GOLD, color: "#1a1208" }}
          >
            {loading ? <><Loader2 size={15} className="animate-spin" /> Redirecting…</> : <>Continue to payment — {money(totalNow)}</>}
          </button>
          <p className="text-[11px] text-center mt-2.5" style={{ color: MUTED }}>Secured by Stripe.</p>
        </>
      )}
    </div>
  );
}
