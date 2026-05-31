"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Loader2,
  Users,
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
  | "SEATED"
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
  SEATED: "Seated",
  CANCELLED: "Cancelled",
  NO_SHOW: "No Show",
};

function StatusBadge({ status }: { status: ReservationStatus }) {
  const cls: Record<ReservationStatus, string> = {
    PENDING: "bg-gray-100 text-gray-700 border-gray-200",
    CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200",
    SEATED: "bg-green-100 text-green-700 border-green-200",
    CANCELLED: "bg-red-100 text-red-700 border-red-200",
    NO_SHOW: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <Badge className={cn("border text-xs font-medium", cls[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
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
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    });
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
              Guest Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="res-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="John Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-phone">Phone</Label>
              <Input
                id="res-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="555-0100"
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
}

function ReservationRow({ reservation, tables, onRefresh }: ReservationRowProps) {
  const [seatOpen, setSeatOpen] = useState(false);
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

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";
  const isActive = isPending || isConfirmed;

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
        {/* Time */}
        <div className="w-20 shrink-0 text-sm font-semibold text-gray-900 tabular-nums">
          {formatTime(reservation.time)}
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

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {acting && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}

          {isPending && (
            <Button
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => updateStatus("CONFIRMED")}
              disabled={acting}
            >
              Confirm
            </Button>
          )}

          {isConfirmed && (
            <>
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
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
                onClick={() => updateStatus("NO_SHOW")}
                disabled={acting}
              >
                No Show
              </Button>
            </>
          )}

          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => updateStatus("CANCELLED")}
              disabled={acting}
            >
              Cancel
            </Button>
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

  const dateStr = toDateStr(selectedDate);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/reservations?date=${dateStr}`);
    if (res.ok) setReservations(await res.json());
    setLoading(false);
  }, [dateStr]);

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
          size="icon"
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
          size="icon"
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
        {loading ? (
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
            {reservations.map((r) => (
              <ReservationRow
                key={r.id}
                reservation={r}
                tables={tables}
                onRefresh={loadReservations}
              />
            ))}
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
