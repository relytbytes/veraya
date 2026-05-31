"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { type CustomerProfile, parseAllergies, displayTags } from "../host-utils";

/** Edit a guest's profile. Allergies + tags are persisted into the single
 *  comma-separated `tags` field (allergies as "Allergy:X"). */
export function GuestEditDialog({
  customer, open, onClose, onSaved,
}: {
  customer: CustomerProfile | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [allergies, setAllergies] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Seed the form whenever a different guest is opened.
  useEffect(() => {
    if (!open || !customer) return;
    setName(customer.name);
    setAllergies(parseAllergies(customer.tags).join(", "));
    setTags(displayTags(customer.tags).join(", "));
    setNotes(customer.notes ?? "");
  }, [open, customer]);

  async function save() {
    if (!customer) return;
    setSaving(true);
    try {
      const allergyTags = allergies.split(",").map((a) => a.trim()).filter(Boolean).map((a) => `Allergy:${a}`);
      const otherTags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      const merged = [...otherTags, ...allergyTags].join(", ");
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), notes, tags: merged }),
      });
      if (res.ok) { onSaved(); onClose(); }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Guest profile</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Allergies <span className="text-gray-400 font-normal">(comma-separated)</span></Label>
            <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Nuts, Shellfish" />
          </div>
          <div>
            <Label>Tags <span className="text-gray-400 font-normal">(VIP, Regular, Window seat…)</span></Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, Window seat" />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anniversary, prefers booth…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
