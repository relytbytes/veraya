"use client";

import { useEffect, useState } from "react";
import { VeraMark } from "@/components/brand/vera-mark";
import { cn } from "@/lib/utils";

type Klass = "star" | "plowhorse" | "puzzle" | "dog";
interface MenuMove { item: string; klass: Klass; marginPct: number; units: number; action: string }

const KLASS: Record<Klass, { label: string; cls: string }> = {
  star:      { label: "⭐ Star",      cls: "bg-green-100 text-green-800" },
  plowhorse: { label: "🐎 Plowhorse", cls: "bg-amber-100 text-amber-800" },
  puzzle:    { label: "🧩 Puzzle",    cls: "bg-blue-100 text-blue-800" },
  dog:       { label: "🐕 Dog",       cls: "bg-gray-100 text-gray-600" },
};

export function VeraMenuMoves() {
  const [moves, setMoves] = useState<MenuMove[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/vera/menu-moves")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { moves?: MenuMove[] }) => { if (alive) setMoves(d.moves ?? []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;

  if (!moves) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 animate-pulse">
        <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-full bg-gray-100" /><div className="h-4 w-44 rounded bg-gray-100" /></div>
        <div className="mt-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-gray-100" />)}</div>
      </div>
    );
  }
  if (moves.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <VeraMark className="h-9 w-9 shrink-0" />
        <div>
          <p className="text-sm font-bold text-gray-900">Vera&apos;s Menu Moves</p>
          <p className="text-xs text-gray-400">Prioritized this week, by margin impact</p>
        </div>
      </div>
      <div className="divide-y divide-gray-50">
        {moves.map((m, i) => (
          <div key={i} className="flex items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-900">{m.item}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", KLASS[m.klass].cls)}>{KLASS[m.klass].label}</span>
                <span className="text-[11px] text-gray-400">{m.marginPct}% margin · {m.units} sold</span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{m.action}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
