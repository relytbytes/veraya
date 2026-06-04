"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Loader2, Plus, Trash2, Check, RotateCcw, Ticket } from "lucide-react";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const toCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);

interface Tier { id: string; name: string; description: string | null; priceCents: number; depositCents: number | null; capacity: number; sold: number; remaining: number; active: boolean; }
interface OrderItem { tierName: string; quantity: number; unitPriceCents: number; }
interface Order { id: string; confirmationCode: string; name: string; email: string; phone: string | null; status: string; amountPaidCents: number; checkedInAt: string | null; seats: number; items: OrderItem[]; }
interface Data { enabled: boolean; mode: string; tiers: Tier[]; totalRemaining: number; orders: Order[]; summary: { orders: number; seatsSold: number; revenueCents: number; checkedIn: number }; }

export function EventTicketingPanel({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"setup" | "attendees">("setup");
  const [busy, setBusy] = useState(false);
  const [newTier, setNewTier] = useState({ name: "", price: "", deposit: "", capacity: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/ticketing`);
    if (res.ok) setData(await res.json());
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function patchEvent(body: object) {
    setBusy(true);
    await fetch(`/api/events/${eventId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load(); setBusy(false);
  }

  async function addTier() {
    if (!newTier.name.trim() || !newTier.price || !newTier.capacity) return;
    setBusy(true);
    await fetch(`/api/events/${eventId}/tiers`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTier.name.trim(), priceCents: toCents(newTier.price), depositCents: newTier.deposit ? toCents(newTier.deposit) : null, capacity: parseInt(newTier.capacity) || 0 }),
    });
    setNewTier({ name: "", price: "", deposit: "", capacity: "" });
    await load(); setBusy(false);
  }

  async function deleteTier(t: Tier) {
    if (!(await confirmDialog(t.sold > 0 ? `"${t.name}" has ${t.sold} sold — it will be hidden from new buyers.` : `Delete "${t.name}"?`))) return;
    setBusy(true);
    await fetch(`/api/events/${eventId}/tiers/${t.id}`, { method: "DELETE" });
    await load(); setBusy(false);
  }

  async function orderAction(o: Order, action: string) {
    if (action === "refund" && !(await confirmDialog(`Refund ${o.name}'s ${money(o.amountPaidCents)} and release ${o.seats} seat${o.seats !== 1 ? "s" : ""}?`))) return;
    setBusy(true);
    await fetch(`/api/events/${eventId}/orders/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    await load(); setBusy(false);
  }

  const s = data?.summary;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Ticket className="h-4 w-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-gray-800">Tickets</h3>
      </div>
      {!data ? (
        <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : (
          <div className="space-y-4">
            {/* Enable + mode */}
            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="font-semibold text-sm">Sell tickets for this event</p>
                <p className="text-xs text-gray-500">Adds a buy widget to the public event page.</p>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={data.enabled} onChange={(e) => patchEvent({ ticketingEnabled: e.target.checked })} />
                <div className="w-10 h-6 bg-gray-200 peer-checked:bg-teal-500 rounded-full relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:h-5 after:w-5 after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </div>

            {data.enabled && (
              <>
                {/* Mode */}
                <div className="flex gap-2">
                  {(["TICKET", "DEPOSIT"] as const).map((m) => (
                    <button key={m} onClick={() => patchEvent({ ticketMode: m })} disabled={busy}
                      className={`flex-1 rounded-lg border px-3 py-2 text-left text-sm ${data.mode === m ? "border-teal-500 bg-teal-50" : "border-gray-200"}`}>
                      <span className="font-semibold">{m === "TICKET" ? "Full ticket price" : "Deposit to reserve"}</span>
                      <span className="block text-xs text-gray-500">{m === "TICKET" ? "Pay the whole price now" : "Pay a deposit now, balance at the event"}</span>
                    </button>
                  ))}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 border-b">
                  {(["setup", "attendees"] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? "border-teal-500 text-teal-700" : "border-transparent text-gray-500"}`}>
                      {t === "setup" ? "Tiers" : `Attendees (${s?.orders ?? 0})`}
                    </button>
                  ))}
                </div>

                {tab === "setup" ? (
                  <div className="space-y-2">
                    {data.tiers.filter((t) => t.active).map((t) => (
                      <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
                        <div>
                          <p className="text-sm font-semibold">{t.name} <span className="text-gray-400 font-normal">· {money(t.priceCents)}{t.depositCents != null && data.mode === "DEPOSIT" ? ` (${money(t.depositCents)} dep)` : ""}</span></p>
                          <p className="text-xs text-gray-500">{t.sold} sold · {t.remaining} of {t.capacity} left</p>
                        </div>
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteTier(t)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ))}
                    {/* Add tier */}
                    <div className="rounded-lg border border-dashed p-3 grid grid-cols-2 gap-2">
                      <input value={newTier.name} onChange={(e) => setNewTier({ ...newTier, name: e.target.value })} placeholder="Tier name (e.g. VIP)" className="col-span-2 rounded border px-2 py-1.5 text-sm" />
                      <input value={newTier.price} onChange={(e) => setNewTier({ ...newTier, price: e.target.value })} placeholder="Price $" inputMode="decimal" className="rounded border px-2 py-1.5 text-sm" />
                      <input value={newTier.capacity} onChange={(e) => setNewTier({ ...newTier, capacity: e.target.value })} placeholder="Seats" inputMode="numeric" className="rounded border px-2 py-1.5 text-sm" />
                      {data.mode === "DEPOSIT" && (
                        <input value={newTier.deposit} onChange={(e) => setNewTier({ ...newTier, deposit: e.target.value })} placeholder="Deposit $ (now)" inputMode="decimal" className="col-span-2 rounded border px-2 py-1.5 text-sm" />
                      )}
                      <Button size="sm" className="col-span-2 gap-1" onClick={addTier} disabled={busy || !newTier.name || !newTier.price || !newTier.capacity}><Plus className="h-3.5 w-3.5" /> Add tier</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold">{s?.seatsSold ?? 0}</p><p className="text-[11px] text-gray-500">seats sold</p></div>
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold text-emerald-600">{money(s?.revenueCents ?? 0)}</p><p className="text-[11px] text-gray-500">collected</p></div>
                      <div className="rounded-lg border p-2"><p className="text-lg font-bold">{s?.checkedIn ?? 0}</p><p className="text-[11px] text-gray-500">checked in</p></div>
                    </div>
                    {data.orders.length === 0 ? (
                      <p className="text-center text-sm text-gray-400 py-6">No tickets sold yet.</p>
                    ) : data.orders.map((o) => (
                      <div key={o.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold flex items-center gap-2">{o.name}
                              {o.status === "CHECKED_IN" && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5">CHECKED IN</span>}
                              {o.status === "REFUNDED" && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">REFUNDED</span>}
                            </p>
                            <p className="text-xs text-gray-500">{o.items.map((it) => `${it.quantity}× ${it.tierName}`).join(", ")} · {money(o.amountPaidCents)} · <span className="font-mono">{o.confirmationCode}</span></p>
                          </div>
                          {o.status !== "REFUNDED" && (
                            <div className="flex items-center gap-1 shrink-0">
                              {o.status === "CHECKED_IN" ? (
                                <Button variant="ghost" size="sm" onClick={() => orderAction(o, "uncheckin")}><RotateCcw className="h-3.5 w-3.5" /></Button>
                              ) : (
                                <Button size="sm" className="gap-1" onClick={() => orderAction(o, "checkin")}><Check className="h-3.5 w-3.5" /> Check in</Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-red-600 text-xs" onClick={() => orderAction(o, "refund")}>Refund</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
    </div>
  );
}
