"use client";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Header } from "@/components/layout/header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, TrendingUp, ShoppingBag, BarChart3, Users, RefreshCw, Download, ChevronDown, ChevronUp, Printer, Clock, AlertTriangle, Sparkles, Send, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VeraMenuMoves } from "@/components/vera-menu-moves";
import { VeraLaborPlan } from "@/components/vera-labor-plan";
import { PnlStatement } from "./pnl/pnl-statement";
import { findFiscalPeriod } from "@/lib/fiscal";
import Link from "next/link";
import {
  RevenueChart, OrdersChart, CategoryPieChart, TopItemsChart, HourlyChart, DowChart,
} from "./charts";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Summary {
  totalRevenue: number;
  totalOrders: number;
  avgCheck: number;
  taxCollected: number;
  laborCost: number;
  laborPct: number | null;
  laborHours: number;
  salesPerLaborHour: number | null;
}
interface DailySale { date: string; total: number; orders: number; }
interface HourlySale { hour: number; label: string; total: number; orders: number; }
interface DowSale { dow: string; avgTotal: number; total: number; }
interface CategorySale { name: string; revenue: number; units: number; }
interface TopItem { menuItemId: string; name: string; category: string; units: number; revenue: number; }
interface LaborEmployee {
  name: string;
  role: string;
  hours: number;
  cost: number;
  entries: number;
  overtimeHours: number;
}
interface ReportData {
  summary: Summary;
  dailySales: DailySale[];
  hourlySales: HourlySale[];
  dowSales: DowSale[];
  enrichedTopItems: TopItem[];
  categorySales: CategorySale[];
  laborBreakdown: LaborEmployee[];
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(reportData: ReportData, range: { from: string; to: string }) {
  const rows: string[] = [];

  const esc = (v: string | number) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const row = (...cells: (string | number)[]) => rows.push(cells.map(esc).join(","));

  row(`Restaurant Sales Report — From ${range.from} to ${range.to}`);
  rows.push("");

  // Daily Sales
  row("Daily Sales");
  row("Date", "Revenue", "Orders");
  for (const d of reportData.dailySales) {
    row(d.date, d.total.toFixed(2), d.orders);
  }
  rows.push("");

  // Top Items
  row("Top Items");
  row("Name", "Quantity", "Revenue");
  for (const item of reportData.enrichedTopItems) {
    row(item.name, item.units, item.revenue.toFixed(2));
  }
  rows.push("");

  // Category Sales
  row("Category Sales");
  row("Category", "Revenue", "Units");
  const totalCatRev = reportData.categorySales.reduce((s, c) => s + c.revenue, 0);
  for (const cat of reportData.categorySales) {
    const pct = totalCatRev > 0 ? ((cat.revenue / totalCatRev) * 100).toFixed(1) + "%" : "0%";
    row(cat.name, cat.revenue.toFixed(2), pct);
  }
  rows.push("");

  // Summary KPIs
  row("Summary KPIs");
  row("Label", "Value");
  const s = reportData.summary;
  row("Total Revenue", s.totalRevenue.toFixed(2));
  row("Total Orders", s.totalOrders);
  row("Avg Check", s.avgCheck.toFixed(2));
  row("Tax Collected", s.taxCollected.toFixed(2));
  row("Labor Cost", s.laborCost.toFixed(2));
  row("Labor %", s.laborPct != null ? s.laborPct.toFixed(1) + "%" : "N/A");
  row("Labor Hours", s.laborHours.toFixed(1) + "h");
  if (s.salesPerLaborHour != null) row("Sales / Labor Hr", s.salesPerLaborHour.toFixed(2));

  const csv = rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-report-${range.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Print Summary ─────────────────────────────────────────────────────────────

function printSummary(
  reportData: ReportData,
  range: { from: string; to: string },
  restaurantName: string,
) {
  const win = window.open("", "_blank", "width=700,height=800");
  if (!win) return;

  const s = reportData.summary;
  const rangeLabel = range.from === range.to ? range.from : range.from + " – " + range.to;
  const printedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  // Standard accounting format: negatives in parentheses, e.g. ($505.00).
  const fmt = (n: number) => {
    const v = "$" + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return n < 0 ? `(${v})` : v;
  };

  const topItems = reportData.enrichedTopItems.slice(0, 5);
  const topItemRows = topItems.map((item, i) =>
    "<tr>"
    + "<td style=\"padding:6px 8px;border-bottom:1px solid #eee\">" + (i + 1) + "</td>"
    + "<td style=\"padding:6px 8px;border-bottom:1px solid #eee\">" + item.name + "</td>"
    + "<td style=\"padding:6px 8px;border-bottom:1px solid #eee;text-align:center\">" + item.units + "</td>"
    + "<td style=\"padding:6px 8px;border-bottom:1px solid #eee;text-align:right\">" + fmt(item.revenue) + "</td>"
    + "</tr>"
  ).join("");

  const dailyRows = reportData.dailySales.filter((d) => d.orders > 0).map((d) =>
    "<tr>"
    + "<td style=\"padding:5px 8px;border-bottom:1px solid #eee\">" + d.date + "</td>"
    + "<td style=\"padding:5px 8px;border-bottom:1px solid #eee;text-align:center\">" + d.orders + "</td>"
    + "<td style=\"padding:5px 8px;border-bottom:1px solid #eee;text-align:right\">" + fmt(d.total) + "</td>"
    + "</tr>"
  ).join("");

  const html = "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sales Summary</title>"
    + "<style>"
    + "* { box-sizing:border-box; margin:0; padding:0; }"
    + "body { font-family:Arial,sans-serif; font-size:13px; color:#111; max-width:640px; margin:0 auto; padding:24px 16px; }"
    + "h1 { font-size:22px; margin-bottom:4px; }"
    + "h2 { font-size:15px; margin:20px 0 8px; border-bottom:2px solid #333; padding-bottom:4px; }"
    + ".kpi-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:12px; }"
    + ".kpi { background:#f7f7f7; border:1px solid #ddd; border-radius:6px; padding:10px 14px; }"
    + ".kpi .label { font-size:11px; color:#666; text-transform:uppercase; letter-spacing:.5px; }"
    + ".kpi .value { font-size:20px; font-weight:bold; margin-top:2px; }"
    + "table { width:100%; border-collapse:collapse; font-size:13px; }"
    + "thead th { background:#333; color:#fff; padding:7px 8px; text-align:left; font-size:12px; }"
    + "thead th.right { text-align:right; }"
    + "thead th.center { text-align:center; }"
    + ".footer { margin-top:24px; font-size:11px; color:#888; text-align:center; }"
    + "@media print { body { padding:0; } @page { margin:10mm; } }"
    + "</style></head><body>"
    + "<h1>" + restaurantName + " — Sales Summary</h1>"
    + "<div style=\"color:#555;font-size:13px\">" + rangeLabel + " &nbsp;&bull;&nbsp; Printed " + printedAt + "</div>"
    + "<h2>Key Performance Indicators</h2>"
    + "<div class=\"kpi-grid\">"
    + "<div class=\"kpi\"><div class=\"label\">Revenue</div><div class=\"value\">" + fmt(s.totalRevenue) + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Orders</div><div class=\"value\">" + s.totalOrders + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Avg Check</div><div class=\"value\">" + fmt(s.avgCheck) + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Tax Collected</div><div class=\"value\">" + fmt(s.taxCollected) + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Labor Cost</div><div class=\"value\">" + (s.laborCost > 0 ? fmt(s.laborCost) : "—") + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Labor %</div><div class=\"value\">" + (s.laborPct != null ? s.laborPct.toFixed(1) + "%" : "—") + "</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Labor Hours</div><div class=\"value\">" + s.laborHours.toFixed(1) + "h</div></div>"
    + "<div class=\"kpi\"><div class=\"label\">Sales / Labor Hr</div><div class=\"value\">" + (s.salesPerLaborHour != null ? fmt(s.salesPerLaborHour) : "—") + "</div></div>"
    + "</div>"
    + (topItems.length > 0
      ? "<h2>Top 5 Items</h2>"
        + "<table><thead><tr>"
        + "<th style=\"width:30px\">#</th>"
        + "<th>Item</th>"
        + "<th class=\"center\" style=\"width:70px\">Units</th>"
        + "<th class=\"right\" style=\"width:90px\">Revenue</th>"
        + "</tr></thead><tbody>" + topItemRows + "</tbody></table>"
      : "")
    + (dailyRows
      ? "<h2>Daily Revenue</h2>"
        + "<table><thead><tr>"
        + "<th>Date</th>"
        + "<th class=\"center\" style=\"width:70px\">Orders</th>"
        + "<th class=\"right\" style=\"width:100px\">Revenue</th>"
        + "</tr></thead><tbody>" + dailyRows + "</tbody></table>"
      : "")
    + "<div class=\"footer\">Generated by restaurant-ops</div>"
    + "</body>"
    + "<script>window.onload=function(){window.print();setTimeout(function(){window.close();},500);}<\/script>"
    + "</html>";

  win.document.write(html);
  win.document.close();
}

// ── Date range presets ────────────────────────────────────────────────────────

function toISO(d: Date) { return d.toISOString().slice(0, 10); }

const PRESETS = [
  { label: "Today",       getRange: () => { const d = toISO(new Date()); return { from: d, to: d }; } },
  { label: "Yesterday",   getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = toISO(d); return { from: s, to: s }; } },
  { label: "This Week",   getRange: () => { const d = new Date(); const dow = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); return { from: toISO(mon), to: toISO(new Date()) }; } },
  { label: "Last Week",   getRange: () => { const d = new Date(); const dow = d.getDay(); const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) - 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return { from: toISO(mon), to: toISO(sun) }; } },
  { label: "This Month",  getRange: () => { const d = new Date(); return { from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISO(d) }; } },
  { label: "This Period",  getRange: () => { const today = toISO(new Date()); const p = findFiscalPeriod(new Date()); if (!p) return { from: today, to: today }; return { from: p.from, to: p.to < today ? p.to : today }; } },
  { label: "Last 30d",    getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 29); return { from: toISO(s), to: toISO(d) }; } },
  { label: "Last 90d",    getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 89); return { from: toISO(s), to: toISO(d) }; } },
] as const;

// ── P&L Types ──────────────────────────────────────────────────────────────────

interface COGSData {
  revenue: number;
  theoreticalCOGS: number;
  cogsPercent: number;
  actualIngredientSpend: number;
  laborCost: number;
  laborPercent: number;
  salaryCost: number;
  grossProfit: number;
  grossMargin: number;
  operatingIncome: number;
  operatingMargin: number;
  prevRevenue: number;
  prevCOGS: number;
  prevLaborCost: number;
  prevSalaryCost: number;
  prevGrossProfit: number;
  prevGrossMargin: number;
  prevOperatingIncome: number;
  prevOperatingMargin: number;
  categoryBreakdown: Array<{ category: string; revenue: number; cogs: number; cogsPercent: number }>;
  dailyPL: Array<{ date: string; revenue: number; cogs: number; laborCost: number; grossProfit: number }>;
}

// ── Scheduling Types ──────────────────────────────────────────────────────────

interface SchedSummary {
  scheduledHours: number;
  actualHours: number;
  scheduledLaborCost: number;
  actualLaborCost: number;
  revenue: number;
  laborPct: number;
  salesPerLaborHour: number;
}
interface SchedDailyRow {
  date: string;
  revenue: number;
  scheduledHours: number;
  actualHours: number;
  scheduledLaborCost: number;
  actualLaborCost: number;
  laborPct: number;
}
interface SchedDOW {
  dow: string;
  dowIndex: number;
  avgRevenue: number;
  avgLaborCost: number;
  avgLaborPct: number;
  suggestedStaff: number;
}
interface OvertimeAlert {
  userId: string;
  name: string;
  role: string;
  weekHours: number;
  scheduledHours: number;
  projectedHours: number;
  overtimeHours: number;
  level: "overtime" | "projected" | "approaching";
}
interface RoleBreakdown {
  role: string;
  headcount: number;
  scheduledHours: number;
  actualHours: number;
  laborCost: number;
  laborPct: number;
}
interface StaffBreakdown {
  userId: string;
  name: string;
  role: string;
  scheduledHours: number;
  actualHours: number;
  laborCost: number;
  overtimeHours: number;
}
interface SchedData {
  summary: SchedSummary;
  dailyAnalysis: SchedDailyRow[];
  dowOptimal: SchedDOW[];
  overtimeAlerts: OvertimeAlert[];
  roleBreakdown: RoleBreakdown[];
  staffBreakdown: StaffBreakdown[];
}

// ── Page ───────────────────────────────────────────────────────────────────────

// ── Variance Types ─────────────────────────────────────────────────────────────

interface VarianceRow {
  ingredientId: string;
  name: string;
  unit: string;
  costPerUnit: number;
  theoreticalQty: number;
  actualUsedQty: number;
  poReceivedQty: number;
  currentOnHand: number;
  minThreshold: number;
  hasActualData: boolean;
  variance: number;
  variancePct: number;
  varianceCost: number;
  severity: "ok" | "warn" | "alert";
}

interface VarianceData {
  period: { from: string; to: string };
  summary: {
    totalTheoreticalCost: number;
    totalVarianceCost: number;
    alertCount: number;
    warnCount: number;
    hasAnyActualData: boolean;
    ingredientsTracked: number;
    ordersAnalyzed: number;
  };
  rows: VarianceRow[];
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"sales" | "pl" | "scheduling" | "variance">("sales");
  const [menuRefresh, setMenuRefresh] = useState(0);
  const [preset, setPreset] = useState<string>("Last 30d");
  const [range, setRange] = useState(() => PRESETS.find(p => p.label === "Last 30d")!.getRange());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [restaurantName, setRestaurantName] = useState("Our Restaurant");

  // P&L
  const [cogsData, setCogsData] = useState<COGSData | null>(null);
  const [cogsLoading, setCogsLoading] = useState(false);

  // Scheduling
  const [schedData, setSchedData] = useState<SchedData | null>(null);
  const [schedLoading, setSchedLoading] = useState(false);

  // Variance
  const [varianceData, setVarianceData] = useState<VarianceData | null>(null);
  const [varianceLoading, setVarianceLoading] = useState(false);

  // Ask AI
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState<{
    answer: string;
    dataPoints: { label: string; value: string; context: string; positive: boolean }[];
    followUps: string[];
  } | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string, spinner = false) => {
    if (spinner) setRefreshing(true);
    try {
      const res = await fetch(`/api/reports?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadCOGS = useCallback(async (from: string, to: string) => {
    setCogsLoading(true);
    try {
      const res = await fetch(`/api/reports/cogs?from=${from}&to=${to}`);
      if (res.ok) setCogsData(await res.json());
    } catch { /* silent */ } finally {
      setCogsLoading(false);
    }
  }, []);

  const loadSched = useCallback(async (from: string, to: string) => {
    setSchedLoading(true);
    try {
      const res = await fetch(`/api/reports/scheduling?from=${from}&to=${to}`);
      if (res.ok) setSchedData(await res.json());
    } catch { /* silent */ } finally {
      setSchedLoading(false);
    }
  }, []);

  const loadVariance = useCallback(async (from: string, to: string) => {
    setVarianceLoading(true);
    try {
      const res = await fetch(`/api/reports/variance?from=${from}&to=${to}`);
      if (res.ok) setVarianceData(await res.json());
    } catch { /* silent */ } finally {
      setVarianceLoading(false);
    }
  }, []);

  const askReport = useCallback(async (q: string) => {
    if (!q.trim() || askLoading) return;
    setAskLoading(true);
    setAskResult(null);
    setAskError(null);
    try {
      const res = await fetch("/api/reports/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, from: range.from, to: range.to }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setAskResult(json);
    } catch (e) {
      setAskError((e as Error).message ?? "Something went wrong.");
    } finally {
      setAskLoading(false);
    }
  }, [askLoading, range]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.ok ? r.json() : null).then((s) => {
      if (s?.restaurantName) setRestaurantName(s.restaurantName);
    }).catch(() => {});
  }, []);

  useEffect(() => { load(range.from, range.to); }, [range, load]);
  useEffect(() => {
    if (activeTab === "pl") loadCOGS(range.from, range.to);
    if (activeTab === "scheduling") loadSched(range.from, range.to);
    if (activeTab === "variance") loadVariance(range.from, range.to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, range]);

  function applyPreset(p: typeof PRESETS[number]) {
    setPreset(p.label);
    const r = p.getRange();
    setRange(r);
  }

  const s = data?.summary;
  const laborColor = s?.laborPct == null ? "text-gray-400" : s.laborPct < 25 ? "text-green-600" : s.laborPct < 35 ? "text-amber-600" : "text-red-600";

  const rangeLabel = range.from === range.to ? range.from : `${range.from} – ${range.to}`;

  return (
    <div>
      <Header
        title="Reports"
        description={rangeLabel}
        actions={
          <div className="flex items-center gap-3">
            {data && (
              <>
                <button
                  onClick={() => printSummary(data, range, restaurantName)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print Summary
                </button>
                <button
                  onClick={() => exportCSV(data, range)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </>
            )}
            <button
              onClick={() => { load(range.from, range.to, true); setMenuRefresh((n) => n + 1); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 px-6">
        {(["sales", "pl", "scheduling", "variance"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={cn(
              "pb-3 mr-6 text-sm font-medium border-b-2 transition-colors",
              activeTab === t
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t === "sales" ? "Sales" : t === "pl" ? "P&L" : t === "scheduling" ? "Scheduling" : "Variance"}
          </button>
        ))}
      </div>

      {/* ── Ask AI bar ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/60">
        {!askOpen ? (
          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-amber-600 transition-colors group"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 group-hover:bg-amber-100 transition-colors">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <span>Dig into this period</span>
            <span className="text-xs text-gray-400 hidden sm:inline">e.g. &quot;Why was food cost high last week?&quot;</span>
          </button>
        ) : (
          <div className="space-y-3">
            {/* Input row */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); askReport(askQuestion); }}
                className="flex-1 flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  placeholder={`Surface anything from this period. e.g. "why food cost climbed" or "what drove Friday's sales"`}
                  className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-300 placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  disabled={askLoading || !askQuestion.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {askLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {askLoading ? "Analyzing…" : "Analyze"}
                </button>
              </form>
              <button onClick={() => { setAskOpen(false); setAskResult(null); setAskError(null); setAskQuestion(""); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Example prompts (shown before any result) */}
            {!askResult && !askLoading && !askError && (
              <div className="flex flex-wrap gap-2 pl-9">
                {[
                  "Why was food cost high?",
                  "What are my top-selling items?",
                  "How is labor trending?",
                  "What drove sales this period?",
                  "Where am I losing money?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setAskQuestion(q); askReport(q); }}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Loading state */}
            {askLoading && (
              <div className="pl-9 flex items-center gap-2 text-sm text-gray-500">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />
                Analyzing {range.from === range.to ? range.from : `${range.from} – ${range.to}`}…
              </div>
            )}

            {/* Error */}
            {askError && (
              <div className="pl-9 text-sm text-red-600">{askError}</div>
            )}

            {/* Result */}
            {askResult && (
              <div className="pl-9 space-y-3">
                {/* Answer */}
                <p className="text-sm text-gray-800 leading-relaxed">{askResult.answer}</p>

                {/* Data points */}
                {askResult.dataPoints.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {askResult.dataPoints.map((dp, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs",
                          dp.positive
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-red-50 border-red-200 text-red-700"
                        )}
                      >
                        {dp.positive ? <ThumbsUp className="h-3 w-3 shrink-0" /> : <ThumbsDown className="h-3 w-3 shrink-0" />}
                        <span className="font-semibold">{dp.value}</span>
                        <span className="text-[11px] opacity-70">{dp.label}</span>
                        {dp.context && <span className="text-[11px] opacity-60">· {dp.context}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Follow-ups */}
                {askResult.followUps.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400">Follow up:</span>
                    {askResult.followUps.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => { setAskQuestion(q); askReport(q); }}
                        className="text-xs px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        {/* Date range presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant={preset === p.label ? "default" : "outline"}
              onClick={() => applyPreset(p)}
              className="h-7 text-xs px-3"
            >
              {p.label}
            </Button>
          ))}
        </div>

        {/* ── P&L TAB ─────────────────────────────────────────────────────────── */}
        {activeTab === "pl" && (
          <div className="space-y-6">
            <PLTab data={cogsData} loading={cogsLoading} />
            <div className="flex justify-end -mb-2">
              <Link href="/reports/pnl" className="text-xs font-medium text-teal-700 hover:underline">
                Open full period-close statement (by fiscal period) →
              </Link>
            </div>
            {/* Full line-item operating statement, below the charts */}
            <PnlStatement from={range.from} to={range.to} />
          </div>
        )}

        {/* ── SCHEDULING TAB ──────────────────────────────────────────────────── */}
        {activeTab === "scheduling" && (
          <>
            <VeraLaborPlan />
            <SchedulingTab data={schedData} loading={schedLoading} />
          </>
        )}

        {/* ── VARIANCE TAB ────────────────────────────────────────────────────── */}
        {activeTab === "variance" && (
          <VarianceTab data={varianceData} loading={varianceLoading} />
        )}

        {/* ── SALES TAB ───────────────────────────────────────────────────────── */}
        {activeTab === "sales" && <>

        {/* Vera's menu-engineering moves */}
        <VeraMenuMoves from={range.from} to={range.to} periodLabel={preset === "Custom" ? rangeLabel : preset} refreshKey={menuRefresh} />

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Revenue",    value: formatCurrency(s?.totalRevenue ?? 0),  icon: <DollarSign className="h-4 w-4 text-green-600" />,  bg: "bg-green-50" },
            { label: "Orders",     value: String(s?.totalOrders ?? 0),            icon: <ShoppingBag className="h-4 w-4 text-blue-600" />,  bg: "bg-blue-50" },
            { label: "Avg Check",  value: formatCurrency(s?.avgCheck ?? 0),       icon: <TrendingUp className="h-4 w-4 text-amber-600" />, bg: "bg-amber-50" },
            { label: "Tax",        value: formatCurrency(s?.taxCollected ?? 0),   icon: <BarChart3 className="h-4 w-4 text-purple-600" />, bg: "bg-purple-50" },
            { label: "Labor Cost", value: s?.laborCost ? formatCurrency(s.laborCost) : "—", icon: <Users className="h-4 w-4 text-rose-600" />, bg: "bg-rose-50" },
            {
              label: "Labor %",
              value: s?.laborPct != null ? `${s.laborPct.toFixed(1)}%` : "—",
              icon: <BarChart3 className="h-4 w-4 text-indigo-600" />,
              bg: "bg-indigo-50",
              valueClass: loading ? "" : laborColor,
            },
            {
              label: "Sales / Labor Hr",
              value: s?.salesPerLaborHour != null ? formatCurrency(s.salesPerLaborHour) : "—",
              icon: <TrendingUp className="h-4 w-4 text-blue-600" />,
              bg: "bg-blue-50",
            },
            {
              label: "Labor Hours",
              value: s != null ? `${s.laborHours.toFixed(1)}h` : "—",
              icon: <Clock className="h-4 w-4 text-purple-600" />,
              bg: "bg-purple-50",
            },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 truncate">{kpi.label}</p>
                    <p className={`text-lg font-bold mt-0.5 tabular-nums truncate ${loading ? "text-gray-300" : (kpi as { valueClass?: string }).valueClass ?? "text-gray-900"}`}>
                      {loading ? "—" : kpi.value}
                    </p>
                  </div>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${kpi.bg}`}>
                    {kpi.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Revenue + Orders */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Revenue</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : <RevenueChart data={data?.dailySales ?? []} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Order Count</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : <OrdersChart data={data?.dailySales ?? []} />}
            </CardContent>
          </Card>
        </div>

        {/* Hourly + Day of week */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Sales by Hour of Day</CardTitle>
              <p className="text-xs text-gray-400 -mt-1">When are customers ordering?</p>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : <HourlyChart data={data?.hourlySales ?? []} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Avg Sales by Day of Week</CardTitle>
              <p className="text-xs text-gray-400 -mt-1">Average revenue per weekday</p>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : <DowChart data={data?.dowSales ?? []} />}
            </CardContent>
          </Card>
        </div>

        {/* Category + Top Items */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">Revenue by Category</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : <CategoryPieChart data={data?.categorySales ?? []} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">Top 10 Items (units sold)</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Skeleton /> : (
                <TopItemsChart data={(data?.enrichedTopItems ?? []).map(i => ({ name: i.name, units: i.units, revenue: i.revenue }))} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Labor vs Revenue */}
        {(s?.laborCost ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" /> Labor Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{formatCurrency(s!.laborCost)}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">Total labor cost</p>
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{formatCurrency(s!.totalRevenue)}</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">Total revenue</p>
                </div>
                <div className="min-w-0">
                  <p className={`text-lg sm:text-2xl font-bold ${laborColor}`}>{s!.laborPct?.toFixed(1)}%</p>
                  <p className="text-[11px] sm:text-xs text-gray-500 mt-0.5">Labor %</p>
                </div>
              </div>
              <div className="mt-4 h-3 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${s!.laborPct! < 25 ? "bg-green-500" : s!.laborPct! < 35 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, s!.laborPct!)}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                <span className="text-green-600">Below 25% excellent</span>
                <span className="text-amber-600">25–35% acceptable</span>
                <span className="text-red-600">Above 35% over budget</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Labor Breakdown */}
        {(data?.laborBreakdown?.length ?? 0) > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Labor Breakdown</h3>
            </div>
            <table className="w-full text-sm min-w-[560px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Hours</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">OT Hrs</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Shifts</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.laborBreakdown.map((emp) => (
                  <tr key={emp.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize">{emp.role.toLowerCase()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{emp.hours.toFixed(1)}h</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${emp.overtimeHours > 0 ? "text-amber-600" : "text-gray-300"}`}>
                      {emp.overtimeHours > 0 ? `${emp.overtimeHours.toFixed(1)}h` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{emp.entries}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(emp.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top Items Table */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Top Selling Items — Detail</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {!data || data.enrichedTopItems.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">No sales data yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Est. Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.enrichedTopItems.map((item, i) => (
                    <TableRow key={item.menuItemId}>
                      <TableCell className="text-gray-400">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-gray-500">{item.category}</TableCell>
                      <TableCell className="text-right font-semibold">{item.units}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* End of Day Summary */}
        {data && <EndOfDaySummary data={data} range={range} open={eodOpen} onToggle={() => setEodOpen(o => !o)} />}

        </> /* end activeTab === "sales" */}
      </div>
    </div>
  );
}

function Skeleton() {
  return <div className="h-[220px] bg-gray-50 rounded-lg animate-pulse" />;
}

// ── End of Day Summary ─────────────────────────────────────────────────────────

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function EndOfDaySummary({
  data,
  range,
  open,
  onToggle,
}: {
  data: ReportData;
  range: { from: string; to: string };
  open: boolean;
  onToggle: () => void;
}) {
  const s = data.summary;

  // Best-selling item by revenue
  const bestItem = data.enrichedTopItems.length > 0
    ? data.enrichedTopItems.reduce((a, b) => b.revenue > a.revenue ? b : a)
    : null;

  // Best day of week by avgTotal
  const bestDow = data.dowSales.length > 0
    ? data.dowSales.reduce((a, b) => b.avgTotal > a.avgTotal ? b : a)
    : null;

  // Number of distinct days in dailySales that have orders
  const activeDays = data.dailySales.filter(d => d.orders > 0).length || 1;
  const avgPerDay = s.totalRevenue / activeDays;

  const laborColor =
    s.laborPct == null ? "text-gray-400" :
    s.laborPct < 25 ? "text-green-600" :
    s.laborPct < 35 ? "text-amber-600" :
    "text-red-600";

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">End of Day Summary</CardTitle>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
        <p className="text-xs text-gray-400 -mt-1">{range.from === range.to ? range.from : `${range.from} – ${range.to}`}</p>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5">
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Net Revenue",   value: formatCurrency(s.totalRevenue) },
              { label: "Total Orders",  value: String(s.totalOrders) },
              { label: "Avg Check",     value: formatCurrency(s.avgCheck) },
              { label: "Tax Collected", value: formatCurrency(s.taxCollected) },
              { label: "Labor Cost",    value: s.laborCost > 0 ? formatCurrency(s.laborCost) : "—" },
              { label: "Labor %",       value: s.laborPct != null ? `${s.laborPct.toFixed(1)}%` : "—", valueClass: laborColor },
            ].map(kpi => (
              <div key={kpi.label} className="space-y-0.5">
                <p className="text-xs text-gray-500">{kpi.label}</p>
                <p className={`text-lg font-bold ${(kpi as { valueClass?: string }).valueClass ?? "text-gray-900"}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Highlights */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {bestItem && (
              <div className="rounded-lg bg-amber-50 px-4 py-3">
                <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Best-Selling Item</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{bestItem.name}</p>
                <p className="text-xs text-gray-500">{bestItem.units} units · {formatCurrency(bestItem.revenue)}</p>
              </div>
            )}
            {bestDow && (
              <div className="rounded-lg bg-blue-50 px-4 py-3">
                <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Best Day of Week</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{DOW_NAMES[DOW_NAMES.findIndex(n => n.toLowerCase().startsWith(bestDow.dow.toLowerCase().slice(0, 3)))] ?? bestDow.dow}</p>
                <p className="text-xs text-gray-500">Avg {formatCurrency(bestDow.avgTotal)} / day</p>
              </div>
            )}
          </div>

          {/* Narrative */}
          <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3">
            You served <span className="font-semibold">{s.totalOrders} orders</span> over{" "}
            <span className="font-semibold">{activeDays} {activeDays === 1 ? "day" : "days"}</span>, averaging{" "}
            <span className="font-semibold">{formatCurrency(avgPerDay)}/day</span>.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

function DeltaBadge({ current, prev, lowerIsBetter = false }: { current: number; prev: number; lowerIsBetter?: boolean }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / Math.abs(prev)) * 100;
  const isGood = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <span className={cn(
      "ml-1 text-xs font-medium",
      isGood ? "text-green-600" : "text-red-600"
    )}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function PLTab({ data, loading }: { data: COGSData | null; loading: boolean }) {
  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  );
  if (!data) return (
    <p className="text-center text-gray-400 py-12">No P&L data available for this period</p>
  );

  const operatingIncome = data.operatingIncome;
  const operatingMargin = data.operatingMargin;
  const prevOperatingIncome = data.prevOperatingIncome;
  const salaryPct = data.revenue > 0 ? (data.salaryCost / data.revenue) * 100 : 0;
  const cogsGap = data.actualIngredientSpend - data.theoreticalCOGS;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[
          {
            label: "Revenue",
            value: formatCurrency(data.revenue),
            sub: <DeltaBadge current={data.revenue} prev={data.prevRevenue} />,
            color: "text-gray-900",
          },
          {
            label: "Theoretical COGS",
            value: formatCurrency(data.theoreticalCOGS),
            sub: <span className="text-xs text-gray-400">{data.cogsPercent.toFixed(1)}% of rev</span>,
            color: data.cogsPercent < 30 ? "text-green-700" : data.cogsPercent < 40 ? "text-amber-700" : "text-red-700",
          },
          {
            label: "Actual Ingredient Spend",
            value: formatCurrency(data.actualIngredientSpend),
            sub: <span className="text-xs text-gray-400">POs received</span>,
            color: "text-gray-900",
          },
          {
            label: "Hourly Labor",
            value: formatCurrency(data.laborCost),
            sub: <span className="text-xs text-gray-400">{data.laborPercent.toFixed(1)}%</span>,
            color: data.laborPercent < 25 ? "text-green-700" : data.laborPercent < 35 ? "text-amber-700" : "text-red-700",
          },
          {
            label: "Mgmt Salary",
            value: formatCurrency(data.salaryCost),
            sub: <span className="text-xs text-gray-400">{salaryPct.toFixed(1)}%</span>,
            color: "text-gray-900",
          },
          {
            label: "Gross Profit",
            value: formatCurrency(data.grossProfit),
            sub: <DeltaBadge current={data.grossProfit} prev={data.prevGrossProfit} />,
            color: data.grossProfit > 0 ? "text-green-700" : "text-red-700",
          },
          {
            label: "Operating Income",
            value: formatCurrency(operatingIncome),
            sub: <DeltaBadge current={operatingIncome} prev={prevOperatingIncome} />,
            color: operatingIncome > 0 ? "text-green-700" : "text-red-700",
          },
          {
            label: "Operating Margin",
            value: `${operatingMargin.toFixed(1)}%`,
            sub: null as React.ReactNode,
            color: operatingMargin > 15 ? "text-green-700" : operatingMargin > 5 ? "text-amber-700" : "text-red-700",
          },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 truncate">{kpi.label}</p>
              <p className={cn("text-lg font-bold mt-0.5 tabular-nums truncate", kpi.color)}>{kpi.value}</p>
              <div className="mt-0.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* P&L Statement */}
        <Card>
          <CardHeader><CardTitle className="text-sm">P&L Statement</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 font-mono text-sm">
              {[
                { label: "Revenue",                value: data.revenue,              pct: 100,                  bold: false, border: false, indent: false },
                { label: "Cost of Goods Sold",     value: -data.theoreticalCOGS,     pct: data.cogsPercent,     bold: false, border: false, indent: true },
                { label: "Gross Profit",           value: data.grossProfit,          pct: data.grossMargin,     bold: true,  border: true,  indent: false },
                { label: "Labor (Hourly)",          value: -data.laborCost,           pct: data.laborPercent,    bold: false, border: false, indent: true },
                { label: "Management Salary",       value: -data.salaryCost,          pct: salaryPct,            bold: false, border: false, indent: true },
                { label: "Operating Income",        value: operatingIncome,           pct: operatingMargin,      bold: true,  border: true,  indent: false },
              ].map((row) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-center justify-between py-1.5",
                    row.border && "border-t border-gray-200 mt-1 pt-2",
                    row.bold ? "font-semibold" : "text-gray-700"
                  )}
                >
                  <span className={cn(row.indent && "pl-4 text-gray-500")}>{row.label}</span>
                  <div className="flex items-center gap-4 tabular-nums">
                    <span className="text-gray-400 text-xs w-12 text-right">
                      ({row.pct.toFixed(1)}%)
                    </span>
                    <span className={cn(
                      "w-24 text-right",
                      row.value >= 0 ? "text-gray-900" : "text-red-600"
                    )}>
                      {row.value >= 0 ? "" : "-"}{formatCurrency(Math.abs(row.value))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actual vs Theoretical COGS */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Actual vs Theoretical COGS</CardTitle>
            <p className="text-xs text-gray-400 -mt-1">Gap indicates untracked or unrecorded costs</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(data.theoreticalCOGS)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Theoretical COGS</p>
                <p className="text-xs text-gray-400">(from recipes)</p>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{formatCurrency(data.actualIngredientSpend)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Actual Spend</p>
                <p className="text-xs text-gray-400">(from POs)</p>
              </div>
              <div>
                <p className={cn("text-lg font-bold", cogsGap > 0 ? "text-red-600" : "text-green-600")}>
                  {cogsGap >= 0 ? "+" : ""}{formatCurrency(cogsGap)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Gap</p>
                <p className="text-xs text-gray-400">{cogsGap > 0 ? "Spend > recipe cost" : "Spend ≤ recipe cost"}</p>
              </div>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
              {data.revenue > 0 && (
                <>
                  <div
                    className="h-full bg-red-400"
                    style={{ width: `${Math.min(100, (data.theoreticalCOGS / data.revenue) * 100)}%` }}
                    title="Theoretical COGS"
                  />
                  <div
                    className="h-full bg-amber-400"
                    style={{ width: `${Math.min(100, (data.laborCost / data.revenue) * 100)}%` }}
                    title="Labor"
                  />
                </>
              )}
            </div>
            <div className="flex gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block" />COGS ({data.cogsPercent.toFixed(1)}%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400 inline-block" />Labor ({data.laborPercent.toFixed(1)}%)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />Other</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category COGS breakdown */}
      {data.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">COGS by Menu Category</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(200, data.categoryBreakdown.length * 40)}>
              <BarChart
                data={[...data.categoryBreakdown].sort((a, b) => b.cogs - a.cogs)}
                layout="vertical"
                margin={{ left: 20, right: 20, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, name) => [
                    formatCurrency(Number(v)),
                    name === "cogs" ? "COGS" : "Revenue",
                  ]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="revenue" fill="#BBE5CC" name="revenue" radius={[0, 2, 2, 0]} />
                <Bar dataKey="cogs" fill="#F4B8AE" name="cogs" radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Daily P&L chart */}
      {data.dailyPL.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Daily P&L</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.dailyPL} margin={{ left: 10, right: 10, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#1E7A45" strokeWidth={2} dot={false} name="Revenue" />
                <Line type="monotone" dataKey="cogs" stroke="#D44030" strokeWidth={2} dot={false} name="COGS" />
                <Line type="monotone" dataKey="grossProfit" stroke="#2E6EB0" strokeWidth={2} dot={false} name="Gross Profit" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Scheduling Tab ─────────────────────────────────────────────────────────────

function SchedulingTab({ data, loading }: { data: SchedData | null; loading: boolean }) {
  const [staffSort, setStaffSort] = useState<{ key: keyof StaffBreakdown; dir: "asc" | "desc" }>({
    key: "actualHours",
    dir: "desc",
  });

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  );
  if (!data) return (
    <p className="text-center text-gray-400 py-12">No scheduling data available for this period</p>
  );

  const s = data.summary;

  const sortedStaff = [...data.staffBreakdown].sort((a, b) => {
    const av = a[staffSort.key] as number;
    const bv = b[staffSort.key] as number;
    return staffSort.dir === "asc" ? av - bv : bv - av;
  });

  function toggleSort(key: keyof StaffBreakdown) {
    setStaffSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  return (
    <div className="space-y-6">
      {/* OT Alert Banner — hourly staff only; admin/managers + salaried are exempt */}
      {data.overtimeAlerts.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Overtime watch</p>
            <ul className="text-xs text-amber-700 mt-1 space-y-0.5">
              {data.overtimeAlerts.map((a) => (
                <li key={a.userId}>
                  <span className="font-medium">{a.name}</span>{" — "}
                  {a.level === "overtime"
                    ? `in overtime: ${a.weekHours.toFixed(1)}h worked (${a.overtimeHours.toFixed(1)}h OT)`
                    : a.level === "projected"
                    ? `projected to hit OT: ${a.weekHours.toFixed(1)}h worked, ${a.scheduledHours.toFixed(1)}h scheduled (${a.projectedHours.toFixed(1)}h)`
                    : `approaching OT: ${a.weekHours.toFixed(1)}h worked`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "Scheduled Hours", value: `${s.scheduledHours.toFixed(1)}h` },
          { label: "Actual Hours", value: `${s.actualHours.toFixed(1)}h` },
          { label: "Labor Cost", value: formatCurrency(s.actualLaborCost) },
          {
            label: "Labor %",
            value: `${s.laborPct.toFixed(1)}%`,
            color: s.laborPct < 25 ? "text-green-700" : s.laborPct < 35 ? "text-amber-700" : "text-red-700",
          },
          { label: "Sales / Labor Hour", value: formatCurrency(s.salesPerLaborHour) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 truncate">{kpi.label}</p>
              <p className={cn("text-xl font-bold mt-0.5", kpi.color ?? "text-gray-900")}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily labor vs sales chart */}
      {data.dailyAnalysis.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Daily Sales vs Labor Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.dailyAnalysis} margin={{ left: 10, right: 40, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis yAxisId="left" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11 }}
                  domain={[0, 100]}
                />
                <Tooltip formatter={(v, name) =>
                  name === "laborPct" ? [`${Number(v).toFixed(1)}%`, "Labor %"] : [formatCurrency(Number(v)), String(name)]
                } />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="#1E7A45" strokeWidth={2} dot={false} name="Revenue" />
                <Line yAxisId="left" type="monotone" dataKey="actualLaborCost" stroke="#21A090" strokeWidth={2} dot={false} name="Labor Cost" />
                <Line yAxisId="right" type="monotone" dataKey="laborPct" stroke="#2E6EB0" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="laborPct" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* DOW Staffing Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Day-of-Week Staffing Guide</CardTitle>
          <p className="text-xs text-gray-400 -mt-1">Based on last 90 days of sales history</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Day</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Avg Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Avg Labor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Avg Labor %</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Suggested Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.dowOptimal.map((row) => (
                <tr key={row.dow} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.dow}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.avgRevenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(row.avgLaborCost)}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums font-medium",
                    row.avgLaborPct < 25 ? "text-green-600" : row.avgLaborPct < 35 ? "text-amber-600" : "text-red-600"
                  )}>
                    {row.avgLaborPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                      {row.suggestedStaff}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Role Breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Labor by Role</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Headcount</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Sched Hrs</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actual Hrs</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Labor Cost</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Labor %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.roleBreakdown.map((row) => (
                <tr key={row.role} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 capitalize">{row.role.toLowerCase()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.headcount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.scheduledHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.actualHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(row.laborCost)}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums font-medium",
                    row.laborPct < 10 ? "text-green-600" : row.laborPct < 20 ? "text-amber-600" : "text-red-600"
                  )}>
                    {row.laborPct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Staff Detail Table */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Staff Detail</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {(
                  [
                    ["name", "Name"],
                    ["role", "Role"],
                    ["scheduledHours", "Sched Hrs"],
                    ["actualHours", "Actual Hrs"],
                    ["laborCost", "Labor Cost"],
                    ["overtimeHours", "OT Hrs"],
                  ] as [keyof StaffBreakdown, string][]
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => typeof data.staffBreakdown[0]?.[key] === "number" ? toggleSort(key) : null}
                    className={cn(
                      "px-4 py-3 font-medium text-gray-600 text-right first:text-left",
                      typeof data.staffBreakdown[0]?.[key] === "number" && "cursor-pointer hover:text-gray-900"
                    )}
                  >
                    {label}
                    {staffSort.key === key && (
                      <span className="ml-1 text-xs">{staffSort.dir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedStaff.map((emp) => (
                <tr key={emp.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-500 capitalize text-right">{emp.role.toLowerCase()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{emp.scheduledHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right tabular-nums">{emp.actualHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(emp.laborCost)}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums font-medium",
                    emp.overtimeHours > 0 ? "text-red-600" : "text-gray-300"
                  )}>
                    {emp.overtimeHours > 0 ? `${emp.overtimeHours.toFixed(1)}h` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Variance Tab ──────────────────────────────────────────────────────────────

function VarianceTab({ data, loading }: { data: VarianceData | null; loading: boolean }) {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [sortKey, setSortKey] = useState<"varianceCost" | "variancePct" | "name">("varianceCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
    </div>
  );
  if (!data) return (
    <p className="text-center text-gray-400 py-12">No variance data available for this period</p>
  );

  const { summary, rows } = data;

  const visibleRows = rows
    .filter(r => filter === "all" || r.severity !== "ok")
    .sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc"
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
      const av = sortKey === "varianceCost" ? Math.abs(a.varianceCost) : Math.abs(a.variancePct);
      const bv = sortKey === "varianceCost" ? Math.abs(b.varianceCost) : Math.abs(b.variancePct);
      return sortDir === "asc" ? av - bv : bv - av;
    });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const severityBadge = (row: VarianceRow) => {
    if (!row.hasActualData) return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">Theory only</span>
    );
    if (row.severity === "alert") return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Alert</span>
    );
    if (row.severity === "warn") return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Warn</span>
    );
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">OK</span>;
  };

  return (
    <div className="space-y-6">
      {/* No actual data banner */}
      {!summary.hasAnyActualData && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Theoretical usage only</p>
            <p className="text-xs text-blue-700 mt-0.5">
              No inventory depletion transactions (USED/WASTED) found for this period.
              Variance analysis requires logging inventory usage. Showing theoretical usage from recipes only.
            </p>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          {
            label: "Theoretical Cost",
            value: formatCurrency(summary.totalTheoreticalCost),
            sub: "from recipes × sales",
            color: "text-gray-900",
          },
          {
            label: "Total Variance Cost",
            value: summary.hasAnyActualData ? formatCurrency(summary.totalVarianceCost) : "—",
            sub: summary.hasAnyActualData ? "actual vs theoretical" : "no transaction data",
            color: summary.totalVarianceCost > 0 ? "text-red-600" : "text-green-600",
          },
          {
            label: "Alert Items",
            value: String(summary.alertCount),
            sub: ">20% variance",
            color: summary.alertCount > 0 ? "text-red-600" : "text-gray-900",
          },
          {
            label: "Warning Items",
            value: String(summary.warnCount),
            sub: "10–20% variance",
            color: summary.warnCount > 0 ? "text-amber-600" : "text-gray-900",
          },
          {
            label: "Ingredients",
            value: String(summary.ingredientsTracked),
            sub: `${summary.ordersAnalyzed} orders analyzed`,
            color: "text-gray-900",
          },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500 truncate">{kpi.label}</p>
              <p className={cn("text-xl font-bold mt-0.5", kpi.color)}>{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter + table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Ingredient Variance</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Positive variance = more consumed than sales explain (shrinkage, waste, over-pours)
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setFilter("all")}
              className={cn("text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                filter === "all"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "border-gray-200 text-gray-500 hover:text-gray-700"
              )}
            >
              All ({rows.length})
            </button>
            <button
              onClick={() => setFilter("issues")}
              className={cn("text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors",
                filter === "issues"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "border-gray-200 text-gray-500 hover:text-gray-700"
              )}
            >
              Issues ({summary.alertCount + summary.warnCount})
            </button>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No items match the current filter</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Ingredient {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Theoretical</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actual Used</th>
                  <th
                    className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort("variancePct")}
                  >
                    Variance % {sortKey === "variancePct" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                    onClick={() => toggleSort("varianceCost")}
                  >
                    Variance $ {sortKey === "varianceCost" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">On Hand</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row) => (
                  <tr
                    key={row.ingredientId}
                    className={cn(
                      "hover:bg-gray-50 transition-colors",
                      row.severity === "alert" && row.hasActualData && "bg-red-50/40 hover:bg-red-50/60",
                      row.severity === "warn" && row.hasActualData && "bg-amber-50/40 hover:bg-amber-50/60",
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.name}
                      <span className="text-xs text-gray-400 ml-1.5">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {row.theoreticalQty > 0 ? row.theoreticalQty.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.hasActualData
                        ? <span className="text-gray-700">{row.actualUsedQty.toFixed(2)}</span>
                        : <span className="text-gray-300">no data</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {row.hasActualData ? (
                        <span className={cn(
                          Math.abs(row.variancePct) > 20 ? "text-red-600"
                            : Math.abs(row.variancePct) > 10 ? "text-amber-600"
                            : "text-green-600"
                        )}>
                          {row.variance >= 0 ? "+" : ""}{row.variancePct.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {row.hasActualData ? (
                        <span className={row.varianceCost > 0 ? "text-red-600" : "text-gray-900"}>
                          {formatCurrency(row.varianceCost)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                      {row.currentOnHand.toFixed(1)}
                      {row.minThreshold > 0 && row.currentOnHand < row.minThreshold && (
                        <span className="ml-1 text-red-500 text-xs">↓</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {severityBadge(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {summary.hasAnyActualData && (summary.alertCount + summary.warnCount) > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-xs text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Variance threshold: Alert = &gt;20% deviation · Warn = 10–20% deviation · Positive = over-consumed vs recipe
          </div>
        )}
      </div>
    </div>
  );
}

import React from "react";
