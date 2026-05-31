"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Armchair, ListPlus, Loader2 } from "lucide-react";
import type { TableRow } from "../host-utils";

export interface WalkInData {
  name: string; partySize: string; phone: string; notes: string;
}

const EMPTY: WalkInData = { name: "", partySize: "2", phone: "", notes: "" };

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
  const set = (k: keyof WalkInData, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name.trim() && Number(form.partySize) > 0;
  const close = () => { onClose(); setForm(EMPTY); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{targetTable ? `Seat walk-in at Table ${targetTable.number}` : "Seat a walk-in"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Guest name" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Party size</Label>
              <Input type="number" min={1} value={form.partySize} onChange={(e) => set("partySize", e.target.value)} />
            </div>
            <div>
              <Label>Phone (optional)</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="For waitlist text" />
            </div>
          </div>
          {!targetTable && (
            <p className="text-xs text-gray-500">
              Choose “Pick a table” to seat now (tap a highlighted table on the floor), or add to the waitlist.
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
