"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Armchair, ListPlus, Loader2, Search, Star, X } from "lucide-react";
import type { TableRow } from "../host-utils";

export interface WalkInData {
  name: string; partySize: string; phone: string; notes: string;
  /** Set when the host picked an existing guest from the search. */
  customerId?: string;
}

interface GuestMatch {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string | null; visitCount: number;
}

const EMPTY: WalkInData = { name: "", partySize: "2", phone: "", notes: "", customerId: undefined };

export function SeatWalkInDialog({
  open, onClose, targetTable, saving, onSeat, onWaitlist,
}: {
  open: boolean;
  onClose: () => void;
  /** When set, seat directly at this table; otherwise host picks a table on the floor. */
  targetTable: TableRow | null;
  saving: boolean;
  onSeat: (data: WalkInData, table: TableRow | null) => void;
  onWaitlist: (data: WalkInData) => void;
}) {
  const [form, setForm] = useState<WalkInData>(EMPTY);
  const [matches, setMatches] = useState<GuestMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [searching, setSearching] = useState(false);
  const [linked, setLinked] = useState<GuestMatch | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: keyof WalkInData, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && form.phone.trim() && Number(form.partySize) > 0;
  const close = () => { onClose(); setForm(EMPTY); setMatches([]); setLinked(null); setShowMatches(false); };

  // Search guests by name / phone / email across the system as the host types.
  useEffect(() => {
    const q = form.name.trim();
    if (linked || q.length < 2) { setMatches([]); setShowMatches(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
        if (res.ok) { setMatches((await res.json()) as GuestMatch[]); setShowMatches(true); }
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [form.name, linked]);

  function pickGuest(g: GuestMatch) {
    setLinked(g);
    setForm((f) => ({ ...f, name: g.name, phone: g.phone ?? f.phone, customerId: g.id }));
    setShowMatches(false);
  }

  function clearGuest() {
    setLinked(null);
    setForm((f) => ({ ...f, customerId: undefined }));
  }

  const tags = (linked?.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{targetTable ? `Seat walk-in at Table ${targetTable.number}` : "Seat a walk-in"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Unified guest search / name */}
          <div>
            <Label>Guest</Label>
            {linked ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-900 truncate">{linked.name}</span>
                    {tags.includes("VIP") && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {linked.visitCount} visit{linked.visitCount === 1 ? "" : "s"}
                    {linked.phone ? ` · ${linked.phone}` : ""}
                    {tags.length ? ` · ${tags.join(", ")}` : ""}
                  </p>
                </div>
                <button onClick={clearGuest} className="shrink-0 text-gray-400 hover:text-gray-700" title="Use a different name">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  className="pl-8"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Search name, phone, or email — or type a new name"
                  autoFocus
                  onFocus={() => { if (matches.length) setShowMatches(true); }}
                />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
                {showMatches && matches.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {matches.map((g) => {
                      const gtags = (g.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
                      return (
                        <button key={g.id} onClick={() => pickGuest(g)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-gray-900 truncate">{g.name}</span>
                              {gtags.includes("VIP") && <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />}
                            </div>
                            <p className="text-xs text-gray-400 truncate">{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact on file"}</p>
                          </div>
                          <span className="shrink-0 text-[11px] text-gray-400">{g.visitCount} visit{g.visitCount === 1 ? "" : "s"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Party size</Label>
              <Input type="number" min={1} value={form.partySize} onChange={(e) => set("partySize", e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="For waitlist text" />
            </div>
          </div>
          {!targetTable && (
            <p className="text-xs text-gray-500">
              Choose &ldquo;Pick a table&rdquo; to seat now (tap a highlighted table on the floor), or add to the waitlist.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          {targetTable ? (
            <Button disabled={saving || !valid} onClick={() => onSeat(form, targetTable)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Armchair className="h-4 w-4 mr-1.5" />} Seat here
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={!valid} onClick={() => onWaitlist(form)}>
                <ListPlus className="h-4 w-4 mr-1.5" /> Waitlist
              </Button>
              <Button disabled={!valid} onClick={() => onSeat(form, null)}>
                <Armchair className="h-4 w-4 mr-1.5" /> Pick a table
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
