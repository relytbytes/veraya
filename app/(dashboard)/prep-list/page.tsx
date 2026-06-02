"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ChefHat, RefreshCw, Printer, ChevronLeft, ChevronRight,
  CheckSquare, Square, AlertTriangle, Calendar, TrendingUp,
  Package,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PrepRow {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  forecastQty: number;
  currentOnHand: number;
  minThreshold: number;
  prepNeeded: number;
  menuItems: string[];
}

interface ForecastItem {
  menuItemId: string;
  name: string;
  category: string;
  avgQty: number;
  historicalQty: number;
  weeksTracked: number;
}

interface PrepData {
  targetDate: string;
  targetDOW: string;
  weeksAnalyzed: number;
  coverFactor: number;
  confirmedCovers: number;
  avgHistoricalOrders: number;
  forecastItems: ForecastItem[];
  prepRows: PrepRow[];
  summary: {
    totalItemsToPrep: number;
    totalForecastCost: number;
    totalIngredients: number;
    reservationCount: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt2(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PrepListPage() {
  const [data, setData] = useState<PrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [targetDate, setTargetDate] = useState(() => localISO(addDays(new Date(), 1)));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"prep" | "forecast">("prep");
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setChecked(new Set());
    try {
      const res = await fetch(`/api/prep-list?date=${date}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(targetDate); }, [targetDate, load]);

  function shiftDate(n: number) {
    const d = new Date(targetDate + "T00:00:00");
    setTargetDate(localISO(addDays(d, n)));
  }

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function checkAll() {
    if (!data) return;
    const ids = data.prepRows.filter(r => r.prepNeeded > 0).map(r => r.ingredientId);
    setChecked(new Set(ids));
  }

  function uncheckAll() { setChecked(new Set()); }

  function handlePrint() {
    window.print();
  }

  const today = localISO(new Date());
  const tomorrow = localISO(addDays(new Date(), 1));

  const dateLabel = targetDate === today ? "Today"
    : targetDate === tomorrow ? "Tomorrow"
    : new Date(targetDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  const itemsNeedingPrep = data?.prepRows.filter(r => r.prepNeeded > 0) ?? [];
  const itemsStocked = data?.prepRows.filter(r => r.prepNeeded === 0) ?? [];
  const checkedCount = itemsNeedingPrep.filter(r => checked.has(r.ingredientId)).length;

  return (
    <div>
      <Header
        title="Prep List"
        description={`${data?.targetDOW ?? ""} · ${dateLabel}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              onClick={() => load(targetDate)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-5 print:p-4">
        {/* Date picker row */}
        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center gap-1 border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => shiftDate(-1)} className="p-2 hover:bg-gray-50 transition-colors">
              <ChevronLeft className="h-4 w-4 text-gray-500" />
            </button>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="text-sm font-medium text-gray-700 px-2 py-1.5 focus:outline-none border-x border-gray-200 bg-white"
            />
            <button onClick={() => shiftDate(1)} className="p-2 hover:bg-gray-50 transition-colors">
              <ChevronRight className="h-4 w-4 text-gray-500" />
            </button>
          </div>

          {/* Quick-access buttons */}
          {[
            { label: "Yesterday", d: -1 },
            { label: "Today", d: 0 },
            { label: "Tomorrow", d: 1 },
          ].map(({ label, d }) => {
            const iso = localISO(addDays(new Date(), d));
            return (
              <button
                key={label}
                onClick={() => setTargetDate(iso)}
                className={cn(
                  "text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                  targetDate === iso
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-gray-200 text-gray-500 hover:text-gray-700"
                )}
              >
                {label}
              </button>
            );
          })}

          {/* View toggle */}
          <div className="ml-auto flex gap-1 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setView("prep")}
              className={cn("text-xs px-3 py-1 rounded-md font-medium transition-colors",
                view === "prep" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Prep List
            </button>
            <button
              onClick={() => setView("forecast")}
              className={cn("text-xs px-3 py-1 rounded-md font-medium transition-colors",
                view === "forecast" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-700"
              )}
            >
              Sales Forecast
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-center text-gray-400 py-12">Could not load prep data</p>
        ) : view === "forecast" ? (
          <ForecastView data={data} />
        ) : (
          <PrepView
            data={data}
            checked={checked}
            checkedCount={checkedCount}
            itemsNeedingPrep={itemsNeedingPrep}
            itemsStocked={itemsStocked}
            onToggle={toggleCheck}
            onCheckAll={checkAll}
            onUncheckAll={uncheckAll}
            dateLabel={dateLabel}
            printRef={printRef}
          />
        )}
      </div>
    </div>
  );
}

// ── Prep View ──────────────────────────────────────────────────────────────────

function PrepView({
  data,
  checked,
  checkedCount,
  itemsNeedingPrep,
  itemsStocked,
  onToggle,
  onCheckAll,
  onUncheckAll,
  dateLabel,
  printRef,
}: {
  data: PrepData;
  checked: Set<string>;
  checkedCount: number;
  itemsNeedingPrep: PrepRow[];
  itemsStocked: PrepRow[];
  onToggle: (id: string) => void;
  onCheckAll: () => void;
  onUncheckAll: () => void;
  dateLabel: string;
  printRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={printRef} className="space-y-5">
      {/* Print header (hidden on screen) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Prep List — {data.targetDOW} {dateLabel}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Based on {data.weeksAnalyzed} week{data.weeksAnalyzed !== 1 ? "s" : ""} of history ·
          {data.confirmedCovers > 0 ? ` ${data.confirmedCovers} covers booked ·` : ""}
          {` ${data.summary.reservationCount} reservation${data.summary.reservationCount !== 1 ? "s" : ""}`}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Printed {new Date().toLocaleString()}</p>
        <hr className="my-3" />
      </div>

      {/* Context bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        {[
          {
            label: "History Used",
            value: `${data.weeksAnalyzed} week${data.weeksAnalyzed !== 1 ? "s" : ""}`,
            icon: <TrendingUp className="h-4 w-4 text-blue-500" />,
            bg: "bg-blue-50",
            sub: "same day-of-week",
          },
          {
            label: "Reservations",
            value: String(data.summary.reservationCount),
            icon: <Calendar className="h-4 w-4 text-purple-500" />,
            bg: "bg-purple-50",
            sub: data.confirmedCovers > 0 ? `${data.confirmedCovers} covers` : "none booked",
          },
          {
            label: "Items to Prep",
            value: String(data.summary.totalItemsToPrep),
            icon: <ChefHat className="h-4 w-4 text-amber-500" />,
            bg: "bg-amber-50",
            sub: "need quantities pulled",
          },
          {
            label: "Estimated COGS",
            value: formatCurrency(data.summary.totalForecastCost),
            icon: <Package className="h-4 w-4 text-green-600" />,
            bg: "bg-green-50",
            sub: "forecast ingredient cost",
          },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500">{kpi.label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </div>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.bg}`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* No data warning */}
      {data.weeksAnalyzed === 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-warning-600 shrink-0 mt-0.5" />
          <p className="text-sm text-warning-800">
            No historical sales data found for this day of week yet. The prep list will populate after your
            first few services on {data.targetDOW}s.
          </p>
        </div>
      )}

      {/* Cover factor adjustment notice */}
      {data.confirmedCovers > 0 && Math.abs(data.coverFactor - 1) > 0.05 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 print:hidden">
          <Calendar className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Quantities adjusted <span className="font-semibold">{data.coverFactor > 1 ? "up" : "down"} {Math.abs((data.coverFactor - 1) * 100).toFixed(0)}%</span> based on{" "}
            <span className="font-semibold">{data.confirmedCovers} covers</span> booked vs historical average.
          </p>
        </div>
      )}

      {/* Prep checklist */}
      {itemsNeedingPrep.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-900">Items to Prep</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {checkedCount} of {itemsNeedingPrep.length} done
              </p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button onClick={onCheckAll} className="text-xs text-amber-600 hover:underline font-medium">Check all</button>
              <span className="text-gray-300">·</span>
              <button onClick={onUncheckAll} className="text-xs text-gray-400 hover:underline">Clear</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-10 px-4 py-3 print:hidden" />
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Ingredient</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Forecast Need</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">On Hand</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600 bg-amber-50/60">Prep Qty</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Used In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {itemsNeedingPrep.map((row) => {
                  const isDone = checked.has(row.ingredientId);
                  return (
                    <tr
                      key={row.ingredientId}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-gray-50",
                        isDone && "opacity-50"
                      )}
                      onClick={() => onToggle(row.ingredientId)}
                    >
                      <td className="pl-4 py-3 print:hidden">
                        {isDone
                          ? <CheckSquare className="h-5 w-5 text-green-500" />
                          : <Square className="h-5 w-5 text-gray-300" />
                        }
                      </td>
                      <td className="px-4 py-3">
                        <p className={cn("font-medium text-gray-900", isDone && "line-through")}>{row.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {fmt2(row.forecastQty)} <span className="text-gray-400 text-xs">{row.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                        {fmt2(row.currentOnHand)} <span className="text-gray-400 text-xs">{row.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-right bg-amber-50/40">
                        <span className="text-lg font-bold text-amber-700 tabular-nums">{fmt2(row.prepNeeded)}</span>
                        <span className="text-gray-500 text-xs ml-1">{row.unit}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">
                        {row.menuItems.slice(0, 3).join(", ")}
                        {row.menuItems.length > 3 && ` +${row.menuItems.length - 3}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stocked items (collapsed by default) */}
      {itemsStocked.length > 0 && (
        <details className="bg-white border border-gray-200 rounded-xl overflow-hidden print:hidden">
          <summary className="px-5 py-4 cursor-pointer select-none text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <Package className="h-4 w-4 text-green-500" />
            {itemsStocked.length} ingredient{itemsStocked.length !== 1 ? "s" : ""} already stocked (no prep needed)
          </summary>
          <div className="border-t border-gray-100">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {itemsStocked.map((row) => (
                  <tr key={row.ingredientId} className="px-4 py-2.5">
                    <td className="px-4 py-2.5 font-medium text-gray-600">{row.name}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400">
                      Need {fmt2(row.forecastQty)} · Have {fmt2(row.currentOnHand)} {row.unit}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Stocked</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {itemsNeedingPrep.length === 0 && itemsStocked.length === 0 && data.weeksAnalyzed > 0 && (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <ChefHat className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No prep requirements found</p>
          <p className="text-sm text-gray-400 mt-1">Make sure menu items have recipes with ingredients assigned</p>
        </div>
      )}
    </div>
  );
}

// ── Forecast View ──────────────────────────────────────────────────────────────

function ForecastView({ data }: { data: PrepData }) {
  const byCategory = new Map<string, ForecastItem[]>();
  for (const item of data.forecastItems) {
    const cat = item.category;
    const group = byCategory.get(cat) ?? [];
    group.push(item);
    byCategory.set(cat, group);
  }

  return (
    <div className="space-y-5">
      {/* Context */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
        <span className="font-semibold">Expected sales for {data.targetDOW}</span> — averaged from{" "}
        {data.weeksAnalyzed} week{data.weeksAnalyzed !== 1 ? "s" : ""} of same-DOW history
        {data.confirmedCovers > 0 && `, adjusted for ${data.confirmedCovers} confirmed covers`}
        {data.coverFactor !== 1 && (
          <span className="ml-1">({data.coverFactor > 1 ? "+" : ""}{((data.coverFactor - 1) * 100).toFixed(0)}% adjustment)</span>
        )}
      </div>

      {data.forecastItems.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
          <TrendingUp className="h-10 w-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No forecast data yet</p>
          <p className="text-sm text-gray-400 mt-1">Sales history will populate here after your first {data.targetDOW} service</p>
        </div>
      ) : (
        Array.from(byCategory.entries()).map(([cat, items]) => (
          <div key={cat} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">{cat}</p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Item</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Avg Sold</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Total (all weeks)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-500 text-xs">Weeks Tracked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item) => (
                  <tr key={item.menuItemId} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-700 tabular-nums">
                      {item.avgQty}×
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums">{item.historicalQty}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{item.weeksTracked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
