"use client";

import { useEffect, useState } from "react";

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

/**
 * Compact current-conditions strip for the dashboard. Renders nothing until a
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

  return (
    <div className={`flex items-center gap-5 rounded-2xl border border-gray-200/80 bg-gradient-to-br ${gradientFor(w.condition)} px-6 py-4 shadow-sm`}>
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-4xl shadow-sm ring-1 ring-black/5">
        {w.emoji}
      </div>

      <div className="flex items-center gap-4 min-w-0">
        <span className="text-5xl font-bold leading-none tabular-nums text-gray-900">{w.tempNowF}°</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-lg font-semibold text-gray-800 leading-tight truncate">{w.condition}</span>
          <span className="text-sm text-gray-500 leading-tight truncate">
            H {w.hiF}° · L {w.loF}°{w.label ? ` · ${w.label}` : ""}
          </span>
        </div>
      </div>

      {showAdj && (
        <span
          className={`ml-auto shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold ${up ? "bg-emerald-100/80 text-emerald-700" : "bg-red-100/80 text-red-700"}`}
          title="How weather is nudging today's demand forecast"
        >
          {up ? "↑" : "↓"} {Math.abs(adjPct)}% demand
        </span>
      )}
    </div>
  );
}
