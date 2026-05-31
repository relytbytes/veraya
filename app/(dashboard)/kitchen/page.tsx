"use client";

import { useEffect, useState, useCallback } from "react";
import { useRealtime } from "@/lib/use-realtime";
import { ChefHat, Clock, CheckCircle2, Loader2, RefreshCw, Printer, XCircle, AlertTriangle, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KitchenOrderItemModifier {
  id: string;
  option: { id: string; name: string; priceAdj: string };
}

interface KitchenOrderItem {
  id: string;
  menuItemId: string;
  quantity: number;
  notes: string | null;
  sentAt: string | null;
  completedAt: string | null;
  menuItem: { id: string; name: string; prepTime: number | null };
  modifiers: KitchenOrderItemModifier[];
}

interface KitchenOrder {
  id: string;
  status: string;
  type: string;
  notes: string | null;
  createdAt: string;
  table: { number: number } | null;
  server: { id: string; name: string } | null;
  items: KitchenOrderItem[];
}

interface EightySixEntry {
  id: string;
  menuItemId: string;
  reason: string | null;
  menuItem: { id: string; name: string };
}

function elapsed(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function elapsedSeconds(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

function urgencyColor(createdAt: string) {
  const secs = elapsedSeconds(createdAt);
  if (secs < 300) return "border-green-400 bg-green-50";
  if (secs < 600) return "border-amber-400 bg-amber-50";
  return "border-red-500 bg-red-50";
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [bumping, setBumping] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [eightySix, setEightySix] = useState<EightySixEntry[]>([]);
  const [menuItems, setMenuItems] = useState<{ id: string; name: string }[]>([]);
  const [eightySixMenuItemId, setEightySixMenuItemId] = useState("");
  const [eightySixReason, setEightySixReason] = useState("");
  const [eightySixing, setEightySixing] = useState(false);
  const [predicted86, setPredicted86] = useState<{
    ingredientId: string;
    name: string;
    unit: string;
    currentQty: number;
    hoursUntilMin: number | null;
    estimatedRunsOut: string | null;
    severity: "out" | "critical" | "warn";
    affectedMenuItems: string[];
  }[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/kitchen");
    if (res.ok) setOrders(await res.json());
    setLoading(false);
  }, []);

  async function loadEightySix() {
    const res = await fetch("/api/eightysix");
    if (res.ok) setEightySix(await res.json());
  }

  async function loadPredicted86() {
    try {
      const res = await fetch("/api/eightysix/predicted");
      if (res.ok) {
        const data = await res.json();
        setPredicted86(data.predictions ?? []);
      }
    } catch { /* silent */ }
  }

  async function loadMenuItems() {
    const res = await fetch("/api/public/menu");
    if (res.ok) {
      const data = await res.json();
      // data is array of categories with menuItems
      const all = data.flatMap((c: { menuItems: { id: string; name: string }[] }) => c.menuItems);
      setMenuItems(all);
    }
  }

  async function addEightySix() {
    if (!eightySixMenuItemId) return;
    setEightySixing(true);
    await fetch("/api/eightysix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId: eightySixMenuItemId, reason: eightySixReason || undefined }),
    });
    setEightySixMenuItemId("");
    setEightySixReason("");
    setEightySixing(false);
    loadEightySix();
  }

  async function clearEightySix(menuItemId: string) {
    await fetch("/api/eightysix", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menuItemId }),
    });
    loadEightySix();
  }

  useEffect(() => {
    load();
    loadEightySix();
    loadMenuItems();
    loadPredicted86();
    // Live updates drive freshness; polling is just a safety net now.
    const pollInterval = setInterval(() => { load(); loadEightySix(); }, 60_000);
    // Refresh predicted 86 every 5 minutes
    const predInterval = setInterval(loadPredicted86, 5 * 60 * 1000);
    return () => { clearInterval(pollInterval); clearInterval(predInterval); };
  }, [load]);

  // Live: new tickets, fires, completes, and 86 changes update instantly.
  useRealtime("kitchen", () => { load(); loadEightySix(); });

  // Tick every second to update elapsed times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  void tick; // consumed for re-render

  async function bumpOrder(orderId: string) {
    setBumping(orderId);
    const res = await fetch("/api/kitchen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, action: "bump" }),
    });
    if (!res.ok) { setBumping(null); return; }
    setBumping(null);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  function printTicket(order: KitchenOrder) {
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) return;

    const now = new Date();
    const firedAt = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const createdAt = new Date(order.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    const itemRows = order.items.map((item) => {
      const mods = (item.modifiers ?? []).map((m) => m.option.name).join(", ");
      const modLine = mods
        ? "<div style=\"padding-left:24px;font-size:14px;font-style:italic;color:#333\">(" + mods + ")</div>"
        : "";
      const noteLine = item.notes
        ? "<div style=\"padding-left:24px;font-size:13px;font-style:italic;color:#555\">" + item.notes + "</div>"
        : "";
      return "<div style=\"margin-bottom:10px\">"
        + "<div style=\"font-size:18px;font-weight:bold\">" + item.quantity + "x  " + item.menuItem.name + "</div>"
        + modLine + noteLine
        + "</div>";
    }).join("");

    const locationLabel = order.table ? "TABLE " + order.table.number : "TAKEOUT";

    const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Kitchen Ticket</title>"
      + "<style>"
      + "* { box-sizing:border-box; margin:0; padding:0; }"
      + "body { font-family:\'Courier New\',monospace; font-size:13px; width:320px; margin:0 auto; padding:16px 8px; color:#000; }"
      + ".divider { border-top:2px solid #000; margin:10px 0; }"
      + ".divider-light { border-top:1px dashed #555; margin:8px 0; }"
      + "@media print { body { padding:0; } @page { margin:4mm; size:80mm auto; } }"
      + "</style></head><body>"
      + "<div style=\"text-align:center;font-size:26px;font-weight:bold;letter-spacing:2px\">ORDER #" + order.id.slice(-6).toUpperCase() + "</div>"
      + "<div class=\"divider\"></div>"
      + "<div style=\"font-size:20px;font-weight:bold;text-align:center;margin-bottom:4px\">" + locationLabel + "</div>"
      + "<div style=\"text-align:center;color:#333;margin-bottom:8px\">Ticket in at: " + createdAt + "</div>"
      + "<div class=\"divider-light\"></div>"
      + itemRows
      + "<div class=\"divider\"></div>"
      + "<div style=\"font-size:13px;font-weight:bold\">FIRED AT: " + firedAt + "</div>"
      + "</body>"
      + "<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script>"
      + "</html>";

    win.document.write(html);
    win.document.close();
  }

  async function toggleItem(orderId: string, itemId: string, completed: boolean) {
    const prevOrders = orders;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: "IN_PROGRESS",
              items: o.items.map((i) =>
                i.id === itemId
                  ? { ...i, ...(completed ? { completedAt: new Date().toISOString() } : { sentAt: new Date().toISOString() }) }
                  : i
              ),
            }
          : o
      )
    );
    const res = await fetch("/api/kitchen", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        orderItemId: itemId,
        action: completed ? "complete" : "send",
      }),
    });
    if (!res.ok) {
      setOrders(prevOrders);
    }
  }

  const openOrders = orders.filter((o) => o.status === "OPEN");
  const inProgressOrders = orders.filter((o) => o.status === "IN_PROGRESS");

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-bold">Kitchen Display</h1>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
            {orders.length} active tickets
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Live · SSE</span>
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white"
            onClick={load}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 86 Board */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-3">
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">86&apos;d</span>
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            {eightySix.length === 0 ? (
              <span className="text-xs text-gray-600 py-0.5">Nothing 86&apos;d</span>
            ) : (
              eightySix.map((item) => (
                <span
                  key={item.menuItemId}
                  className="inline-flex items-center gap-1.5 bg-red-900/50 border border-red-700/50 text-red-300 text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {item.menuItem.name}
                  {item.reason && <span className="text-red-400/70">· {item.reason}</span>}
                  <button onClick={() => clearEightySix(item.menuItemId)} className="hover:text-white ml-0.5">
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          {/* Add 86 */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={eightySixMenuItemId}
              onChange={(e) => setEightySixMenuItemId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1 focus:outline-none focus:border-red-500"
            >
              <option value="">86 an item…</option>
              {menuItems
                .filter((m) => !eightySix.some((e) => e.menuItemId === m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </select>
            <input
              value={eightySixReason}
              onChange={(e) => setEightySixReason(e.target.value)}
              placeholder="Reason (optional)"
              className="bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 px-2 py-1 w-32 focus:outline-none focus:border-red-500"
            />
            <button
              onClick={addEightySix}
              disabled={!eightySixMenuItemId || eightySixing}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold px-3 py-1 rounded transition-colors"
            >
              86 It
            </button>
          </div>
        </div>
      </div>

      {/* Predictive 86 strip */}
      {predicted86.length > 0 && (
        <div className="bg-gray-900 border-b border-gray-800 px-6 py-2.5">
          <div className="flex items-start gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <TrendingDown className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Predicted</span>
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {predicted86.map((p) => {
                const isOut = p.severity === "out";
                const isCrit = p.severity === "critical";
                const color = isOut
                  ? "bg-red-900/60 border-red-600/60 text-red-300"
                  : isCrit
                  ? "bg-orange-900/50 border-orange-600/50 text-orange-300"
                  : "bg-amber-900/40 border-amber-600/40 text-amber-300";
                const timeStr = isOut
                  ? "OUT NOW"
                  : p.hoursUntilMin !== null
                  ? p.hoursUntilMin < 1
                    ? `${Math.round(p.hoursUntilMin * 60)}m`
                    : `${p.hoursUntilMin.toFixed(1)}h`
                  : "?";
                return (
                  <span
                    key={p.ingredientId}
                    title={`Affected: ${p.affectedMenuItems.join(", ")}\nOn hand: ${p.currentQty.toFixed(2)} ${p.unit}`}
                    className={`inline-flex items-center gap-1.5 border text-xs font-medium px-2.5 py-0.5 rounded-full cursor-default ${color}`}
                  >
                    {p.name}
                    <span className="opacity-70">·</span>
                    <span className="font-bold">{timeStr}</span>
                  </span>
                );
              })}
            </div>
            <span className="text-[10px] text-gray-600 shrink-0 self-center">based on today&apos;s pace</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-gray-600">
          <ChefHat className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">No active tickets</p>
          <p className="text-sm mt-1">All caught up!</p>
        </div>
      ) : (
        <div className="p-6 space-y-8">
          {/* New Orders */}
          {openOrders.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                New Orders ({openOrders.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {openOrders.map((order) => (
                  <TicketCard
                    key={order.id}
                    order={order}
                    onBump={bumpOrder}
                    onToggleItem={toggleItem}
                    onPrint={printTicket}
                    bumping={bumping === order.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* In Progress */}
          {inProgressOrders.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                In Progress ({inProgressOrders.length})
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {inProgressOrders.map((order) => (
                  <TicketCard
                    key={order.id}
                    order={order}
                    onBump={bumpOrder}
                    onToggleItem={toggleItem}
                    onPrint={printTicket}
                    bumping={bumping === order.id}
                  />
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
  order,
  onBump,
  onToggleItem,
  onPrint,
  bumping,
}: {
  order: KitchenOrder;
  onBump: (id: string) => void;
  onToggleItem: (orderId: string, itemId: string, completed: boolean) => void;
  onPrint: (order: KitchenOrder) => void;
  bumping: boolean;
}) {
  const allDone = order.items.every((i) => i.completedAt);

  return (
    <div
      className={cn(
        "rounded-xl border-2 overflow-hidden flex flex-col",
        urgencyColor(order.createdAt)
      )}
    >
      {/* Ticket header */}
      <div className="bg-gray-900/80 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="text-sm font-bold text-white">
            {order.table ? `Table ${order.table.number}` : order.type === "TAKEOUT" ? "Takeout" : "Delivery"}
          </span>
          {order.server && (
            <span className="text-xs text-gray-400 ml-2">· {order.server.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="h-3 w-3 text-gray-400" />
            <span className="text-gray-300 font-mono">{elapsed(order.createdAt)}</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onPrint(order); }}
            className="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-700 transition-colors"
            title="Print ticket"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-3 space-y-2">
        {order.items.map((item) => (
          <button
            key={item.id}
            onClick={() => onToggleItem(order.id, item.id, !item.completedAt)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg flex items-start gap-2 transition-all",
              item.completedAt
                ? "bg-green-900/40 opacity-60"
                : item.sentAt
                ? "bg-amber-900/40"
                : "bg-gray-800/60 hover:bg-gray-700/60"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                item.completedAt
                  ? "border-green-400 bg-green-400 text-gray-900"
                  : "border-gray-500"
              )}
            >
              {item.completedAt && <CheckCircle2 className="h-3 w-3" />}
            </span>
            <div className="flex-1 min-w-0">
              <span
                className={cn(
                  "text-sm font-semibold",
                  item.completedAt ? "line-through text-gray-500" : "text-white"
                )}
              >
                {item.quantity}× {item.menuItem.name}
              </span>
              {(item.modifiers ?? []).length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.modifiers.map((m) => m.option.name).join(", ")}
                </p>
              )}
              {item.notes && (
                <p className="text-xs text-amber-300 mt-0.5">⚠ {item.notes}</p>
              )}
              {item.menuItem.prepTime && !item.completedAt && (
                <p className="text-xs text-gray-500 mt-0.5">{item.menuItem.prepTime}m</p>
              )}
            </div>
          </button>
        ))}

        {order.notes && (
          <p className="text-xs text-amber-200 bg-amber-900/30 rounded px-2 py-1 mt-2">
            📝 {order.notes}
          </p>
        )}
      </div>

      {/* Bump button */}
      <div className="p-3 pt-0">
        <button
          onClick={() => onBump(order.id)}
          disabled={bumping}
          className={cn(
            "w-full py-2 rounded-lg text-sm font-bold transition-all",
            allDone
              ? "bg-green-500 hover:bg-green-400 text-white"
              : "bg-amber-500 hover:bg-amber-400 text-gray-900"
          )}
        >
          {bumping ? (
            <Loader2 className="h-4 w-4 animate-spin mx-auto" />
          ) : allDone ? (
            "✓ BUMP"
          ) : (
            "MARK READY"
          )}
        </button>
      </div>
    </div>
  );
}
