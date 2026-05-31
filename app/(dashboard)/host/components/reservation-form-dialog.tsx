"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Loader2 } from "lucide-react";
import type { TableRow, CardPolicy } from "../host-utils";

export interface NewReservation {
  name: string; phone: string; partySize: string; time: string; notes: string; tableId: string;
}

const EMPTY: NewReservation = { name: "", phone: "", partySize: "2", time: "19:00", notes: "", tableId: "" };

export function ReservationFormDialog({
  open, onClose, onSubmit, saving, availableTables, cardPolicy,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: NewReservation) => void;
  saving: boolean;
  availableTables: TableRow[];
  cardPolicy: CardPolicy | null;
}) {
  const [form, setForm] = useState<NewReservation>(EMPTY);
  const set = (k: keyof NewReservation, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setForm(EMPTY); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New reservation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Guest name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Party size</Label>
              <Input type="number" min={1} value={form.partySize} onChange={(e) => set("partySize", e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Phone" />
          </div>
          <div>
            <Label>Table (optional)</Label>
            <Select value={form.tableId || "none"} onValueChange={(v) => set("tableId", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {availableTables.map((t) => (
                  <SelectItem key={t.id} value={t.id}>Table {t.number} · seats {t.capacity}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Occasion, seating preference…" />
          </div>
          {cardPolicy?.enabled && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <CreditCard className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Card-on-file policy is active — a ${(cardPolicy.holdAmountCents / 100).toFixed(0)} hold applies per the no-show policy.</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setForm(EMPTY); }}>Cancel</Button>
          <Button
            onClick={() => onSubmit(form)}
            disabled={saving || !form.name.trim() || !form.time}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
