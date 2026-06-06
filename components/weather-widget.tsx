"use client";

import { useEffect, useState } from "react";

interface ForecastDay {
  date: string;
  label: string;
  hiF: number;
  loF: number;
  emoji: string;
  condition: string;
  precipMm: number;
  multiplier: number;
}

interface WeatherDisplay {
  configured: boolean;
  label?: string;
  tempNowF?: number;
  hiF?: number;
  loF?: number;
  condition?: string;
  emoji?: string;
  precipMm?: number;
  multiplier?: number;
  days?: ForecastDay[];
}

// Condition → soft gradient so the strip feels alive without shouting.
function gradientFor(condition?: string): string {
  const c = (condition ?? "").toLowerCase();
  if (c.includes("thunder")) return "from-indigo-100 via-slate-50 to-slate-100";
  if (c.includes("snow")) return "from-sky-50 via-slate-50 to-blue-50";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "from-sky-100 via-sky-50 to-blue-50";
  if (c.includes("fog") || c.includes("overcast")) return "from-slate-100 via-slate-50 to-gray-100";
  if (c.includes("cloud")) return "from-sky-50 via-slate-50 to-slate-100";
  return "from-amber-50 via-sky-50 to-sky-100"; // clear / mostly clear
}

// A day's weather → demand nudge, as a color + optional label. This is the
// business angle: at a glance, which days the weather may lift or cut covers.
function dayDemand(multiplier: number) {
  const pct = Math.round((multiplier - 1) * 100);
  if (pct <= -2) return { bar: "bg-red-400", tone: "text-red-600", text: `↓${Math.abs(pct)}%` };
  if (pct >= 2) return { bar: "bg-emerald-400", tone: "text-emerald-600", text: `↑${pct}%` };
  return { bar: "bg-gray-200", tone: "text-gray-400", text: "" };
}

/**
 * Dashboard weather snapshot: current conditions + a multi-day strip, each day
 * tinted by its forecast demand impact so a manager can answer "how's the week
 * looking and how will it hit business?" at a glance. Renders nothing until a
 * venue location is set in Settings → Weather location.
 */
export function WeatherWidget() {
  const [w, setW] = useState<WeatherDisplay | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/weather")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WeatherDisplay | null) => { if (alive && d?.configured) setW(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!w?.configured) return null;

  const adjPct = w.multiplier != null ? Math.round((w.multiplier - 1) * 100) : 0;
  const showAdj = Math.abs(adjPct) >= 1;
  const up = (w.multiplier ?? 1) >= 1;
  const days = (w.days ?? []).slice(0, 5);

  return (
    <div className={`flex flex-col rounded-2xl border border-gray-200/80 bg-gradient-to-br ${gradientFor(w.condition)} px-5 py-4 shadow-sm`}>
      {/* Current conditions */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-3xl shadow-sm ring-1 ring-black/5">
          {w.emoji}
        </div>
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-3xl font-bold leading-none tabular-nums text-gray-900">{w.tempNowF}°</span>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-gray-800 leading-tight truncate">{w.condition}</span>
            {w.label && <span className="text-xs text-gray-500 leading-tight truncate">{w.label}</span>}
          </div>
        </div>

        {showAdj && (
          <span
            className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${up ? "bg-emerald-100/80 text-emerald-700" : "bg-red-100/80 text-red-700"}`}
            title="How today's weather is nudging the demand forecast"
          >
            {up ? "↑" : "↓"} {Math.abs(adjPct)}% demand
          </span>
        )}
      </div>

      {/* Multi-day snapshot */}
      {days.length > 1 && (
        <>
          <div className="my-3 border-t border-black/5" />
          <div className="grid grid-cols-5 gap-1.5">
            {days.map((d) => {
              const dd = dayDemand(d.multiplier);
              return (
                <div key={d.date} className="flex flex-col items-center gap-1 rounded-xl px-1 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{d.label}</span>
                  <span className="text-2xl leading-none" title={d.condition}>{d.emoji}</span>
                  <div className="flex items-baseline gap-1 tabular-nums">
                    <span className="text-sm font-bold text-gray-900">{d.hiF}°</span>
                    <span className="text-xs text-gray-400">{d.loF}°</span>
                  </div>
                  <div className={`mt-0.5 h-1 w-8 rounded-full ${dd.bar}`} title="Forecast demand impact" />
                  <span className={`text-[10px] font-semibold leading-none ${dd.tone}`}>{dd.text || " "}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-gray-400">Bar shows each day&apos;s forecast demand impact</p>
        </>
      )}
    </div>
  );
}
