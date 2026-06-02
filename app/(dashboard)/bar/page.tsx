"use client";

import { useEffect, useState, useCallback } from "react";
import { useRealtime } from "@/lib/use-realtime";
import { GlassWater, Clock, CheckCircle2, Loader2, RefreshCw, Printer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BarOrderItemModifier {
  id: string;
  option: { id: string; name: string; priceAdj: string };
}

interface BarOrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  notes: string | null;
  firedAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  menuItem: { id: string; name: string; prepTime: number | null };
  modifiers: BarOrderItemModifier[];
}

// Group a ticket's items into fire rounds by firedAt (see kitchen page).
function fireRounds<T extends { firedAt: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = it.firedAt ?? "initial";
    const arr = groups.get(k) ?? [];
    arr.push(it);
    groups.set(k, arr);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === "initial") return -1;
    if (b === "initial") return 1;
    return new Date(a).getTime() - new Date(b).getTime();
  });
  return keys.map((k) => ({ key: k, firedAt: k === "initial" ? null : k, items: groups.get(k)! }));
}

interface BarOrder {
  id: string;
  status: string;
  type: string;
  notes: string | null;
  createdAt: string;
  table: { number: number } | null;
  server: { id: string; name: string } | null;
  items: BarOrderItem[];
}

function elapsed(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function urgencyColor(createdAt: string) {
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs < 180) return "border-[#1E7A45] bg-[#1E7A45]/10";
  if (secs < 360) return "border-warning-400 bg-warning-50";
  return "border-red-500 bg-red-50";
}

export default function BarPage() {
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [bumping, setBumping] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen?station=BAR");
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const poll = setInterval(load, 60_000); // safety net; SSE drives freshness
    return () => clearInterval(poll);
  }, [load]);

  // Bar + kitchen events share the "kitchen" realtime scope.
  useRealtime("kitchen", () => { load(); });

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  void tick;

  async function bumpOrder(orderId: string) {
    setBumping(orderId);
    const res = await fetch("/api/kitchen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, action: "bump", station: "BAR" }),
    });
    setBumping(null);
    if (res.ok) setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function toggleItem(orderId: string, itemId: string, completed: boolean) {
    const prev = orders;
    setOrders((os) =>
      os.map((o) =>
        o.id === orderId
          ? {
              ...o,
              items: o.items.map((i) =>
                i.id === itemId
                  ? { ...i, completedAt: completed ? new Date().toISOString() : null }
                  : i
              ),
            }
          : o
      )
    );
    const res = await fetch("/api/kitchen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, orderItemId: itemId, action: completed ? "complete" : "uncomplete", station: "BAR" }),
    });
    if (!res.ok) setOrders(prev);
  }

  function printTicket(order: BarOrder) {
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) return;
    const now = new Date();
    const firedAt = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const createdAt = new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const itemRows = order.items.map((item) => {
      const mods = (item.modifiers ?? []).map((m) => m.option.name).join(", ");
      const modLine = mods ? "<div style=\"padding-left:24px;font-size:14px;font-style:italic;color:#333\">(" + mods + ")</div>" : "";
      const noteLine = item.notes ? "<div style=\"padding-left:24px;font-size:13px;font-style:italic;color:#555\">" + item.notes + "</div>" : "";
      return "<div style=\"margin-bottom:10px\"><div style=\"font-size:18px;font-weight:bold\">" + item.quantity + "x  " + item.menuItem.name + "</div>" + modLine + noteLine + "</div>";
    }).join("");
    const locationLabel = order.table ? "TABLE " + order.table.number : "TAKEOUT";
    const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Bar Ticket</title>"
      + "<style>* { box-sizing:border-box; margin:0; padding:0; } body { font-family:'Courier New',monospace; font-size:13px; width:320px; margin:0 auto; padding:16px 8px; color:#000; } .divider { border-top:2px solid #000; margin:10px 0; } .divider-light { border-top:1px dashed #555; margin:8px 0; } @media print { body { padding:0; } @page { margin:4mm; size:80mm auto; } }</style></head><body>"
      + "<div style=\"text-align:center;font-size:26px;font-weight:bold;letter-spacing:2px\">BAR #" + order.id.slice(-6).toUpperCase() + "</div>"
      + "<div class=\"divider\"></div>"
      + "<div style=\"font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px\">" + locationLabel + "</div>"
      + "<div style=\"text-align:center;color:#333;margin-bottom:8px\">Ticket in at: " + createdAt + "</div>"
      + "<div class=\"divider-light\"></div>" + itemRows + "<div class=\"divider\"></div>"
      + "<div style=\"font-size:13px;font-weight:bold\">FIRED AT: " + firedAt + "</div></body>"
      + "<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script></html>";
    win.document.write(html);
    win.document.close();
  }

  const openOrders = orders.filter((o) => o.status === "OPEN");
  const inProgressOrders = orders.filter((o) => o.status === "IN_PROGRESS");

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GlassWater className="h-6 w-6 text-teal-400" />
          <h1 className="text-xl font-bold">Bar Display</h1>
          <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30">
            {orders.length} active tickets
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Live · SSE</span>
          <Button variant="ghost" size="icon" aria-label="Refresh" className="text-gray-400 hover:text-white" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-gray-600">
          <GlassWater className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">No drink tickets</p>
          <p className="text-sm mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="p-6 space-y-8">
          {openOrders.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">New ({openOrders.length})</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {openOrders.map((order) => (
                  <TicketCard key={order.id} order={order} onBump={bumpOrder} onToggleItem={toggleItem} onPrint={printTicket} bumping={bumping === order.id} />
                ))}
              </div>
            </section>
          )}
          {inProgressOrders.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">In Progress ({inProgressOrders.length})</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {inProgressOrders.map((order) => (
                  <TicketCard key={order.id} order={order} onBump={bumpOrder} onToggleItem={toggleItem} onPrint={printTicket} bumping={bumping === order.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TicketCard({
  order, onBump, onToggleItem, onPrint, bumping,
}: {
  order: BarOrder;
  onBump: (id: string) => void;
  onToggleItem: (orderId: string, itemId: string, completed: boolean) => void;
  onPrint: (order: BarOrder) => void;
  bumping: boolean;
}) {
  const allDone = order.items.every((i) => i.completedAt);
  return (
    <div className={cn("rounded-xl border-2 overflow-hidden flex flex-col", urgencyColor(order.createdAt))}>
      <div className="bg-gray-900/80 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-white">
            {order.table ? `Table ${order.table.number}` : order.type === "TAKEOUT" ? "Takeout" : "Delivery"}
          </span>
          {order.server && <span className="text-xs text-gray-400 ml-2">· {order.server.name}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-gray-300 font-mono">{elapsed(order.createdAt)}</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onPrint(order); }} className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors" title="Print ticket">
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-2">
        {(() => {
          const rounds = fireRounds(order.items);
          const multi = rounds.length > 1;
          // Only the current round can be un-selected; earlier rounds lock once done.
          const currentKey = rounds[rounds.length - 1]?.key;
          return rounds.map((round, ri) => {
            const isCurrentRound = round.key === currentKey;
            return (
            <div key={round.key} className="space-y-2">
              {multi && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-teal-300">Round {ri + 1}</span>
                  {round.firedAt && (
                    <span className="text-[10px] text-gray-500 font-mono">
                      {new Date(round.firedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <div className="flex-1 border-t border-gray-700/60" />
                </div>
              )}
              {round.items.map((item) => {
                const locked = !!item.completedAt && !isCurrentRound;
                return (
                <button
                  key={item.id}
                  onClick={() => { if (!locked) onToggleItem(order.id, item.id, !item.completedAt); }}
                  title={locked ? "Completed in an earlier round — can't unselect" : undefined}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-all",
                    item.completedAt ? "bg-[#1E7A45]/25 opacity-60" : item.sentAt ? "bg-teal-900/40" : "bg-gray-800/60 hover:bg-gray-700/60",
                    locked && "cursor-default"
                  )}
                >
                  <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", item.completedAt ? "border-[#1E7A45] bg-[#1E7A45] text-white" : "border-gray-500")}>
                    {item.completedAt && <CheckCircle2 className="h-3 w-3" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn("text-sm font-semibold", item.completedAt ? "line-through text-gray-500" : "text-white")}>
                      {item.quantity}× {item.menuItem.name}
                    </span>
                    {(item.modifiers ?? []).length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">{item.modifiers.map((m) => m.option.name).join(", ")}</p>
                    )}
                    {item.notes && <p className="text-xs text-teal-300 mt-0.5">⚠ {item.notes}</p>}
                  </div>
                </button>
                );
              })}
            </div>
            );
          });
        })()}
        {order.notes && <p className="text-xs text-amber-200 bg-amber-900/30 rounded px-2 py-1 mt-2">📝 {order.notes}</p>}
      </div>

      <div className="p-3 pt-0">
        <button
          onClick={() => onBump(order.id)}
          disabled={bumping}
          className={cn("w-full py-2 rounded-lg text-sm font-bold transition-all", allDone ? "bg-[#1E7A45] hover:bg-[#259457] text-white" : "bg-teal-500 hover:bg-teal-400 text-gray-900")}
        >
          {bumping ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : allDone ? "✓ BUMP" : "MARK READY"}
        </button>
      </div>
    </div>
  );
}
