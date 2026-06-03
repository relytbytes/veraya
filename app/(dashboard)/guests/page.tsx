"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { Loader2, Users, GitMerge, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Member {
  id: string; name: string; phone: string | null; email: string | null;
  visitCount: number; loyaltyPoints: number; lastVisitAt: string | null;
}
interface Group { confidence: "high" | "possible"; reason: string; primaryId: string; members: Member[] }

export default function GuestsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [primary, setPrimary] = useState<Record<number, string>>({});
  const [merging, setMerging] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/customers/duplicates");
    if (res.ok) {
      const d = await res.json();
      setGroups(d.groups);
      setPrimary(Object.fromEntries((d.groups as Group[]).map((g, i) => [i, g.primaryId])));
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function merge(gi: number, g: Group) {
    const primaryId = primary[gi] ?? g.primaryId;
    const dupes = g.members.filter((m) => m.id !== primaryId).map((m) => m.id);
    const keep = g.members.find((m) => m.id === primaryId);
    if (!(await confirmDialog(`Merge ${dupes.length} profile(s) into "${keep?.name}"? Their reservations, orders, loyalty and history move to the kept profile. This can't be undone.`))) return;
    setMerging(gi);
    try {
      const res = await fetch("/api/customers/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, duplicateIds: dupes }),
      });
      if (res.ok) { toast.success(`Merged into ${keep?.name}`); await load(); }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error ?? "Merge failed"); }
    } finally { setMerging(null); }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Guest Profiles" description="Vera's duplicate-profile review — merge split records into one guest." />
      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3 text-sm text-teal-800">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Vera scans your guest book for the same person saved more than once (matching phone, email, or name). Review each group and merge the duplicates into the profile you want to keep — history is preserved.</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        ) : groups.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-gray-500">
            <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            <p className="font-semibold text-gray-700">No duplicate profiles found</p>
            <p className="text-sm">Your guest book is clean.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {groups.map((g, gi) => {
              const primaryId = primary[gi] ?? g.primaryId;
              return (
                <Card key={gi}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-900">{g.members.length} possible matches</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                          g.confidence === "high" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200")}>
                          {g.reason}{g.confidence === "possible" ? " · review carefully" : ""}
                        </span>
                      </div>
                      <Button size="sm" onClick={() => merge(gi, g)} disabled={merging === gi}>
                        {merging === gi ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />} Merge
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {g.members.map((m) => (
                        <label key={m.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer",
                          m.id === primaryId ? "border-teal-300 bg-teal-50/50" : "border-gray-200")}>
                          <input type="radio" name={`primary-${gi}`} checked={m.id === primaryId}
                            onChange={() => setPrimary((p) => ({ ...p, [gi]: m.id }))} className="accent-teal-600" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-gray-900">{m.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{[m.phone, m.email].filter(Boolean).join(" · ") || "no contact"}</span>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{m.visitCount} visit{m.visitCount !== 1 ? "s" : ""} · {m.loyaltyPoints} pts</span>
                          {m.id === primaryId && <span className="text-[10px] font-bold uppercase tracking-wide text-teal-600 shrink-0">Keep</span>}
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
