"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, AlertCircle, Info,
  DollarSign, Users, Package, UtensilsCrossed, BarChart2, Calendar, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  hoursUntilMin: number | null;
}

interface VeraData {
  healthScore: number;
  narrative: string;
  alerts: VeraAlert[];
  rawSignals: {
    salesToday: number;
    refSales: number;
    pacingRatio: number | null;
    laborSoFar: number;
    projectedLaborPct: number | null;
    lowStockCount: number;
    active86Count: number;
    voidTotal: number;
    confirmedCovers: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 90) return { ring: "ring-emerald-400/50", text: "text-emerald-600", badge: "bg-emerald-50 border-emerald-200", label: "Strong Day",        labelColor: "text-emerald-600" };
  if (score >= 75) return { ring: "ring-amber-400/50",   text: "text-amber-600",   badge: "bg-amber-50 border-amber-200",   label: "Attention Needed",  labelColor: "text-amber-600"   };
  if (score >= 60) return { ring: "ring-orange-400/50",  text: "text-orange-600",  badge: "bg-orange-50 border-orange-200", label: "Multiple Issues",   labelColor: "text-orange-600"  };
  return                   { ring: "ring-red-400/50",    text: "text-red-600",     badge: "bg-red-50 border-red-200",       label: "Action Required",   labelColor: "text-red-600"     };
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
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
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
  }, []);

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
      <div className="flex items-start gap-4 p-5 pb-4 bg-gradient-to-br from-[#0B1320] via-[#101f33] to-[#15293f]">
        {/* Vera mark */}
        <VeraAvatar className="h-14 w-14 shrink-0 drop-shadow-md" />

        {/* Identity + narrative */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <VeraWordmark className="text-base font-bold tracking-tight text-white" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-teal-300/80">always working</span>
            {lastUpdated && (
              <span className="ml-auto text-[10px] text-white/40">
                updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-slate-200">{data.narrative}</p>
        </div>

        {/* Health score */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">
          <div className={cn(
            "flex flex-col items-center justify-center h-14 w-14 rounded-xl ring-2 border bg-white",
            health!.ring, health!.badge
          )}>
            <span className={cn("text-xl font-bold leading-none", health!.text)}>{data.healthScore}</span>
            <span className="text-[8px] text-gray-400 font-medium uppercase tracking-wide mt-0.5">/ 100</span>
          </div>
          <span className="text-[10px] font-semibold text-center leading-tight max-w-[56px] text-white/90">
            {health!.label}
          </span>
        </div>
      </div>

      {/* Signal pills */}
      {data.rawSignals && (
        <div className="flex gap-2 px-5 pb-4 overflow-x-auto scrollbar-none">
          {data.rawSignals.pacingRatio !== null && (
            <SignalPill
              icon={data.rawSignals.pacingRatio >= 0.95 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              label="Sales pace"
              value={`${(data.rawSignals.pacingRatio * 100).toFixed(0)}%`}
              ok={data.rawSignals.pacingRatio >= 0.93}
              warn={data.rawSignals.pacingRatio >= 0.80}
              href="/reports"
            />
          )}
          {data.rawSignals.salesToday > 0 && (
            <SignalPill icon={<DollarSign className="h-3 w-3" />} label="Today" value={fmt(data.rawSignals.salesToday)} ok href="/reports" />
          )}
          {data.rawSignals.projectedLaborPct !== null && (
            <SignalPill
              icon={<Users className="h-3 w-3" />}
              label="Labor"
              value={`${data.rawSignals.projectedLaborPct.toFixed(1)}%`}
              ok={data.rawSignals.projectedLaborPct < 33}
              warn={data.rawSignals.projectedLaborPct < 38}
              href="/staff"
            />
          )}
          {data.rawSignals.lowStockCount > 0 && (
            <SignalPill icon={<Package className="h-3 w-3" />} label="Low stock" value={String(data.rawSignals.lowStockCount)} ok={false} warn={data.rawSignals.lowStockCount < 4} href="/inventory" />
          )}
          {data.rawSignals.active86Count > 0 && (
            <SignalPill icon={<UtensilsCrossed className="h-3 w-3" />} label="86'd" value={String(data.rawSignals.active86Count)} ok={false} warn href="/pos" />
          )}
          {data.rawSignals.confirmedCovers > 0 && (
            <SignalPill icon={<Calendar className="h-3 w-3" />} label="Covers tonight" value={String(data.rawSignals.confirmedCovers)} ok href="/host" />
          )}
        </div>
      )}

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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-100 mx-5" />

      {/* Alerts */}
      <div className="p-5 pt-4 space-y-2">
        {data.alerts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600 py-1">
            <CheckCircle2 className="h-4 w-4" />
            All systems looking good — no significant issues detected.
          </div>
        ) : (
          <>
            {highAlerts.map((alert, i)  => <AlertRow key={`h-${i}`} alert={alert} />)}
            {otherAlerts.map((alert, i) => <AlertRow key={`o-${i}`} alert={alert} />)}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[10px] text-gray-300">Vera · always watching your restaurant&apos;s live data</p>
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
