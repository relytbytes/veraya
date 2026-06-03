"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { PnlResolvedRow } from "@/lib/pnl";

const pctTxt = (p: number | null) => (p == null ? "" : `${(p * 100).toFixed(1)}%`);

/** Annotate each row with the collapsible section it belongs to (the header key),
 *  or null for headers/metrics/headline-subtotals that always show. */
function withSections(rows: PnlResolvedRow[]) {
  let section: string | null = null;
  return rows.map((r) => {
    let belongs: string | null;
    if (r.kind === "header") { section = r.key; belongs = null; }
    else if (r.kind === "metric") { section = null; belongs = null; }
    else if (r.kind === "subtotal" && r.emphasize) { section = null; belongs = null; } // Net Sales / Cost of Sales / Performance Earnings
    else if (r.kind === "line" && r.indent === 0) { section = null; belongs = null; }   // standalone lines
    else belongs = section;
    return { ...r, _section: belongs };
  });
}

export function PnlStatement({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<PnlResolvedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

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

  async function exportXlsx() {
    setExporting(true);
    try {
      const res = await fetch("/api/reports/pnl/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, rows }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `veraya-pnl-${from}_${to}.xlsx`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    } finally { setExporting(false); }
  }

  const toggle = (key: string) => setCollapsed((p) => {
    const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  const annotated = withSections(rows);
  const metrics = annotated.filter((r) => r.kind === "metric");
  const statement = annotated.filter((r) => r.kind !== "metric");
  // For a collapsed section header, show its total inline (the section's subtotal row).
  const sectionTotal = (headerKey: string) => {
    const idx = statement.findIndex((r) => r.key === headerKey);
    for (let i = idx + 1; i < statement.length; i++) {
      if (statement[i].kind === "header") break;
      if (statement[i].kind === "subtotal" && (statement[i] as { _section: string | null })._section === headerKey) return statement[i].value;
    }
    return null;
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-bold text-gray-900">P&amp;L Statement</h3>
            <p className="text-xs text-gray-500">Full operating statement — overhead lines are editable; tap a section to collapse.</p>
          </div>
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={exporting || !rows.length}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
          </Button>
        </div>

        {loading && !rows.length ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : (
          <>
            {metrics.length > 0 && (
              <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
                {metrics.map((m) => (
                  <div key={m.key} className="bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">{m.label}</p>
                    <p className="text-base font-bold text-gray-900">
                      {m.key === "m_ppa" ? formatCurrency(m.value) : m.value.toLocaleString("en-US")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <table className="w-full text-sm">
              <tbody>
                {statement.map((r) => {
                  const sec = (r as { _section: string | null })._section;
                  if (sec && collapsed.has(sec)) return null; // hidden under a collapsed section

                  if (r.kind === "header") {
                    const isCollapsed = collapsed.has(r.key);
                    const total = isCollapsed ? sectionTotal(r.key) : null;
                    return (
                      <tr key={r.key} className="bg-gray-50 cursor-pointer hover:bg-gray-100" onClick={() => toggle(r.key)}>
                        <td className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {r.label}
                          </span>
                        </td>
                        <td className="px-4 pt-3 pb-1 text-right tabular-nums text-[11px] font-bold text-gray-600">
                          {total != null ? formatCurrency(total) : ""}
                        </td>
                        <td className="px-4" />
                      </tr>
                    );
                  }

                  const isSub = r.kind === "subtotal";
                  return (
                    <tr key={r.key} className={cn("border-b border-gray-50", isSub && "bg-gray-50/60")}>
                      <td className={cn("px-4 py-1.5", r.indent === 1 && "pl-8", r.indent === 2 && "pl-12",
                        isSub && "font-bold text-gray-900", r.emphasize && "text-[15px]")}>{r.label}</td>
                      <td className={cn("px-4 py-1.5 text-right tabular-nums", isSub ? "font-bold text-gray-900" : "text-gray-700", r.value < 0 && "text-red-600")}>
                        {r.input === "manual" ? (
                          <span className="inline-flex items-center gap-1">
                            {savingKey === r.key && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
                            <span className="text-gray-400">$</span>
                            <input type="number" step="0.01" defaultValue={r.value || ""}
                              onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== r.value) saveManual(r.key, v); }}
                              className="w-24 text-right rounded border border-gray-200 px-1.5 py-0.5 tabular-nums focus:border-teal-400 focus:outline-none" placeholder="0" />
                          </span>
                        ) : formatCurrency(r.value)}
                      </td>
                      <td className={cn("px-4 py-1.5 text-right tabular-nums text-xs", isSub ? "font-semibold text-gray-700" : "text-gray-400")}>
                        {pctTxt(r.pct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
