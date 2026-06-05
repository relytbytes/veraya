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

/**
 * Compact current-conditions strip for the dashboard. Renders nothing until a
 * venue location is set in Settings → Weather location, so it stays invisible
 * rather than showing an empty box.
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

  const adj = w.multiplier && Math.abs(w.multiplier - 1) >= 0.01
    ? `${w.multiplier > 1 ? "+" : ""}${Math.round((w.multiplier - 1) * 100)}% demand`
    : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
      <span className="text-2xl leading-none" aria-hidden>{w.emoji}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-gray-900 tabular-nums">{w.tempNowF}°</span>
        <span className="text-sm text-gray-500">{w.condition}</span>
      </div>
      <div className="text-xs text-gray-400">
        H {w.hiF}° · L {w.loF}°
      </div>
      {w.label && <span className="hidden sm:inline text-xs text-gray-400">· {w.label}</span>}
      {adj && (
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${w.multiplier! >= 1 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
          {adj}
        </span>
      )}
    </div>
  );
}
