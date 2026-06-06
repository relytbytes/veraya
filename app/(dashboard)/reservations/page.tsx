"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Users,
  Search,
  X,
  Pencil,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "RUNNING_LATE"
  | "ARRIVED"
  | "PARTIALLY_ARRIVED"
  | "SEATED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

interface Table {
  id: string;
  number: number;
  capacity: number;
  status: string;
}

interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone: string | null;
  email: string | null;
  tableId: string | null;
  notes: string | null;
  status: ReservationStatus;
  table: Table | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function dateLabel(d: Date): string {
  const t = today();
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  RUNNING_LATE: "Running Late",
  ARRIVED: "Arrived",
  PARTIALLY_ARRIVED: "Partially Arrived",
  SEATED: "Seated",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

// Color-coded status indicators (#4). Shared by the badge and the host stand.
const STATUS_CLS: Record<ReservationStatus, string> = {
  PENDING: "bg-gray-100 text-gray-700 border-gray-200",
  CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200",
  RUNNING_LATE: "bg-amber-100 text-amber-800 border-amber-200",
  ARRIVED: "bg-teal-100 text-teal-700 border-teal-200",
  PARTIALLY_ARRIVED: "bg-indigo-100 text-indigo-700 border-indigo-200",
  SEATED: "bg-green-100 text-green-700 border-green-200",
  COMPLETED: "bg-slate-100 text-slate-600 border-slate-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
  NO_SHOW: "bg-rose-100 text-rose-700 border-rose-200",
};
// A solid dot color for compact rows.
const STATUS_DOT: Record<ReservationStatus, string> = {
  PENDING: "bg-gray-400",
  CONFIRMED: "bg-blue-500",
  RUNNING_LATE: "bg-amber-500",
  ARRIVED: "bg-teal-500",
  PARTIALLY_ARRIVED: "bg-indigo-500",
  SEATED: "bg-green-500",
  COMPLETED: "bg-slate-400",
  CANCELLED: "bg-red-500",
  NO_SHOW: "bg-rose-500",
};

function StatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <Badge className={cn("border text-xs font-medium", STATUS_CLS[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

interface GuestMatch {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string | null; notes: string | null; visitCount: number;
}

// ─── New Reservation Dialog ───────────────────────────────────────────────────

interface NewReservationDialogProps {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  tables: Table[];
  onCreated: () => void;
}

function NewReservationDialog({
  open,
  onClose,
  defaultDate,
  tables,
  onCreated,
}: NewReservationDialogProps) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    date: defaultDate,
    time: "19:00",
    partySize: "2",
    tableId: "",
    notes: "",
    customerId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Guest recognition
  const [matches, setMatches] = useState<GuestMatch[]>([]);
  const [showMatches, setShowMatches] = useState(false);
  const [linked, setLinked] = useState<GuestMatch | null>(null);

  // Search existing guests by name / phone / email as the host types the name.
  useEffect(() => {
    const q = form.name.trim();
    if (linked || q.length < 2) { setMatches([]); setShowMatches(false); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/customers?q=${encodeURIComponent(q)}`);
        if (r.ok && alive) { setMatches(await r.json()); setShowMatches(true); }
      } catch { /* ignore */ }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [form.name, linked]);

  function pickGuest(g: GuestMatch) {
    setLinked(g);
    setForm((f) => ({ ...f, name: g.name, phone: g.phone ?? f.phone, email: g.email ?? f.email, customerId: g.id }));
    setShowMatches(false);
  }
  function clearGuest() {
    setLinked(null);
    setForm((f) => ({ ...f, customerId: "" }));
  }

  // Sync default date when dialog opens
  useEffect(() => {
    if (open) setForm((f) => ({ ...f, date: defaultDate }));
  }, [open, defaultDate]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.date || !form.time || !form.partySize) {
      setError("Name, date, time, and party size are required.");
      return;
    }
    if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 7) {
      setError("A phone number is required — it's how we confirm, remind, and recognize the guest.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        date: form.date,
        time: form.time,
        partySize: parseInt(form.partySize, 10),
        tableId: form.tableId || undefined,
        notes: form.notes || undefined,
        customerId: form.customerId || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json();
      setError(j.error ?? "Failed to create reservation.");
      return;
    }
    setForm({
      name: "",
      phone: "",
      email: "",
      date: defaultDate,
      time: "19:00",
      partySize: "2",
      tableId: "",
      notes: "",
      customerId: "",
    });
    setLinked(null);
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Reservation</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="res-name">
              Guest <span className="text-red-500">*</span>
            </Label>
            {linked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">{linked.name}</span>
                      {(linked.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">{t}</span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {linked.visitCount} visit{linked.visitCount === 1 ? "" : "s"}
                      {linked.phone ? ` · ${linked.phone}` : ""}
                    </p>
                    {linked.notes && <p className="text-xs italic text-gray-500 mt-0.5 truncate">{linked.notes}</p>}
                  </div>
                  <button type="button" onClick={clearGuest} className="shrink-0 text-gray-400 hover:text-gray-700" title="Use a different guest">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="res-name"
                  className="pl-8"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Search a guest by name/phone/email, or type a new name"
                  autoComplete="off"
                />
                {showMatches && matches.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {matches.map((g) => (
                      <button key={g.id} type="button" onClick={() => pickGuest(g)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-900 truncate block">{g.name}</span>
                          <span className="text-xs text-gray-400 truncate block">{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact on file"}</span>
                        </div>
                        <span className="shrink-0 text-[11px] text-gray-400">{g.visitCount} visit{g.visitCount === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-phone">Phone *</Label>
              <Input
                id="res-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="555-0100"
                inputMode="tel"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-email">Email</Label>
              <Input
                id="res-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="guest@email.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-date">
                Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="res-date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-time">
                Time <span className="text-red-500">*</span>
              </Label>
              <Input
                id="res-time"
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-party">
                Party Size <span className="text-red-500">*</span>
              </Label>
              <Input
                id="res-party"
                type="number"
                min="1"
                max="50"
                value={form.partySize}
                onChange={(e) => set("partySize", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Table</Label>
              <Select
                value={form.tableId || "__none__"}
                onValueChange={(v) => set("tableId", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any table" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Any table</SelectItem>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Table {t.number} (cap. {t.capacity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Notes</Label>
            <Input
              id="res-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Special requests, allergies, etc."
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Reservation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Seat Dialog ──────────────────────────────────────────────────────────────

interface SeatDialogProps {
  reservation: Reservation;
  tables: Table[];
  onClose: () => void;
  onSeated: () => void;
}

function SeatDialog({ reservation, tables, onClose, onSeated }: SeatDialogProps) {
  const [tableId, setTableId] = useState(reservation.tableId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSeat() {
    setSaving(true);
    const res = await fetch(`/api/reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SEATED", tableId: tableId || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      onSeated();
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Seat {reservation.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Assign Table</Label>
            <Select value={tableId || "__none__"} onValueChange={(v) => setTableId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No table assigned —</SelectItem>
                {tables
                  .filter((t) => t.status === "AVAILABLE" || t.id === reservation.tableId)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      Table {t.number} (cap. {t.capacity}) —{" "}
                      {t.status === "AVAILABLE" ? "Available" : t.status}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSeat} disabled={saving} className="bg-green-600 hover:bg-green-500">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Seat Guest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reservation Row ──────────────────────────────────────────────────────────

interface ReservationRowProps {
  reservation: Reservation;
  tables: Table[];
  onRefresh: () => void;
  showDate?: boolean;
}

// Statuses a host can set from the dropdown (terminal/side-effecting ones —
// Seated/Cancelled/No-Show — stay as dedicated buttons).
const MARKABLE_STATUSES: ReservationStatus[] = ["PENDING", "CONFIRMED", "RUNNING_LATE", "PARTIALLY_ARRIVED", "ARRIVED"];

function EditReservationDialog({ reservation, onClose, onSaved }: {
  reservation: Reservation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: reservation.name,
    phone: reservation.phone ?? "",
    date: reservation.date,
    time: reservation.time,
    partySize: String(reservation.partySize),
    notes: reservation.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim() || !form.date || !form.time || !form.partySize) {
      setError("Name, date, time and party size are required.");
      return;
    }
    if (!form.phone.trim()) { setError("A phone number is required."); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim(),
        date: form.date,
        time: form.time,
        partySize: parseInt(form.partySize, 10),
        notes: form.notes.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Could not save changes."); return; }
    onSaved();
    onClose();
  }

  const inputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Reservation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Guest name</label>
            <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Phone</label>
            <input className={inputCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="col-span-1">
              <label className="text-xs font-medium text-gray-500">Date</label>
              <input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-gray-500">Time</label>
              <input type="time" className={inputCls} value={form.time} onChange={(e) => set("time", e.target.value)} />
            </div>
            <div className="col-span-1">
              <label className="text-xs font-medium text-gray-500">Party</label>
              <input type="number" min="1" className={inputCls} value={form.partySize} onChange={(e) => set("partySize", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Notes</label>
            <textarea className={cn(inputCls, "min-h-[60px]")} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Allergies, occasion, seating preference…" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReservationRow({ reservation, tables, onRefresh, showDate }: ReservationRowProps) {
  const [seatOpen, setSeatOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [acting, setActing] = useState(false);

  async function updateStatus(status: ReservationStatus) {
    setActing(true);
    await fetch(`/api/reservations/${reservation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setActing(false);
    onRefresh();
  }

  async function deleteReservation() {
    if (!(await confirmDialog("Delete this reservation?"))) return;
    setActing(true);
    await fetch(`/api/reservations/${reservation.id}`, { method: "DELETE" });
    setActing(false);
    onRefresh();
  }

  const isTerminal = reservation.status === "SEATED" || reservation.status === "COMPLETED" || reservation.status === "CANCELLED" || reservation.status === "NO_SHOW";
  const isActive = !isTerminal;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
        {/* Time (+ date in search results) */}
        <div className="w-20 shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
          {formatTime(reservation.time)}
          {showDate && (
            <div className="text-[11px] font-normal text-gray-400">
              {new Date(reservation.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          )}
        </div>

        {/* Guest info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 truncate">{reservation.name}</span>
            <StatusBadge status={reservation.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {reservation.partySize}
            </span>
            {reservation.table && (
              <span>Table {reservation.table.number}</span>
            )}
            {reservation.phone && <span>{reservation.phone}</span>}
            {reservation.notes && (
              <span className="truncate italic">{reservation.notes}</span>
            )}
          </div>
        </div>

        {/* Actions — wrap to a full-width second line on phones, inline on desktop */}
        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto sm:shrink-0">
          {acting && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}

          {isActive && (
            <>
              {/* Status dropdown — mark Confirmed / Running Late / Arrived, etc. */}
              <select
                value={MARKABLE_STATUSES.includes(reservation.status) ? reservation.status : ""}
                onChange={(e) => e.target.value && updateStatus(e.target.value as ReservationStatus)}
                disabled={acting}
                className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                title="Set status"
              >
                {!MARKABLE_STATUSES.includes(reservation.status) && <option value="">Status…</option>}
                {MARKABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>

              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => setSeatOpen(true)}
                disabled={acting}
              >
                Seat
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="text-gray-600 border-gray-200 hover:bg-gray-50"
                onClick={() => setEditOpen(true)}
                disabled={acting}
                title="Edit reservation"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="text-warning-600 border-warning-200 hover:bg-warning-50"
                onClick={() => updateStatus("NO_SHOW")}
                disabled={acting}
              >
                No Show
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => updateStatus("CANCELLED")}
                disabled={acting}
              >
                Cancel
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-gray-400 hover:text-red-500"
            onClick={deleteReservation}
            disabled={acting}
          >
            ×
          </Button>
        </div>
      </div>

      {seatOpen && (
        <SeatDialog
          reservation={reservation}
          tables={tables}
          onClose={() => setSeatOpen(false)}
          onSeated={onRefresh}
        />
      )}
      {editOpen && (
        <EditReservationDialog
          reservation={reservation}
          onClose={() => setEditOpen(false)}
          onSaved={onRefresh}
        />
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(today());
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Reservation[] | null>(null);
  const [searching, setSearching] = useState(false);

  const dateStr = toDateStr(selectedDate);

  // Search across all dates by guest name / phone / email.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults(null); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/reservations?q=${encodeURIComponent(term)}`);
        if (r.ok && alive) setResults(await r.json());
      } finally { if (alive) setSearching(false); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reservations?date=${dateStr}`);
    if (res.ok) setReservations(await res.json());
    setLoading(false);
  }, [dateStr]);

  const refreshResults = useCallback(async () => {
    const term = query.trim();
    if (term.length < 2) return;
    const r = await fetch(`/api/reservations?q=${encodeURIComponent(term)}`);
    if (r.ok) setResults(await r.json());
  }, [query]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  useEffect(() => {
    fetch("/api/tables")
      .then((r) => r.json())
      .then((data: Table[]) => setTables(data))
      .catch(() => {});
  }, []);

  const availableTableCount = tables.filter((t) => t.status === "AVAILABLE").length;

  const headerActions = (
    <div className="flex items-center gap-2">
      {/* Date navigation */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        <Button
          variant="ghost"
          size="icon" aria-label="Previous day"
          className="h-7 w-7"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1.5 px-2 min-w-32 justify-center">
          <CalendarDays className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900">
            {dateLabel(selectedDate)}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon" aria-label="Next day"
          className="h-7 w-7"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <span className="text-xs text-gray-500">
        {availableTableCount} table{availableTableCount !== 1 ? "s" : ""} available
      </span>

      <Button onClick={() => setNewOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" />
        New Reservation
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Reservations"
        description={`${reservations.length} reservation${reservations.length !== 1 ? "s" : ""} on ${dateLabel(selectedDate)}`}
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Guest search (name / phone / email, across all dates) */}
        <div className="max-w-3xl mx-auto mb-4 relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-9 pr-9"
            placeholder="Search reservations by guest name or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {results !== null ? (
          // ── Search results (across dates) ──
          searching && results.length === 0 ? (
            <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
          ) : results.length === 0 ? (
            <div className="max-w-3xl mx-auto py-16 text-center text-gray-400">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No reservations match &ldquo;{query}&rdquo;</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-2">
              <p className="text-xs text-gray-500 px-1">{results.length} match{results.length !== 1 ? "es" : ""} across all dates</p>
              {results.map((r) => (
                <ReservationRow key={r.id} reservation={r} tables={tables} onRefresh={refreshResults} showDate />
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <CalendarDays className="h-14 w-14 mb-4 opacity-30" />
            <p className="text-lg font-medium text-gray-500">No reservations</p>
            <p className="text-sm mt-1">
              Nothing booked for {dateLabel(selectedDate).toLowerCase()}.
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add First Reservation
            </Button>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2">
            {(() => {
              const removedStatuses = new Set(["COMPLETED", "CANCELLED", "NO_SHOW"]);
              const active = reservations.filter((r) => !removedStatuses.has(r.status));
              const removed = reservations.filter((r) => removedStatuses.has(r.status));
              return (
                <>
                  {active.map((r) => (
                    <ReservationRow key={r.id} reservation={r} tables={tables} onRefresh={loadReservations} />
                  ))}
                  {active.length === 0 && (
                    <p className="text-center text-sm text-gray-400 py-6">No active reservations — see cancelled below.</p>
                  )}
                  {removed.length > 0 && (
                    <details className="mt-4 group">
                      <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 flex items-center gap-2 py-2">
                        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                        Completed &amp; cancelled ({removed.length})
                      </summary>
                      <div className="space-y-2 mt-1 opacity-70">
                        {removed.map((r) => (
                          <ReservationRow key={r.id} reservation={r} tables={tables} onRefresh={loadReservations} />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      <NewReservationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultDate={dateStr}
        tables={tables}
        onCreated={loadReservations}
      />
    </div>
  );
}
