"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Printer, X, Receipt } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// #25 — pull up an actual guest check (not just a link to reports) and reprint it.

interface CheckItem {
  id: string; quantity: number; unitPrice: number | string; voided?: boolean; comped?: boolean;
  notes?: string | null;
  menuItem: { name: string };
}
interface CheckPayment { id: string; amount: number | string; method: string; tip: number | string }
interface CheckOrder {
  id: string; status: string; type: string;
  subtotal: number | string; tax: number | string; total: number | string;
  createdAt: string;
  seatedAt?: string | null;
  guestName?: string | null;
  table: { number: number } | null;
  server?: { name: string } | null;
  reservation?: { name: string; date: string; time: string } | null;
  items: CheckItem[];
  payments: CheckPayment[];
}

function num(v: number | string | null | undefined): number { return Number(v ?? 0); }

function receiptHtml(o: CheckOrder): string {
  const where = o.table ? `Table ${o.table.number}` : o.type === "TAKEOUT" ? "Takeout" : "Dine In";
  const rows = o.items.filter((i) => !i.voided).map((i) =>
    `<tr><td>${i.quantity}× ${i.menuItem.name}${i.comped ? " (comp)" : ""}</td><td style="text-align:right">${i.comped ? "0.00" : (num(i.unitPrice) * i.quantity).toFixed(2)}</td></tr>`
  ).join("");
  const pays = o.payments.map((p) =>
    `<tr><td>${p.method}${num(p.tip) ? ` (tip ${num(p.tip).toFixed(2)})` : ""}</td><td style="text-align:right">${num(p.amount).toFixed(2)}</td></tr>`
  ).join("");
  return `<html><head><title>Check ${o.id.slice(-6)}</title><style>
    body{font-family:ui-monospace,monospace;font-size:12px;width:280px;margin:0 auto;padding:12px}
    h2{text-align:center;margin:4px 0}table{width:100%;border-collapse:collapse}
    .muted{color:#666;text-align:center;font-size:11px}hr{border:none;border-top:1px dashed #999;margin:8px 0}
    .tot td{font-weight:bold}</style></head><body>
    <h2>REPRINT</h2>
    <p class="muted">${where}${o.guestName ? " · " + o.guestName : ""} · ${new Date(o.seatedAt ?? o.createdAt).toLocaleString()}<br/>${o.server?.name ? "Server: " + o.server.name + " · " : ""}Check #${o.id.slice(-6)}</p>
    <hr/><table>${rows}</table><hr/>
    <table><tr><td>Subtotal</td><td style="text-align:right">${num(o.subtotal).toFixed(2)}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">${num(o.tax).toFixed(2)}</td></tr>
    <tr class="tot"><td>TOTAL</td><td style="text-align:right">${num(o.total).toFixed(2)}</td></tr></table>
    ${pays ? `<hr/><table>${pays}</table>` : ""}
    <hr/><p class="muted">Reprinted ${new Date().toLocaleString()}</p>
    <script>window.onload=function(){window.print();}</script></body></html>`;
}

export function CheckDetailModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [order, setOrder] = useState<CheckOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) throw new Error("Could not load this check.");
        const o = await res.json();
        if (active) setOrder(o);
      } catch (e) { if (active) setError(e instanceof Error ? e.message : "Failed"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [orderId]);

  function reprint() {
    if (!order) return;
    const w = window.open("", "_blank", "width=320,height=600");
    if (w) { w.document.write(receiptHtml(order)); w.document.close(); }
  }

  const where = order?.table ? `Table ${order.table.number}` : order?.type === "TAKEOUT" ? "Takeout" : "Dine In";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Receipt className="h-4 w-4 text-amber-600" /> Check</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : error || !order ? (
          <p className="text-center text-sm text-red-600 py-12">{error ?? "Not found"}</p>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{where}{order.guestName ? ` · ${order.guestName}` : ""}</p>
                <p className="text-xs text-gray-400">
                  {order.seatedAt ? `Dined ${new Date(order.seatedAt).toLocaleString()}` : new Date(order.createdAt).toLocaleString()}
                  {order.server?.name ? ` · ${order.server.name}` : ""} · #{order.id.slice(-6)}
                </p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{order.status}</span>
            </div>
            <div className="divide-y divide-gray-50 border-y border-gray-100">
              {order.items.map((i) => (
                <div key={i.id} className={`flex justify-between py-1.5 text-sm ${i.voided ? "line-through text-gray-300" : "text-gray-700"}`}>
                  <span>{i.quantity}× {i.menuItem.name}{i.comped ? " · comp" : ""}{i.notes ? <span className="text-gray-400"> ({i.notes})</span> : null}</span>
                  <span className="tabular-nums">{i.comped ? "—" : formatCurrency(num(i.unitPrice) * i.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(num(order.subtotal))}</span></div>
              <div className="flex justify-between text-gray-500"><span>Tax</span><span className="tabular-nums">{formatCurrency(num(order.tax))}</span></div>
              <div className="flex justify-between font-bold text-gray-900"><span>Total</span><span className="tabular-nums">{formatCurrency(num(order.total))}</span></div>
            </div>
            {order.payments.length > 0 && (
              <div className="border-t border-gray-100 pt-2 space-y-1 text-sm">
                {order.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-gray-500">
                    <span>{p.method}{num(p.tip) ? ` · tip ${formatCurrency(num(p.tip))}` : ""}</span>
                    <span className="tabular-nums">{formatCurrency(num(p.amount))}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={reprint} className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-900 text-white py-2.5 text-sm font-medium hover:bg-gray-800">
              <Printer className="h-4 w-4" /> Reprint receipt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface LookupOrder { id: string; total: number | string; createdAt: string; seatedAt?: string | null; guestName?: string | null; status: string; type: string; table: { number: number } | null; items: { id: string }[]; server?: { name: string } | null; reservation?: { name: string; phone?: string | null; email?: string | null } | null; customer?: { name?: string | null; phone?: string | null; email?: string | null } | null }

/** A "look up a check" button + search over recent orders, opening the detail modal. */
export function CheckLookup() {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<LookupOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Last 30 days of checks (completed/paid/closed/cancelled) — newest first.
      const res = await fetch("/api/orders?status=COMPLETED,PAID,CLOSED,CANCELLED&recent=30");
      if (res.ok) setOrders(await res.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const filtered = orders.filter((o) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    const dateStr = new Date(o.seatedAt ?? o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
    const digits = s.replace(/\D/g, "");
    const phone = (o.reservation?.phone ?? o.customer?.phone ?? "").replace(/\D/g, "");
    return (o.table ? `table ${o.table.number}` : o.type).toLowerCase().includes(s)
      || (o.guestName ?? "").toLowerCase().includes(s)
      || (o.reservation?.name ?? "").toLowerCase().includes(s)
      || (o.customer?.name ?? "").toLowerCase().includes(s)
      || (o.server?.name ?? "").toLowerCase().includes(s)
      || (o.reservation?.email ?? o.customer?.email ?? "").toLowerCase().includes(s)
      || (!!digits && phone.includes(digits))
      || o.id.slice(-6).includes(s)
      || num(o.total).toFixed(2).includes(s)
      || dateStr.includes(s);
  });

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-amber-600 hover:underline font-medium flex items-center gap-1">
        <Search className="h-3 w-3" /> Look up a check
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Look up a check</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Guest, phone, email, server, table, check #, amount, or date…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-10">No checks found.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filtered.slice(0, 50).map((o) => (
                    <button key={o.id} onClick={() => setDetailId(o.id)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-left">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {o.table ? `Table ${o.table.number}` : o.type === "TAKEOUT" ? "Takeout" : "Dine In"}
                          {o.guestName ? ` · ${o.guestName}` : ""}
                        </p>
                        <p className="text-xs text-gray-400">#{o.id.slice(-6)} · {o.items.length} items · {new Date(o.seatedAt ?? o.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{o.server?.name ? ` · ${o.server.name}` : ""}</p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(num(o.total))}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {detailId && <CheckDetailModal orderId={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
