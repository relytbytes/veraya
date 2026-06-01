"use client";

import { useEffect, useState } from "react";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { cn } from "@/lib/utils";

interface Daypart {
  name: string;
  projectedSales: number;
  recommendedHours: number;
  scheduledHours: number;
  status: "ok" | "over" | "under" | "unknown";
}
interface LaborPlan {
  dayName: string;
  date: string;
  sampleCount: number;
  splh: number;
  dayparts: Daypart[];
  narrative: string;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  ok:      { label: "On target",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  over:    { label: "Overstaffed",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  under:   { label: "Understaffed", cls: "bg-red-50 text-red-700 border-red-200" },
  unknown: { label: "No plan",      cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export function VeraLaborPlan() {
  const [data, setData] = useState<LaborPlan | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/vera/labor")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: LaborPlan) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;
  if (!data) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse"><div className="h-4 w-48 rounded bg-gray-100" /></div>;
  }
  if (data.sampleCount === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <VeraAvatar className="h-9 w-9 shrink-0" />
        <div>
          <p className="text-sm font-bold text-gray-900">Vera Labor Plan</p>
          <p className="text-xs text-gray-400">{data.dayName} · target ${data.splh}/labor-hour</p>
        </div>
      </div>
      <p className="px-5 pb-3 text-sm leading-relaxed text-gray-700">{data.narrative}</p>
      <div className="space-y-2 px-5 pb-4">
        {data.dayparts.map((d) => (
          <div key={d.name} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <span className="w-14 text-sm font-semibold text-gray-900">{d.name}</span>
            <span className="text-xs text-gray-500">${d.projectedSales.toLocaleString("en-US")} proj</span>
            <span className="ml-auto text-xs text-gray-500 tabular-nums">{d.scheduledHours}h sched / {d.recommendedHours}h rec</span>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", STATUS[d.status].cls)}>
              {STATUS[d.status].label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
