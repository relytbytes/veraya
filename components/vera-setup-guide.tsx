"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { VeraSpark } from "@/components/brand/vera-mark";

interface SetupStep { key: string; label: string; done: boolean; href: string; hint: string }
interface Setup { steps: SetupStep[]; doneCount: number; total: number; complete: boolean }

export function VeraSetupGuide() {
  const [data, setData] = useState<Setup | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/vera/setup")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Setup | null) => { if (alive) setData(d); })
      .catch(() => { /* supplementary */ });
    return () => { alive = false; };
  }, []);

  // Once everything's configured, Vera steps out of the way entirely.
  if (!data || data.complete) return null;

  const pct = Math.round((data.doneCount / data.total) * 100);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header band */}
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#0B1320] via-[#101f33] to-[#15293f] px-5 py-4">
        <VeraAvatar className="h-11 w-11 shrink-0 drop-shadow-md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white inline-flex items-center gap-1">Let&apos;s set up Veraya <VeraSpark className="h-3 w-3" /></span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">A few steps and Vera starts working for you. {data.doneCount} of {data.total} done.</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-bold text-white tabular-nums">{pct}%</div>
          <div className="mt-1 h-1.5 w-16 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-teal-400" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-gray-50">
        {data.steps.map((s) => (
          s.done ? (
            <div key={s.key} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm text-gray-400 line-through">{s.label}</span>
            </div>
          ) : (
            <Link key={s.key} href={s.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-200" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-500">{s.hint}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-500" />
            </Link>
          )
        ))}
      </div>
    </div>
  );
}
