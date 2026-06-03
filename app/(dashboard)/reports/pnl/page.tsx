"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PnlResolvedRow } from "@/lib/pnl";

function firstOfMonthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const pct = (p: number | null) => (p == null ? "" : `${(p * 100).toFixed(1)}%`);

export default function PnlPage() {
  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<PnlResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reports/pnl?from=${from}&to=${to}`);
    if (res.ok) { const d = await res.json(); setRows(d.rows); }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  async function saveManual(lineKey: string, amount: number) {
    setSavingKey(lineKey);
    await fetch("/api/reports/pnl", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, lineKey, amount }),
    });
    await load();
    setSavingKey(null);
  }

  const metrics = rows.filter((r) => r.kind === "metric");
  const statement = rows.filter((r) => r.kind !== "metric");

  return (
    <div className="flex flex-col h-full">
      <Header title="P&L Statement" description="Full operating statement — auto-filled from POS, labor & recipes; overhead entered by managers." />
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Period */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400 mb-2" />}
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <Card key={m.key}>
              <CardContent className="p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">{m.label}</p>
                <p className="text-lg font-bold text-gray-900">
                  {m.key === "m_ppa" ? formatCurrency(m.value) : m.value.toLocaleString("en-US")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Statement */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left font-medium px-4 py-2">Line Item</th>
                  <th className="text-right font-medium px-4 py-2 w-40">Amount</th>
                  <th className="text-right font-medium px-4 py-2 w-24">% Net</th>
                </tr>
              </thead>
              <tbody>
                {statement.map((r) => {
                  if (r.kind === "header") {
                    return (
                      <tr key={r.key} className="bg-gray-50">
                        <td colSpan={3} className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {r.label}
                        </td>
                      </tr>
                    );
                  }
                  const isSub = r.kind === "subtotal";
                  return (
                    <tr key={r.key} className={cn("border-b border-gray-50", isSub && "bg-gray-50/60")}>
                      <td className={cn("px-4 py-1.5", r.indent === 1 && "pl-8", r.indent === 2 && "pl-12",
                        isSub && "font-bold text-gray-900", r.emphasize && "text-[15px]")}>
                        {r.label}
                      </td>
                      <td className={cn("px-4 py-1.5 text-right tabular-nums", isSub ? "font-bold text-gray-900" : "text-gray-700")}>
                        {r.input === "manual" ? (
                          <span className="inline-flex items-center gap-1">
                            {savingKey === r.key && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                            <span className="text-gray-400">$</span>
                            <input
                              type="number"
                              step="0.01"
                              defaultValue={r.value || ""}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== r.value) saveManual(r.key, v);
                              }}
                              className="w-24 text-right rounded border border-gray-200 px-1.5 py-0.5 tabular-nums focus:border-teal-400 focus:outline-none"
                              placeholder="0"
                            />
                          </span>
                        ) : (
                          formatCurrency(r.value)
                        )}
                      </td>
                      <td className={cn("px-4 py-1.5 text-right tabular-nums text-xs", isSub ? "font-semibold text-gray-700" : "text-gray-400")}>
                        {pct(r.pct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-400">
          Auto lines (sales, comps, voids, food &amp; beverage cost, direct labor) come from POS, recipes and the time clock for the
          selected period. Overhead lines are entered here and saved per period. Sales categories are bucketed by menu category &amp; station.
        </p>
      </div>
    </div>
  );
}
