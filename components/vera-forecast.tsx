"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Users, ChefHat } from "lucide-react";
import { VeraSpark } from "@/components/brand/vera-mark";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { InfoTip } from "@/components/ui/info-tip";

interface PrepItem { name: string; suggestedQty: number; basis: string }
interface Daypart { name: string; projectedSales: number; share: number }
interface Forecast {
  projectedSales: number;
  projectedCovers: number;
  reservedCovers: number;
  sampleCount: number;
  dowName: string;
  confidence: "low" | "medium" | "high";
  prep: PrepItem[];
  narrative: string;
  dayparts?: Daypart[];
  holiday?: { name: string; tendency: string } | null;
  weather?: { summary: string; tempMaxF: number; precipMm: number } | null;
  adjustmentPct?: number;
}

const CONF: Record<string, string> = {
  high:   "bg-emerald-50 text-emerald-600 border-emerald-200",
  medium: "bg-amber-50 text-amber-600 border-amber-200",
  low:    "bg-gray-100 text-gray-500 border-gray-200",
};

export function VeraForecast() {
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/vera/forecast")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Forecast) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setFailed(true); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Supplementary card — stay quiet on failure rather than show an error box.
  if (failed) return null;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-gray-200 p-5 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-gray-100" />
          <div className="h-4 w-40 rounded bg-gray-100" />
        </div>
        <div className="mt-4 h-3 w-full rounded bg-gray-100" />
        <div className="mt-2 h-3 w-2/3 rounded bg-gray-100" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <VeraAvatar src="/vera-forecast-notext.png" fit="contain" background className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <span className="text-sm font-bold text-gray-900 inline-flex items-center gap-1">
            Vera Forecast <VeraSpark className="h-3 w-3" />
            <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-600">Looking ahead</span>
            <InfoTip title="How the forecast works">
              A recency-weighted model on your same-weekday history with a trend term, then lifted by tonight&apos;s reservations and events and nudged by weather/holidays. Prep quantities use a service-level target (the waste-vs-stockout sweet spot). Accuracy is backtested against your own history and the model re-tunes itself nightly.
            </InfoTip>
          </span>
        </div>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${CONF[data.confidence]}`}>
          {data.confidence} confidence
        </span>
      </div>

      {/* Projection numbers */}
      <div className="grid grid-cols-2 gap-px bg-gray-100 mx-5 rounded-xl overflow-hidden border border-gray-100">
        <div className="bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><TrendingUp className="h-3.5 w-3.5" /> Projected sales</div>
          <div className="mt-1 text-xl font-bold text-indigo-600">${data.projectedSales.toLocaleString("en-US")}</div>
        </div>
        <div className="bg-white px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500"><Users className="h-3.5 w-3.5" /> Projected guests</div>
          <div className="mt-1 text-xl font-bold text-gray-900">
            {data.projectedCovers}
            {data.reservedCovers > 0 && <span className="ml-1.5 text-xs font-medium text-gray-400">{data.reservedCovers} booked</span>}
          </div>
        </div>
      </div>

      {/* Daypart split */}
      {data.dayparts && data.dayparts.filter((d) => d.projectedSales > 0).length > 0 && (
        <div className="px-5 pt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
            {data.dayparts.map((d, i) => (
              <div
                key={d.name}
                className={i === 0 ? "bg-amber-400" : "bg-indigo-500"}
                style={{ width: `${Math.max(0, d.share * 100)}%` }}
                title={`${d.name}: $${d.projectedSales.toLocaleString("en-US")}`}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500">
            {data.dayparts.map((d, i) => (
              <span key={d.name} className="inline-flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${i === 0 ? "bg-amber-400" : "bg-indigo-500"}`} />
                {d.name} ${d.projectedSales.toLocaleString("en-US")} ({Math.round(d.share * 100)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exogenous signals: holiday + weather */}
      {(data.holiday || (data.weather && data.weather.summary !== "mild")) && (
        <div className="px-5 pt-2.5 flex flex-wrap gap-2">
          {data.holiday && (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
              🗓 {data.holiday.name}
              {typeof data.adjustmentPct === "number" && data.adjustmentPct !== 0 && (
                <span className="text-rose-400">{data.adjustmentPct > 0 ? "+" : ""}{data.adjustmentPct}%</span>
              )}
            </span>
          )}
          {data.weather && data.weather.summary !== "mild" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-600">
              🌦 {data.weather.summary}, {data.weather.tempMaxF}°F
            </span>
          )}
        </div>
      )}

      {/* Narrative */}
      <p className="px-5 pt-3 text-sm leading-relaxed text-gray-700">{data.narrative}</p>

      {/* Prep recommendations */}
      <div className="px-5 pb-4 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          <ChefHat className="h-3.5 w-3.5" /> Vera recommends prepping
        </div>
        {data.prep.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {data.prep.map((p) => (
              <span key={p.name} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs" title={p.basis}>
                <span className="font-bold text-gray-900 tabular-nums">{p.suggestedQty}×</span>
                <span className="text-gray-600">{p.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed">
            Per-item prep quantities come online once menu-item sales are flowing — from live orders or an item-level import. The day&apos;s sales and covers forecast above already runs on your history.
          </p>
        )}
      </div>

      {/* Methodology footer — makes it explicit the forecast is grounded in their real days */}
      {data.sampleCount > 0 && (
        <p className="px-5 pb-4 -mt-1 text-[11px] text-gray-400">
          Based on {data.sampleCount} {data.dowName}{data.sampleCount !== 1 ? "s" : ""} in your sales history.
        </p>
      )}
    </div>
  );
}
