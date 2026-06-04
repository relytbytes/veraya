"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft, ChevronRight, Loader2, Download, Lock, LockOpen, FileText, CalendarClock,
} from "lucide-react";

interface RegisterLine {
  userId: string;
  name: string;
  role: string;
  employmentType: string;
  hourlyRateCents: number;
  regularHours: number;
  otHours: number;
  totalHours: number;
  regularPayCents: number;
  otPayCents: number;
  salaryPayCents: number;
  tipsCents: number;
  grossPayCents: number;
  lineId: string | null;
  adjustmentCents: number;
  adjustmentNote: string | null;
  netGrossCents: number;
}
interface Totals {
  employeeCount: number; regularHours: number; otHours: number;
  regularPayCents: number; otPayCents: number; salaryPayCents: number;
  tipsCents: number; adjustmentCents: number; grossPayCents: number;
}
interface Register {
  period: { index: number; start: string; end: string; label: string; cadence: string };
  config: { otThresholdHours: number; otMultiplier: number; periodsPerYear: number };
  run: { id: string; status: string; notes: string | null; finalizedAt: string | null } | null;
  lines: RegisterLine[];
  totals: Totals;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager", SERVER: "Server", HOST: "Host",
  BARTENDER: "Bartender", BARBACK: "Barback", SERVER_ASSISTANT: "Server Asst", FOOD_RUNNER: "Food Runner",
};
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (h: number) => h.toFixed(2);

export default function PayrollPage() {
  const [index, setIndex] = useState<number | null>(null); // null → server picks current
  const [data, setData] = useState<Register | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Local edit buffer for adjustment inputs, keyed by userId (dollar strings).
  const [adjDraft, setAdjDraft] = useState<Record<string, string>>({});

  const load = useCallback(async (idx: number | null) => {
    setLoading(true);
    setError(null);
    try {
      const qs = idx !== null ? `?index=${idx}` : "";
      const res = await fetch(`/api/payroll${qs}`);
      if (res.status === 403) { setError("Payroll is restricted to managers."); setData(null); return; }
      if (!res.ok) throw new Error("Failed to load payroll");
      const reg = (await res.json()) as Register;
      setData(reg);
      setIndex(reg.period.index);
      setAdjDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

  const finalized = data?.run?.status === "FINALIZED";

  async function step(dir: number) {
    if (index === null) return;
    await load(index + dir);
  }

  async function runAction(action: "open" | "finalize" | "reopen") {
    if (index === null) return;
    setBusy(action);
    try {
      const res = await fetch("/api/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, action }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Action failed");
      await load(index);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveAdjustment(line: RegisterLine) {
    if (index === null) return;
    const raw = adjDraft[line.userId];
    if (raw === undefined) return; // not edited
    const dollars = Number(raw);
    const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
    if (cents === line.adjustmentCents) return; // unchanged
    setBusy(`adj-${line.userId}`);
    try {
      const res = await fetch("/api/payroll/line", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, userId: line.userId, adjustmentCents: cents }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save adjustment");
      await load(index);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save adjustment");
    } finally {
      setBusy(null);
    }
  }

  const statusBadge = (() => {
    if (!data?.run) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Not started</span>;
    if (finalized) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Finalized</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Draft</span>;
  })();

  return (
    <div>
      <Header
        title="Payroll"
        description="Gross-pay register per pay period — hours from the time clock, rates from staff profiles. Export for your payroll provider; Veraya does not calculate tax withholding."
        actions={
          data ? (
            <div className="flex items-center gap-2">
              <a href={`/api/payroll/export?index=${data.period.index}`}>
                <Button variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> Export CSV</Button>
              </a>
              {!finalized ? (
                <>
                  {!data.run && (
                    <Button variant="outline" disabled={busy !== null} onClick={() => runAction("open")} className="gap-1.5">
                      {busy === "open" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Save draft
                    </Button>
                  )}
                  <Button disabled={busy !== null || data.lines.length === 0} onClick={() => runAction("finalize")} className="gap-1.5">
                    {busy === "finalize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Finalize
                  </Button>
                </>
              ) : (
                <Button variant="outline" disabled={busy !== null} onClick={() => runAction("reopen")} className="gap-1.5">
                  {busy === "reopen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} Reopen
                </Button>
              )}
            </div>
          ) : null
        }
      />

      <div className="p-6 space-y-4">
        {/* Period stepper */}
        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
          <button onClick={() => step(-1)} disabled={loading || index === null}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <CalendarClock className="h-4 w-4 text-teal-600" />
              <span className="font-semibold text-gray-900">{data?.period.label ?? "—"}</span>
              {statusBadge}
            </div>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                {data.period.start} → {data.period.end} · {data.config.otMultiplier}× OT over {data.config.otThresholdHours} hrs/wk
                {index !== null && index !== 0 && (
                  <button onClick={() => load(null)} className="ml-2 text-teal-600 hover:underline">Jump to current</button>
                )}
              </p>
            )}
          </div>
          <button onClick={() => step(1)} disabled={loading || index === null}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : data && data.lines.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <th className="text-left font-medium px-4 py-2.5">Employee</th>
                    <th className="text-left font-medium px-3 py-2.5">Type</th>
                    <th className="text-right font-medium px-3 py-2.5">Rate</th>
                    <th className="text-right font-medium px-3 py-2.5">Reg hrs</th>
                    <th className="text-right font-medium px-3 py-2.5">OT hrs</th>
                    <th className="text-right font-medium px-3 py-2.5">Reg pay</th>
                    <th className="text-right font-medium px-3 py-2.5">OT pay</th>
                    <th className="text-right font-medium px-3 py-2.5">Salary</th>
                    <th className="text-right font-medium px-3 py-2.5">Tips</th>
                    <th className="text-right font-medium px-3 py-2.5">Adjustment</th>
                    <th className="text-right font-medium px-4 py-2.5">Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.lines.map((l) => {
                    const isSalary = l.employmentType === "SALARY";
                    const draftVal = adjDraft[l.userId] ?? (l.adjustmentCents !== 0 ? (l.adjustmentCents / 100).toFixed(2) : "");
                    return (
                      <tr key={l.userId} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-gray-900">{l.name}</div>
                          <div className="text-xs text-gray-400">{ROLE_LABELS[l.role] ?? l.role}</div>
                        </td>
                        <td className="px-3 py-2.5 text-gray-500">{isSalary ? "Salary" : "Hourly"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{isSalary ? "—" : money(l.hourlyRateCents)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{isSalary ? hrs(l.regularHours) : hrs(l.regularHours)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{l.otHours > 0 ? <span className="text-amber-600 font-medium">{hrs(l.otHours)}</span> : "—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{isSalary ? "—" : money(l.regularPayCents)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{l.otPayCents > 0 ? money(l.otPayCents) : "—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{isSalary ? money(l.salaryPayCents) : "—"}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{l.tipsCents > 0 ? money(l.tipsCents) : "—"}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="relative inline-flex items-center">
                            <span className="absolute left-2 text-gray-400 text-xs">$</span>
                            <input
                              type="number"
                              step="0.01"
                              disabled={finalized || busy !== null}
                              value={draftVal}
                              placeholder="0.00"
                              onChange={(e) => setAdjDraft((p) => ({ ...p, [l.userId]: e.target.value }))}
                              onBlur={() => saveAdjustment(l)}
                              className="w-24 text-right rounded-md border border-gray-200 pl-5 pr-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{money(l.netGrossCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-900 border-t-2 border-gray-200">
                    <td className="px-4 py-3" colSpan={3}>{data.totals.employeeCount} employee{data.totals.employeeCount === 1 ? "" : "s"}</td>
                    <td className="px-3 py-3 text-right">{hrs(data.totals.regularHours)}</td>
                    <td className="px-3 py-3 text-right">{data.totals.otHours > 0 ? hrs(data.totals.otHours) : "—"}</td>
                    <td className="px-3 py-3 text-right">{money(data.totals.regularPayCents)}</td>
                    <td className="px-3 py-3 text-right">{money(data.totals.otPayCents)}</td>
                    <td className="px-3 py-3 text-right">{money(data.totals.salaryPayCents)}</td>
                    <td className="px-3 py-3 text-right text-gray-500">{money(data.totals.tipsCents)}</td>
                    <td className="px-3 py-3 text-right">{money(data.totals.adjustmentCents)}</td>
                    <td className="px-4 py-3 text-right text-teal-700">{money(data.totals.grossPayCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
              Tips are shown for reporting only and are not included in gross pay. Gross pay = regular + overtime + salary + adjustments.
              {finalized && data.run?.finalizedAt && <> · Finalized {new Date(data.run.finalizedAt).toLocaleDateString()}.</>}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl py-16 text-center text-gray-400">
            <p className="font-medium">No hours recorded this period</p>
            <p className="text-sm mt-1">Clock entries in this pay period will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
