"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, Loader2, Plus, Trash2, Clock, Ban } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "breakfast" | "lunch" | "dinner";

interface DayConfig {
  open: string;
  close: string;
  periods: Period[];
  enabled: boolean;
}

interface ReservationHours {
  monday: DayConfig;
  tuesday: DayConfig;
  wednesday: DayConfig;
  thursday: DayConfig;
  friday: DayConfig;
  saturday: DayConfig;
  sunday: DayConfig;
  slotInterval: number;
  maxPartySize: number;
  bufferMins: number;
}

interface TableBlock {
  id: string;
  tableIds: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  allDay: boolean;
}

interface TableRow {
  id: string;
  number: number;
  capacity: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type DayKey = (typeof DAYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const PERIOD_LABELS: Record<Period, string> = {
  breakfast: "Breakfast (05:00–11:29)",
  lunch: "Lunch (11:30–15:59)",
  dinner: "Dinner (16:00–23:59)",
};

const DEFAULT_DAY: DayConfig = {
  open: "11:00",
  close: "22:00",
  periods: ["lunch", "dinner"],
  enabled: true,
};

const DEFAULT_HOURS: ReservationHours = {
  monday: { ...DEFAULT_DAY },
  tuesday: { ...DEFAULT_DAY },
  wednesday: { ...DEFAULT_DAY },
  thursday: { ...DEFAULT_DAY },
  friday: { ...DEFAULT_DAY },
  saturday: { ...DEFAULT_DAY },
  sunday: { ...DEFAULT_DAY, open: "10:00", periods: ["breakfast", "lunch", "dinner"] },
  slotInterval: 30,
  maxPartySize: 10,
  bufferMins: 30,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function HoursSettingsPage() {
  // Reservation hours state
  const [hours, setHours] = useState<ReservationHours>(DEFAULT_HOURS);
  const [pacing, setPacing] = useState(0); // max covers per slot; 0 = unlimited
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  // Table blocks state
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [blockDialog, setBlockDialog] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockForm, setBlockForm] = useState<{
    tableIds: string[];
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    reason: string;
    allDay: boolean;
  }>({
    tableIds: [],
    startDate: "",
    endDate: "",
    startTime: "12:00",
    endTime: "15:00",
    reason: "",
    allDay: false,
  });

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const data = await res.json();

    if (data.reservationHours) {
      try {
        const parsed = JSON.parse(data.reservationHours) as ReservationHours;
        setHours(parsed);
      } catch {
        // keep defaults
      }
    }
    if (data.tableBlocks) {
      try {
        const parsed = JSON.parse(data.tableBlocks) as TableBlock[];
        setBlocks(parsed);
      } catch {
        // keep empty
      }
    }
    if (data.reservationPacing) {
      try {
        const p = JSON.parse(data.reservationPacing) as { maxCoversPerSlot?: number };
        setPacing(p.maxCoversPerSlot ?? 0);
      } catch {
        // keep default
      }
    }
  }, []);

  const loadTables = useCallback(async () => {
    const res = await fetch("/api/tables");
    if (res.ok) {
      const data = await res.json();
      // tables endpoint returns full table objects; we only need id/number/capacity
      setTables(
        (data as TableRow[]).map((t) => ({
          id: t.id,
          number: t.number,
          capacity: t.capacity,
        }))
      );
    }
  }, []);

  useEffect(() => {
    loadSettings();
    loadTables();
  }, [loadSettings, loadTables]);

  // ── Hours helpers ────────────────────────────────────────────────────────────

  function updateDay(day: DayKey, patch: Partial<DayConfig>) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
  }

  function togglePeriod(day: DayKey, period: Period) {
    const current = hours[day].periods;
    const next = current.includes(period)
      ? current.filter((p) => p !== period)
      : [...current, period];
    updateDay(day, { periods: next });
  }

  async function saveHours() {
    setHoursSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationHours: JSON.stringify(hours),
          reservationPacing: JSON.stringify({ maxCoversPerSlot: pacing > 0 ? pacing : null }),
        }),
      });
      if (res.ok) {
        setHoursSaved(true);
        setTimeout(() => setHoursSaved(false), 2000);
      } else {
        toast.error("Failed to save hours. Please try again.");
      }
    } catch {
      toast.error("Network error — hours not saved.");
    } finally {
      setHoursSaving(false);
    }
  }

  // ── Block helpers ────────────────────────────────────────────────────────────

  function openAddBlock() {
    const today = new Date().toISOString().slice(0, 10);
    setBlockForm({
      tableIds: [],
      startDate: today,
      endDate: today,
      startTime: "12:00",
      endTime: "15:00",
      reason: "",
      allDay: false,
    });
    setBlockDialog(true);
  }

  async function saveBlock() {
    if (blockForm.tableIds.length === 0 || !blockForm.startDate || !blockForm.endDate || !blockForm.reason) return;
    setBlockSaving(true);
    const newBlock: TableBlock = {
      id: crypto.randomUUID(),
      tableIds: blockForm.tableIds,
      startDate: blockForm.startDate,
      endDate: blockForm.endDate,
      startTime: blockForm.allDay ? "00:00" : blockForm.startTime,
      endTime: blockForm.allDay ? "23:59" : blockForm.endTime,
      reason: blockForm.reason,
      allDay: blockForm.allDay,
    };
    const updated = [...blocks, newBlock];
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableBlocks: JSON.stringify(updated) }),
      });
      if (res.ok) {
        setBlocks(updated);
        setBlockDialog(false);
      } else {
        toast.error("Failed to save block. Please try again.");
      }
    } catch {
      toast.error("Network error — block not saved.");
    } finally {
      setBlockSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    if (!(await confirmDialog("Remove this table block?"))) return;
    const updated = blocks.filter((b) => b.id !== id);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableBlocks: JSON.stringify(updated) }),
      });
      if (res.ok) {
        setBlocks(updated);
      } else {
        toast.error("Failed to remove block. Please try again.");
      }
    } catch {
      toast.error("Network error — block not removed.");
    }
  }

  function toggleBlockTable(tableId: string) {
    setBlockForm((prev) => ({
      ...prev,
      tableIds: prev.tableIds.includes(tableId)
        ? prev.tableIds.filter((id) => id !== tableId)
        : [...prev.tableIds, tableId],
    }));
  }

  function tableLabel(tableId: string) {
    const t = tables.find((t) => t.id === tableId);
    return t ? `Table ${t.number}` : tableId;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Reservation Availability"
        description="Configure operating hours, service periods, and table blocks"
      />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* ── Global slot settings ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-500" />
              Slot Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Slot Interval (minutes)</Label>
                <select
                  className="flex h-9 w-full items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  value={hours.slotInterval}
                  onChange={(e) =>
                    setHours((prev) => ({ ...prev, slotInterval: Number(e.target.value) }))
                  }
                >
                  {[15, 30, 45, 60].map((v) => (
                    <option key={v} value={v}>
                      {v} min
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Max Party Size</Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={hours.maxPartySize}
                  onChange={(e) =>
                    setHours((prev) => ({ ...prev, maxPartySize: Number(e.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Buffer Before Close (min)</Label>
                <Input
                  type="number"
                  min="0"
                  max="120"
                  value={hours.bufferMins}
                  onChange={(e) =>
                    setHours((prev) => ({ ...prev, bufferMins: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-gray-400">No reservations accepted this many minutes before close</p>
              </div>
              <div className="space-y-1.5">
                <Label>Max Covers / Slot <span className="text-gray-400 font-normal">(0 = no limit)</span></Label>
                <Input
                  type="number"
                  min="0"
                  max="500"
                  value={pacing}
                  onChange={(e) => setPacing(Number(e.target.value))}
                />
                <p className="text-xs text-gray-400">Caps total guests booked in any overlapping window (pacing)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Per-day hours ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Operating Hours &amp; Service Periods</CardTitle>
            <p className="text-xs text-gray-500 -mt-1">
              Set open/close times and which meal periods accept reservations each day.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {DAYS.map((day) => {
              const cfg = hours[day];
              return (
                <div
                  key={day}
                  className={`rounded-lg border p-4 transition-colors ${
                    cfg.enabled ? "border-gray-200 bg-white" : "border-gray-100 bg-gray-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-4 flex-wrap">
                    {/* Enable toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none min-w-[110px]">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) => updateDay(day, { enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 accent-amber-500"
                      />
                      <span className="text-sm font-medium text-gray-800">{DAY_LABELS[day]}</span>
                    </label>

                    {/* Open / Close times */}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-500 whitespace-nowrap">Open</Label>
                      <Input
                        type="time"
                        value={cfg.open}
                        disabled={!cfg.enabled}
                        onChange={(e) => updateDay(day, { open: e.target.value })}
                        className="w-[120px] h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-500 whitespace-nowrap">Close</Label>
                      <Input
                        type="time"
                        value={cfg.close}
                        disabled={!cfg.enabled}
                        onChange={(e) => updateDay(day, { close: e.target.value })}
                        className="w-[120px] h-8 text-sm"
                      />
                    </div>

                    {/* Period checkboxes */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {(["breakfast", "lunch", "dinner"] as Period[]).map((p) => (
                        <label
                          key={p}
                          className={`flex items-center gap-1.5 cursor-pointer select-none text-xs ${
                            cfg.enabled ? "text-gray-700" : "text-gray-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={cfg.periods.includes(p)}
                            disabled={!cfg.enabled}
                            onChange={() => togglePeriod(day, p)}
                            className="h-3.5 w-3.5 rounded border-gray-300 accent-amber-500"
                          />
                          <span className="capitalize">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Period hint */}
                  {cfg.enabled && cfg.periods.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {cfg.periods.map((p) => (
                        <span
                          key={p}
                          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                          {PERIOD_LABELS[p]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end pt-2">
              <Button onClick={saveHours} disabled={hoursSaving}>
                {hoursSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hoursSaved ? (
                  "✓ Saved!"
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Hours
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Table Blocks ─────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-gray-500" />
                Table Blocks
              </CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Block specific tables for private events, maintenance, or other reasons. Blocked tables cannot be reserved during the block period.
              </p>
            </div>
            <Button size="sm" onClick={openAddBlock}>
              <Plus className="h-4 w-4" />
              Add Block
            </Button>
          </CardHeader>
          <CardContent>
            {blocks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active table blocks</p>
            ) : (
              <div className="space-y-2">
                {blocks.map((block) => {
                  const tableLabels = block.tableIds.map(tableLabel).join(", ");
                  return (
                    <div
                      key={block.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50"
                    >
                      <Ban className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{block.reason}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tableLabels || "No tables"}
                          {" · "}
                          {block.startDate === block.endDate ? block.startDate : `${block.startDate} – ${block.endDate}`}
                          {" · "}
                          {block.allDay ? "All day" : `${block.startTime} – ${block.endTime}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon" aria-label="Remove block"
                        className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteBlock(block.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Add Block Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={blockDialog} onOpenChange={setBlockDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Table Block</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Table multi-select */}
            <div className="space-y-1.5">
              <Label>Tables *</Label>
              {tables.length === 0 ? (
                <p className="text-sm text-gray-400">No tables configured yet.</p>
              ) : (
                <div className="grid grid-cols-4 gap-1.5 max-h-40 overflow-y-auto rounded-md border border-gray-200 p-2">
                  {tables
                    .sort((a, b) => a.number - b.number)
                    .map((t) => {
                      const selected = blockForm.tableIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleBlockTable(t.id)}
                          className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                            selected
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Table {t.number}
                        </button>
                      );
                    })}
                </div>
              )}
              {blockForm.tableIds.length > 0 && (
                <p className="text-xs text-gray-500">
                  {blockForm.tableIds.length} table{blockForm.tableIds.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={blockForm.startDate}
                  onChange={(e) =>
                    setBlockForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={blockForm.endDate}
                  min={blockForm.startDate}
                  onChange={(e) =>
                    setBlockForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </div>

            {/* All day toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={blockForm.allDay}
                onChange={(e) =>
                  setBlockForm((prev) => ({ ...prev, allDay: e.target.checked }))
                }
                className="h-4 w-4 rounded border-gray-300 accent-amber-500"
              />
              <span className="text-sm text-gray-700">All day</span>
            </label>

            {/* Time range (hidden if allDay) */}
            {!blockForm.allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={blockForm.startTime}
                    onChange={(e) =>
                      setBlockForm((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={blockForm.endTime}
                    onChange={(e) =>
                      setBlockForm((prev) => ({ ...prev, endTime: e.target.value }))
                    }
                  />
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input
                value={blockForm.reason}
                onChange={(e) =>
                  setBlockForm((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="e.g. Private event, Maintenance, Reserved for party"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveBlock}
              disabled={
                blockSaving ||
                blockForm.tableIds.length === 0 ||
                !blockForm.startDate ||
                !blockForm.endDate ||
                !blockForm.reason
              }
            >
              {blockSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Add Block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
