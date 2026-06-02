"use client";

import { useEffect, useState, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, AlertCircle, Info, ChevronDown, X, ThumbsUp,
  DollarSign, Users, Package, UtensilsCrossed, BarChart2, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { VeraWordmark, VeraSpark } from "@/components/brand/vera-mark";
import { VeraAvatar } from "@/components/brand/vera-avatar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VeraAlert {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: "SALES" | "LABOR" | "INVENTORY" | "COSTS" | "RESERVATIONS" | "OPERATIONS";
  message: string;
  link: string;
}

interface Anomaly {
  type: string;
  severity: "HIGH" | "MEDIUM";
  title: string;
  link: string;
}

interface Prediction {
  name: string;
  unit: string;
  estimatedRunsOut: string | null;
  severity: "out" | "critical" | "warn" | "ok";
  affectedMenuItems: string[];
  affected?: { id: string; name: string }[];
  hoursUntilMin: number | null;
}

type Status = "excellent" | "good" | "fair" | "strained" | "critical";

interface HealthMetric { label: string; value: string; target?: string; status: Status }
interface HealthIssue { severity: "HIGH" | "MEDIUM" | "LOW"; message: string; impact?: string; action?: string; link?: string }
interface Dimension {
  key: string; label: string; score: number; status: Status; confidence: number;
  summary: string; metrics: HealthMetric[]; wins: string[]; issues: HealthIssue[];
}
interface Projection {
  expectedRevenue: number | null; projectedRevenue: number; salesToday: number;
  projectedCOGS: number; projectedLabor: number; fixedDaily: number;
  projectedNet: number; projectedMarginPct: number;
  breakEvenRevenue: number; breakEvenProgressPct: number | null;
  serviceElapsedPct: number; inService: boolean;
}

interface Indicator { tone: "positive" | "concern" | "neutral"; text: string; key: string }

interface VeraData {
  healthScore: number;
  status: Status;
  confidence: number;
  headline: string;
  narrative: string;
  projection: Projection;
  dimensions: Dimension[];
  indicators?: Indicator[];
  learning?: { daysObserved: number; minDays: number; learning: boolean; topDrivers: { key: string; label: string; weight: number; corr: number | null }[] };
  alerts: VeraAlert[];
  rawSignals: {
    salesToday: number; refSales: number; pacingRatio: number | null;
    laborSoFar: number; projectedLaborPct: number | null;
    lowStockCount: number; active86Count: number; voidTotal: number; confirmedCovers: number;
  };
}

const dol = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const pctTxt = (n: number) => `${Math.round(n)}%`;

function dimColor(status: Status) {
  switch (status) {
    case "excellent": return { chip: "bg-emerald-50 text-emerald-700 border-emerald-200", bar: "bg-emerald-500" };
    case "good":      return { chip: "bg-teal-50 text-teal-700 border-teal-200",          bar: "bg-teal-500"    };
    case "fair":      return { chip: "bg-amber-50 text-amber-700 border-amber-200",        bar: "bg-amber-500"   };
    case "strained":  return { chip: "bg-orange-50 text-orange-700 border-orange-200",     bar: "bg-orange-500"  };
    default:          return { chip: "bg-red-50 text-red-700 border-red-200",              bar: "bg-red-500"     };
  }
}

const DIM_ICON: Record<string, ReactNode> = {
  profitability: <DollarSign className="h-3.5 w-3.5" />,
  demand: <TrendingUp className="h-3.5 w-3.5" />,
  labor: <Users className="h-3.5 w-3.5" />,
  cost: <Package className="h-3.5 w-3.5" />,
  service: <UtensilsCrossed className="h-3.5 w-3.5" />,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 90) return { ring: "ring-emerald-400/50", text: "text-emerald-600", badge: "bg-emerald-50 border-emerald-200", label: "Excellent", labelColor: "text-emerald-600" };
  if (score >= 75) return { ring: "ring-teal-400/50",    text: "text-teal-600",    badge: "bg-teal-50 border-teal-200",     label: "Good",      labelColor: "text-teal-600"    };
  if (score >= 60) return { ring: "ring-amber-400/50",   text: "text-amber-600",   badge: "bg-amber-50 border-amber-200",   label: "Fair",      labelColor: "text-amber-600"   };
  if (score >= 45) return { ring: "ring-orange-400/50",  text: "text-orange-600",  badge: "bg-orange-50 border-orange-200", label: "Strained",  labelColor: "text-orange-600"  };
  return                   { ring: "ring-red-400/50",    text: "text-red-600",     badge: "bg-red-50 border-red-200",       label: "Critical",  labelColor: "text-red-600"     };
}

function severityConfig(severity: string) {
  switch (severity) {
    case "HIGH":   return { icon: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />, dot: "bg-red-500",    text: "text-red-600",    row: "border-red-200    bg-red-50/60    hover:bg-red-50"    };
    case "MEDIUM": return { icon: <AlertCircle   className="h-3.5 w-3.5 shrink-0" />, dot: "bg-amber-400",  text: "text-amber-600",  row: "border-amber-200  bg-amber-50/60  hover:bg-amber-50"  };
    default:       return { icon: <Info          className="h-3.5 w-3.5 shrink-0" />, dot: "bg-blue-400",   text: "text-blue-600",   row: "border-blue-200   bg-blue-50/60   hover:bg-blue-50"   };
  }
}

function categoryIcon(category: string) {
  switch (category) {
    case "SALES":        return <TrendingUp      className="h-3 w-3" />;
    case "LABOR":        return <Users           className="h-3 w-3" />;
    case "INVENTORY":    return <Package         className="h-3 w-3" />;
    case "COSTS":        return <DollarSign      className="h-3 w-3" />;
    case "RESERVATIONS": return <Calendar        className="h-3 w-3" />;
    case "OPERATIONS":   return <UtensilsCrossed className="h-3 w-3" />;
    default:             return <BarChart2       className="h-3 w-3" />;
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VeraPanel() {
  const [data, setData] = useState<VeraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy86, setBusy86] = useState<string | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [hiddenInd, setHiddenInd] = useState<Set<string>>(new Set());

  function indicatorFeedback(ind: Indicator, action: "dismissed" | "helpful") {
    if (action === "dismissed") setHiddenInd((prev) => new Set(prev).add(ind.text));
    else toast.success("Noted — Vera will keep surfacing these.");
    fetch("/api/vera/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: ind.key, action, text: ind.text }),
    }).catch(() => { /* fire-and-forget */ });
  }
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    const run = async (attempt: number) => {
      // Cancel any in-flight request (brain endpoint can take a few seconds)
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      if (showSpinner) setRefreshing(true);
      else setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/vera", { signal });
        if (!res.ok) throw new Error("Failed");
        const d: VeraData = await res.json();
        setData(d);
        setLastUpdated(new Date());
        setLoading(false);
        setRefreshing(false);
      } catch (err) {
        // Superseded by a newer request — leave state alone (that request owns it).
        if ((err as Error)?.name === "AbortError") return;
        // Transient failure (cold start, brief DB contention): silently retry once
        // before surfacing an error, so a blip never flashes the error box.
        if (attempt < 1) {
          setTimeout(() => run(attempt + 1), 1500);
          return;
        }
        setError(true);
        setLoading(false);
        setRefreshing(false);
      }
    };
    await run(0);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Forward-looking run-out predictions (best-effort; never blocks the panel).
  useEffect(() => {
    let alive = true;
    fetch("/api/eightysix/predicted")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { predictions?: Prediction[] } | null) => {
        if (alive && d?.predictions) {
          setPredictions(d.predictions.filter((p) => p.severity !== "ok").slice(0, 3));
        }
      })
      .catch(() => { /* supplementary — ignore */ });
    return () => { alive = false; };
  }, []);

  // Anomalies Vera "caught" (price creep, comp/void outliers). Best-effort.
  useEffect(() => {
    let alive = true;
    fetch("/api/vera/anomalies")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { anomalies?: Anomaly[] } | null) => {
        if (alive && d?.anomalies) setAnomalies(d.anomalies);
      })
      .catch(() => { /* supplementary — ignore */ });
    return () => { alive = false; };
  }, []);

  // One-tap 86: pull every menu item that depends on the at-risk ingredient.
  async function eighty6(p: Prediction) {
    const items = p.affected ?? [];
    if (!items.length) return;
    setBusy86(p.name);
    try {
      await Promise.all(items.map((a) =>
        fetch("/api/eightysix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemId: a.id, reason: `Vera: ${p.name} running low` }),
        }),
      ));
      toast.success(`86'd ${items.map((a) => a.name).join(", ")}`);
      setPredictions((prev) => prev.filter((x) => x.name !== p.name));
    } catch {
      toast.error("Couldn't 86 those items. Try again.");
    } finally {
      setBusy86(null);
    }
  }

  function runsOutLabel(p: Prediction): string {
    if (p.severity === "out") return "out now";
    if (p.estimatedRunsOut) {
      const t = new Date(p.estimatedRunsOut);
      return `~${t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    if (p.hoursUntilMin != null) return `~${p.hoursUntilMin.toFixed(1)}h`;
    return "soon";
  }

  const health = data ? healthColor(data.healthScore) : null;
  const highAlerts  = data?.alerts.filter(a => a.severity === "HIGH") ?? [];
  const otherAlerts = data?.alerts.filter(a => a.severity !== "HIGH") ?? [];

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gray-100" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-48 rounded bg-gray-100" />
            <div className="h-3 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-14 w-14 rounded-xl bg-gray-100" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(i => <div key={i} className="h-7 w-24 rounded-lg bg-gray-100" />)}
        </div>
        <div className="border-t border-gray-100" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-9 w-full rounded-lg bg-gray-100" />)}
        </div>
      </div>
    );
  }

  // ── Error state — only after a real (retried) failure, never just a null gap ──
  if (error) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
        <p className="text-sm text-gray-500">Could not load operational analysis.</p>
        <button onClick={() => load(true)} className="ml-auto text-xs text-amber-600 hover:text-amber-700 font-medium underline">
          Retry
        </button>
      </div>
    );
  }
  // No data yet (in-flight / superseded request) — keep showing the skeleton.
  if (!data) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 space-y-4 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gray-100" />
          <div className="space-y-2 flex-1"><div className="h-4 w-48 rounded bg-gray-100" /><div className="h-3 w-64 rounded bg-gray-100" /></div>
          <div className="h-14 w-14 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
      {/* Vera header band */}
      <div className="flex items-start gap-4 p-5 pb-4 bg-white">
        {/* Vera mark */}
        <VeraAvatar className="h-14 w-14 shrink-0 drop-shadow-sm" />

        {/* Identity + narrative */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <VeraWordmark className="text-base font-bold tracking-tight text-gray-900" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-teal-600">always working</span>
            {lastUpdated && (
              <span className="ml-auto text-[10px] text-gray-400">
                updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-gray-600">{data.narrative}</p>
        </div>

        {/* Overall health */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className={cn("flex flex-col items-center justify-center h-16 w-16 rounded-2xl ring-2 border bg-white", health!.ring, health!.badge)}>
            <span className={cn("text-2xl font-bold leading-none", health!.text)}>{data.healthScore}</span>
            <span className="text-[8px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">/ 100</span>
          </div>
          <span className={cn("text-[10px] font-semibold text-center leading-tight", health!.labelColor)}>{health!.label}</span>
        </div>
      </div>

      {/* Day P&L projection */}
      <div className="grid grid-cols-3 border-y border-gray-100 divide-x divide-gray-100">
        <PLCell label="On pace for" value={dol(data.projection.projectedRevenue)} sub={data.projection.expectedRevenue != null ? `${pctTxt((data.projection.projectedRevenue / Math.max(data.projection.expectedRevenue, 1)) * 100)} of normal` : "no baseline yet"} />
        <PLCell label="Projected net" value={dol(data.projection.projectedNet)} valueClass={data.projection.projectedNet >= 0 ? "text-emerald-600" : "text-red-600"} sub={`${pctTxt(data.projection.projectedMarginPct)} margin`} />
        <PLCell label="Break-even" value={dol(data.projection.breakEvenRevenue)} sub={data.projection.breakEvenProgressPct != null ? `${pctTxt(data.projection.breakEvenProgressPct)} there` : "—"} />
      </div>

      {/* What stands out — Vera's read vs your learned normal (with feedback) */}
      {data.indicators && data.indicators.some((ind) => !hiddenInd.has(ind.text)) && (
        <div className="px-4 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">What stands out</p>
          <div className="space-y-0.5">
            {data.indicators.filter((ind) => !hiddenInd.has(ind.text)).map((ind, i) => (
              <div key={i} className="group flex items-start gap-2 text-xs rounded-md px-1 py-1 -mx-1 hover:bg-gray-50">
                {ind.tone === "positive"
                  ? <TrendingUp className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-500" />
                  : ind.tone === "concern"
                  ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                  : <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400" />}
                <span className="leading-snug text-gray-700 flex-1">{ind.text}</span>
                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button title="Helpful — keep showing these" onClick={() => indicatorFeedback(ind, "helpful")} className="text-gray-300 hover:text-emerald-500">
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button title="Dismiss — show this kind less" onClick={() => indicatorFeedback(ind, "dismissed")} className="text-gray-300 hover:text-gray-600">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimensions — the finite detail */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {data.dimensions.map((d) => (
          <DimensionCard key={d.key} d={d} expanded={expandedDim === d.key} onToggle={() => setExpandedDim(expandedDim === d.key ? null : d.key)} />
        ))}
      </div>
      {/* Vera caught — anomalies (price creep, comp/void outliers) */}
      {anomalies.length > 0 && (
        <div className="px-5 pb-1">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <VeraSpark className="h-3 w-3" /> Vera caught
          </div>
          <div className="space-y-1.5">
            {anomalies.map((a, i) => {
              const high = a.severity === "HIGH";
              return (
                <Link
                  key={i}
                  href={a.link}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                    high ? "border-red-200 bg-red-50/60 hover:bg-red-50" : "border-amber-200 bg-amber-50/60 hover:bg-amber-50",
                  )}
                >
                  <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", high ? "text-red-500" : "text-amber-500")} />
                  <span className="flex-1 leading-snug text-gray-700 group-hover:text-gray-900">{a.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Looking ahead — run-out predictions */}
      {predictions.length > 0 && (
        <div className="px-5 pb-1">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <Clock className="h-3.5 w-3.5" /> Vera predicts
          </div>
          <div className="space-y-1.5">
            {predictions.map((p, i) => {
              const crit = p.severity === "out" || p.severity === "critical";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                    crit ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60",
                  )}
                >
                  <Clock className={cn("h-3.5 w-3.5 shrink-0", crit ? "text-red-500" : "text-amber-500")} />
                  <span className="flex-1 leading-snug text-gray-700">
                    <span className="font-semibold text-gray-900">{p.name}</span> runs out{" "}
                    <span className="font-medium">{runsOutLabel(p)}</span>
                    {p.affectedMenuItems.length > 0 && (
                      <span className="text-gray-500"> · 86s {p.affectedMenuItems.slice(0, 2).join(", ")}{p.affectedMenuItems.length > 2 ? ` +${p.affectedMenuItems.length - 2}` : ""}</span>
                    )}
                  </span>
                  {p.affected && p.affected.length > 0 && (
                    <button
                      onClick={() => eighty6(p)}
                      disabled={busy86 === p.name}
                      title={`86 ${p.affected.map((a) => a.name).join(", ")}`}
                      className="shrink-0 rounded-md bg-gray-900 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      {busy86 === p.name ? "…" : "86"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Footer */}
      <div className="border-t border-gray-100 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          {data.learning
            ? data.learning.learning
              ? `Vera is learning your patterns · ${data.learning.daysObserved}/${data.learning.minDays} days`
              : `Tuned to your data · ${data.learning.topDrivers.slice(0, 2).map((t) => t.label).join(" + ")} drive your profit most`
            : "Vera · always watching your restaurant's live data"}
        </p>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          {refreshing ? "Analyzing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PLCell({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums leading-tight mt-0.5", valueClass ?? "text-gray-900")}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function issueColor(sev: string) {
  if (sev === "HIGH") return "border-red-200 bg-red-50/70 text-red-700";
  if (sev === "MEDIUM") return "border-amber-200 bg-amber-50/70 text-amber-800";
  return "border-gray-200 bg-gray-50 text-gray-600";
}

function DimensionCard({ d, expanded, onToggle }: { d: Dimension; expanded: boolean; onToggle: () => void }) {
  const c = dimColor(d.status);
  const hasDetail = d.issues.length > 0 || d.wins.length > 0 || d.metrics.length > 0;
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg border shrink-0", c.chip)}>{DIM_ICON[d.key]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{d.label}</span>
            {d.issues.some(x => x.severity === "HIGH") && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
          </div>
          <p className="text-[11px] text-gray-500 truncate">{d.summary}</p>
        </div>
        <span className={cn("text-sm font-bold tabular-nums shrink-0", c.chip.split(" ")[1])}>{d.score}</span>
        {hasDetail && (
          <ChevronDown className={cn("h-4 w-4 text-gray-300 shrink-0 transition-transform", expanded && "rotate-180")} />
        )}
      </button>

      {expanded && hasDetail && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-gray-100">
          {d.metrics.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
              {d.metrics.map((m, i) => (
                <div key={i} className="text-[11px]">
                  <span className="text-gray-400">{m.label}: </span>
                  <span className="font-semibold text-gray-700 tabular-nums">{m.value}</span>
                  {m.target && <span className="text-gray-400"> / {m.target}</span>}
                </div>
              ))}
            </div>
          )}
          {d.wins.map((w, i) => (
            <div key={`w-${i}`} className="flex items-start gap-1.5 text-[11px] text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-px text-emerald-500" /> <span>{w}</span>
            </div>
          ))}
          {d.issues.map((iss, i) => {
            const body = (
              <div className={cn("rounded-lg border px-2.5 py-1.5", issueColor(iss.severity))}>
                <p className="text-[11px] font-medium leading-snug">{iss.message}</p>
                {iss.impact && <p className="text-[10px] opacity-80 mt-0.5">{iss.impact}</p>}
                {iss.action && <p className="text-[10px] mt-0.5 font-semibold">→ {iss.action}</p>}
              </div>
            );
            return iss.link
              ? <Link key={`i-${i}`} href={iss.link} className="block hover:opacity-90">{body}</Link>
              : <div key={`i-${i}`}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}

function AlertRow({ alert }: { alert: VeraAlert }) {
  const cfg = severityConfig(alert.severity);
  return (
    <Link
      href={alert.link}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors group",
        cfg.row
      )}
    >
      <span className={cn("shrink-0", cfg.text)}>{cfg.icon}</span>
      <span className={cn("shrink-0", cfg.text)}>{categoryIcon(alert.category)}</span>
      <p className="text-xs text-gray-700 leading-snug group-hover:text-gray-900 transition-colors flex-1">
        {alert.message}
      </p>
      <span className={cn("text-[10px] font-bold uppercase tracking-wide shrink-0 opacity-60 group-hover:opacity-100", cfg.text)}>
        {alert.severity}
      </span>
    </Link>
  );
}

function SignalPill({
  icon, label, value, ok, warn, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  ok: boolean;
  warn?: boolean;
  href: string;
}) {
  const color = ok
    ? "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
    : warn
    ? "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
    : "text-red-700 border-red-200 bg-red-50 hover:bg-red-100";

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors shrink-0",
        color
      )}
    >
      {icon}
      <span className="text-gray-500">{label}</span>
      <span>{value}</span>
    </Link>
  );
}
