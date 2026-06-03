"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/header";
import { PnlStatement } from "./pnl-statement";
import {
  getFiscalPeriods, getFiscalQuarters, getFiscalYearRange, findFiscalPeriod, fmtShort, toISODate,
} from "@/lib/fiscal";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PnlPage() {
  const today = useMemo(() => new Date(), []);
  const currentPeriod = useMemo(() => findFiscalPeriod(today), [today]);
  const currentFy = currentPeriod?.year ?? today.getFullYear();

  const [fy, setFy] = useState(currentFy);
  // Selection key: "P1".."P12", "Q1".."Q4", "YEAR", or "CUSTOM".
  const [sel, setSel] = useState<string>(currentPeriod ? `P${currentPeriod.n}` : "P1");
  const [customFrom, setCustomFrom] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`);
  const [customTo, setCustomTo] = useState(todayISO());

  const periods = useMemo(() => getFiscalPeriods(fy), [fy]);
  const quarters = useMemo(() => getFiscalQuarters(fy), [fy]);

  const yearOptions = [currentFy + 1, currentFy, currentFy - 1, currentFy - 2, currentFy - 3];

  // Resolve the active range from the selection.
  const range = useMemo(() => {
    if (sel === "CUSTOM") return { from: customFrom, to: customTo, label: "Custom range", weeks: null as number | null };
    if (sel === "YEAR") {
      const y = getFiscalYearRange(fy);
      return { from: y.from, to: y.to, label: `Full Year FY${fy}`, weeks: 52 };
    }
    if (sel.startsWith("Q")) {
      const q = quarters.find((x) => x.label === sel)!;
      return { from: q.from, to: q.to, label: `${q.label} FY${fy} (P${q.periods[0]}–P${q.periods[2]})`, weeks: 13 };
    }
    const p = periods.find((x) => x.label === sel) ?? periods[0];
    return { from: p.from, to: p.to, label: `${p.label} FY${fy}`, weeks: p.weeks };
  }, [sel, fy, periods, quarters, customFrom, customTo]);

  const closed = range.to < todayISO();
  const fmtRange = (fromISO: string, toISO: string) => {
    const f = new Date(fromISO + "T12:00:00"), t = new Date(toISO + "T12:00:00");
    const yr = t.getFullYear();
    return `${fmtShort(f)} – ${fmtShort(t)}, ${yr}`;
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="P&L Statement" description="True period-close operating statement — auto-filled from POS, labor & recipes; overhead entered by managers." />
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fiscal year</label>
            <select
              value={fy}
              onChange={(e) => setFy(Number(e.target.value))}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {yearOptions.map((y) => <option key={y} value={y}>FY{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period</label>
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 min-w-[15rem]"
            >
              <optgroup label="Periods (financial close)">
                {periods.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} · {fmtShort(p.fromDate)} – {fmtShort(p.toDate)} ({p.weeks}wk)
                  </option>
                ))}
              </optgroup>
              <optgroup label="Quarters">
                {quarters.map((q) => (
                  <option key={q.label} value={q.label}>{q.label} · P{q.periods[0]}–P{q.periods[2]} (13wk)</option>
                ))}
              </optgroup>
              <optgroup label="Other">
                <option value="YEAR">Full Year FY{fy}</option>
                <option value="CUSTOM">Custom range…</option>
              </optgroup>
            </select>
          </div>

          {sel === "CUSTOM" && (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-md border border-gray-200 px-2 text-sm" />
              </div>
            </>
          )}
        </div>

        {/* Resolved range + close status */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-gray-900">{range.label}</span>
          <span className="text-gray-400">·</span>
          <span className="text-gray-600">{fmtRange(range.from, range.to)}</span>
          {range.weeks != null && <span className="text-gray-400">· {range.weeks} weeks</span>}
          {sel !== "CUSTOM" && (
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${closed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {closed ? "Closed" : "Open · through today"}
            </span>
          )}
        </div>

        <PnlStatement from={range.from} to={range.to} />
      </div>
    </div>
  );
}
