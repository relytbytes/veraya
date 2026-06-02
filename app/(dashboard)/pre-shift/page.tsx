"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Star, AlertTriangle, Users, Clock, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { cn } from "@/lib/utils";

interface Flag { label: string; kind: "positive" | "watch" | "info" }
interface Insights {
  visits: number; lastVisitAt: string | null; avgCheckCents: number;
  avgDwellMins: number | null; favoriteItems: { name: string; count: number }[];
  avgTipPct: number | null; tippedOrders: number;
}
interface Entry {
  id: string; time: string; name: string; partySize: number;
  tableNumber: number | null; status: string; notes: string | null;
  guestNotes: string | null; insights: Insights | null; flags: Flag[];
}
interface PreShift {
  date: string;
  summary: { parties: number; covers: number; vip: number; watch: number; ppx: number };
  entries: Entry[];
}

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
function money(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

const FLAG_STYLE: Record<Flag["kind"], string> = {
  positive: "bg-green-100 text-green-800",
  watch: "bg-warning-100 text-warning-800",
  info: "bg-blue-100 text-blue-700",
};

export default function PreShiftPage() {
  const [date, setDate] = useState(toISO(new Date()));
  const [data, setData] = useState<PreShift | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/pre-shift?date=${d}`);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(date); }, [date, load]);

  function shift(days: number) {
    const d = new Date(date + "T12:00:00"); d.setDate(d.getDate() + days); setDate(toISO(d));
  }

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <Header title="Pre-Shift Brief" description="Vera's read on tonight's book — who's coming and what to watch" />

      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Date nav */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold text-gray-900 min-w-[200px] text-center">{dateLabel}</span>
            <button onClick={() => shift(1)} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={() => setDate(toISO(new Date()))} className="text-xs font-medium text-amber-600 hover:underline">Today</button>
        </div>

        {/* Summary */}
        {data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Parties", value: data.summary.parties, icon: <Users className="h-4 w-4 text-gray-500" /> },
              { label: "Covers", value: data.summary.covers, icon: <Users className="h-4 w-4 text-gray-500" /> },
              { label: "PPX", value: data.summary.ppx, icon: <Star className="h-4 w-4 text-green-600" /> },
              { label: "VIP", value: data.summary.vip, icon: <Star className="h-4 w-4 text-amber-500" /> },
              { label: "Watch", value: data.summary.watch, icon: <AlertTriangle className="h-4 w-4 text-warning-600" /> },
            ].map((s) => (
              <Card key={s.label}><CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{s.label}</p>{s.icon}
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{s.value}</p>
              </CardContent></Card>
            ))}
          </div>
        )}

        {/* Vera intro */}
        <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <VeraAvatar className="h-9 w-9 shrink-0" />
          <p className="text-sm text-gray-600 leading-relaxed">
            {loading ? "Reading the book…"
              : data && data.entries.length === 0 ? `No reservations on the book for ${dateLabel}.`
              : data ? `${data.summary.parties} parties, ${data.summary.covers} covers. ${data.summary.ppx} to make feel special${data.summary.watch ? `, ${data.summary.watch} to keep an eye on` : ""}.`
              : "Could not load the brief."}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-2">
            {data?.entries.map((e) => (
              <Card key={e.id}><CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">{fmtTime(e.time)}</span>
                      <span className="text-sm font-semibold text-gray-900">{e.name}</span>
                      <span className="text-xs text-gray-500">· {e.partySize} {e.partySize === 1 ? "guest" : "guests"}</span>
                      {e.tableNumber && <span className="text-xs text-gray-400">· Table {e.tableNumber}</span>}
                    </div>
                    {/* Flags */}
                    {e.flags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.flags.map((f, i) => (
                          <span key={i} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", FLAG_STYLE[f.kind])}>
                            {f.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Insight line */}
                    {e.insights && e.insights.visits > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{e.insights.visits} visit{e.insights.visits === 1 ? "" : "s"}</span>
                        {e.insights.avgCheckCents > 0 && <span>avg {money(e.insights.avgCheckCents)}</span>}
                        {e.insights.avgDwellMins && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{e.insights.avgDwellMins}m</span>}
                        {e.insights.avgTipPct != null && <span>tips {e.insights.avgTipPct}%</span>}
                        {e.insights.favoriteItems.length > 0 && (
                          <span className="truncate">loves {e.insights.favoriteItems.map((f) => f.name).slice(0, 2).join(", ")}</span>
                        )}
                      </div>
                    )}
                    {(e.guestNotes || e.notes) && (
                      <p className="mt-1.5 text-xs text-gray-500 italic">{[e.guestNotes, e.notes].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{e.status}</span>
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
