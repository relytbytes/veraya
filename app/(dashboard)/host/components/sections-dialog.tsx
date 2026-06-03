"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { Plus, Trash2, MousePointerClick } from "lucide-react";
import type { ServerSection, StaffMember } from "../host-utils";

const PALETTE = ["#21A090", "#C99A3B", "#7C5CBF", "#C0567E", "#3B82C9", "#4FA84F", "#D08A3E", "#C24F4F"];

export function SectionsDialog({
  open, onClose, sections, staff, activeAssignId,
  onCreate, onUpdate, onDelete, onAssignTables,
}: {
  open: boolean;
  onClose: () => void;
  sections: ServerSection[];
  staff: StaffMember[];
  activeAssignId: string | null;
  onCreate: (name: string) => Promise<void> | void;
  onUpdate: (id: string, patch: { serverId?: string | null; name?: string; color?: string }) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAssignTables: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    try { await onCreate(newName.trim()); setNewName(""); }
    finally { setCreating(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Server Sections</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-gray-500 -mt-1">
          Group tables into sections and assign a server to each. A table shows its section&apos;s server unless it has its own.
        </p>

        <div className="space-y-2.5">
          {sections.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No sections yet. Add one below.</p>
          )}
          {sections.map((s) => (
            <div key={s.id} className={cn("rounded-lg border p-3 space-y-2", activeAssignId === s.id ? "border-amber-400 bg-amber-50/40" : "border-gray-200")}>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full shrink-0 ring-1 ring-black/10" style={{ background: s.color }} />
                <Input
                  defaultValue={s.name}
                  className="h-8 font-semibold flex-1"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) onUpdate(s.id, { name: v }); }}
                />
                <button onClick={async () => { if (await confirmDialog(`Delete section "${s.name}"? Tables stay, but lose this section.`)) onDelete(s.id); }}
                  className="text-gray-400 hover:text-red-500 p-1" title="Delete section">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-14 shrink-0">Server</label>
                <select
                  value={s.serverId ?? ""}
                  onChange={(e) => onUpdate(s.id, { serverId: e.target.value || null })}
                  className="h-8 flex-1 rounded-md border border-gray-200 bg-white px-2 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => onUpdate(s.id, { color: c })}
                    className={cn("h-5 w-5 rounded-full ring-1 ring-black/10", s.color === c && "ring-2 ring-offset-1 ring-gray-800")}
                    style={{ background: c }} title={c} />
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-500">
                  {s.tables?.length
                    ? `Tables: ${s.tables.map((t) => t.number).join(", ")}`
                    : "No tables assigned"}
                </span>
                <Button size="sm" variant={activeAssignId === s.id ? "default" : "outline"} className="text-xs h-7"
                  onClick={() => onAssignTables(s.id)}>
                  <MousePointerClick className="h-3.5 w-3.5" />
                  {activeAssignId === s.id ? "Assigning…" : "Assign tables"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
          <Input
            placeholder="New section name (e.g. Patio, Bar, A)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            className="h-9"
          />
          <Button size="sm" onClick={create} disabled={creating || !newName.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
