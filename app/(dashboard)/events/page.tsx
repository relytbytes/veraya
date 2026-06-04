"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  Plus,
  Loader2,
  Users,
  MapPin,
  Clock,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  FileText,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import { cn, formatTime12 } from "@/lib/utils";
import { EventTicketingPanel } from "./event-ticketing";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventStatus = "INQUIRY" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

interface EventRecord {
  id: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string | null;
  guestCount: number | null;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  venue: string | null;
  status: EventStatus;
  notes: string | null;
  menuNotes: string | null;
  depositAmount: number | null;
  depositPaid: boolean;
  totalAmount: number | null;
  customerId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}


function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  EventStatus,
  { label: string; cls: string }
> = {
  INQUIRY: { label: "Inquiry", cls: "bg-gray-100 text-gray-700 border-gray-200" },
  CONFIRMED: { label: "Confirmed", cls: "bg-green-100 text-green-700 border-green-200" },
  COMPLETED: { label: "Completed", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  CANCELLED: { label: "Cancelled", cls: "bg-red-100 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: EventStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.INQUIRY;
  return (
    <Badge className={cn("border text-xs font-medium", cfg.cls)}>
      {cfg.label}
    </Badge>
  );
}

// ─── Share Link Button ────────────────────────────────────────────────────────

function ShareLinkButton({ eventId }: { eventId: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const url = `${window.location.origin}/special-events/${eventId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-green-600" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          Share Link
        </>
      )}
    </Button>
  );
}

// ─── Event Row (expandable) ───────────────────────────────────────────────────

interface EventRowProps {
  event: EventRecord;
  onRefresh: () => void;
}

function EventRow({ event, onRefresh }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    status: event.status,
    notes: event.notes ?? "",
    menuNotes: event.menuNotes ?? "",
    depositAmount: event.depositAmount?.toString() ?? "",
    depositPaid: event.depositPaid,
    totalAmount: event.totalAmount?.toString() ?? "",
    venue: event.venue ?? "",
    guestCount: event.guestCount?.toString() ?? "",
    endTime: event.endTime ?? "",
  });

  async function save() {
    setSaving(true);
    await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: edit.status,
        notes: edit.notes || null,
        menuNotes: edit.menuNotes || null,
        depositAmount: edit.depositAmount ? parseFloat(edit.depositAmount) : null,
        depositPaid: edit.depositPaid,
        totalAmount: edit.totalAmount ? parseFloat(edit.totalAmount) : null,
        venue: edit.venue || null,
        guestCount: edit.guestCount ? parseInt(edit.guestCount, 10) : null,
        endTime: edit.endTime || null,
      }),
    });
    setSaving(false);
    onRefresh();
  }

  async function deleteEvent() {
    if (!(await confirmDialog(`Delete "${event.name}"? This cannot be undone.`))) return;
    await fetch(`/api/events/${event.id}`, { method: "DELETE" });
    onRefresh();
  }

  const isPublic = event.status === "CONFIRMED";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{event.name}</span>
            <StatusBadge status={event.status} />
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(event.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTime12(event.startTime)}
              {event.endTime ? ` – ${formatTime12(event.endTime)}` : ""}
            </span>
            {event.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {event.venue}
              </span>
            )}
            {event.guestCount && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {event.guestCount} guests
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPublic && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              Public
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-200 px-5 py-5 bg-gray-50 space-y-5">
          {/* Contact info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4 text-gray-400" />
              <span>{event.contactName}</span>
            </div>
            {event.contactPhone && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4 text-gray-400" />
                <a href={`tel:${event.contactPhone}`} className="hover:underline">
                  {event.contactPhone}
                </a>
              </div>
            )}
            {event.contactEmail && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${event.contactEmail}`} className="hover:underline truncate">
                  {event.contactEmail}
                </a>
              </div>
            )}
          </div>

          {/* Editable fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Status</Label>
              <Select
                value={edit.status}
                onValueChange={(v) => setEdit((e) => ({ ...e, status: v as EventStatus }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INQUIRY">Inquiry</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Venue */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Venue</Label>
              <Input
                value={edit.venue}
                onChange={(e) => setEdit((f) => ({ ...f, venue: e.target.value }))}
                placeholder="Main dining room"
                className="h-9 text-sm"
              />
            </div>

            {/* Guest count */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Guest Count</Label>
              <Input
                type="number"
                value={edit.guestCount}
                onChange={(e) => setEdit((f) => ({ ...f, guestCount: e.target.value }))}
                placeholder="50"
                className="h-9 text-sm"
              />
            </div>

            {/* End time */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">End Time</Label>
              <Input
                type="time"
                value={edit.endTime}
                onChange={(e) => setEdit((f) => ({ ...f, endTime: e.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            {/* Deposit amount */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Deposit ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={edit.depositAmount}
                onChange={(e) => setEdit((f) => ({ ...f, depositAmount: e.target.value }))}
                placeholder="500.00"
                className="h-9 text-sm"
              />
            </div>

            {/* Total amount */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500 uppercase tracking-wide">Total ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={edit.totalAmount}
                onChange={(e) => setEdit((f) => ({ ...f, totalAmount: e.target.value }))}
                placeholder="2500.00"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Deposit paid toggle */}
          <div className="flex items-center gap-2">
            <input
              id={`deposit-${event.id}`}
              type="checkbox"
              checked={edit.depositPaid}
              onChange={(e) => setEdit((f) => ({ ...f, depositPaid: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 accent-amber-500"
            />
            <label htmlFor={`deposit-${event.id}`} className="text-sm text-gray-700 cursor-pointer">
              Deposit paid
            </label>
            {event.depositAmount && (
              <span className="text-xs text-gray-400 ml-1">
                (${Number(event.depositAmount).toFixed(2)})
              </span>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Event Notes (shown publicly)
            </Label>
            <Textarea
              value={edit.notes}
              onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Describe the event for guests…"
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          {/* Menu notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500 uppercase tracking-wide">
              Menu Notes
            </Label>
            <Textarea
              value={edit.menuNotes}
              onChange={(e) => setEdit((f) => ({ ...f, menuNotes: e.target.value }))}
              placeholder="Special menu, dietary accommodations…"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            {isPublic && <ShareLinkButton eventId={event.id} />}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto"
              onClick={deleteEvent}
            >
              Delete
            </Button>
          </div>

          {isPublic && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-green-500"
              />
              This event has a public booking page at{" "}
              <span className="font-mono">/special-events/{event.id}</span>
            </p>
          )}

          {/* Ticketing — configured inline so setup is part of editing the event */}
          <EventTicketingPanel eventId={event.id} />
          {!isPublic && (
            <p className="text-xs text-gray-400">Set <span className="font-medium">Status → Confirmed</span> and save to publish the event and start selling.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Event Dialog ──────────────────────────────────────────────────────

interface CreateEventDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EMPTY_FORM = {
  name: "",
  date: todayStr(),
  startTime: "18:00",
  endTime: "",
  guestCount: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  venue: "",
  notes: "",
  menuNotes: "",
  depositAmount: "",
  totalAmount: "",
  publish: "false",
};

function CreateEventDialog({ open, onClose, onCreated }: CreateEventDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Event name is required."); return; }
    if (!form.date) { setError("Date is required."); return; }
    if (!form.startTime) { setError("Start time is required."); return; }
    if (!form.contactName.trim()) { setError("Contact name is required."); return; }

    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime || undefined,
        guestCount: form.guestCount ? parseInt(form.guestCount, 10) : undefined,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        venue: form.venue || undefined,
        notes: form.notes || undefined,
        menuNotes: form.menuNotes || undefined,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
        totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : undefined,
        status: form.publish === "true" ? "CONFIRMED" : "INQUIRY",
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const j = await res.json() as { error?: string };
      setError(j.error ?? "Failed to create event.");
      return;
    }

    setForm(EMPTY_FORM);
    onCreated();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Event Name <span className="text-red-500">*</span></Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Wine Pairing Dinner"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Venue / Location</Label>
              <Input
                value={form.venue}
                onChange={(e) => set("venue", e.target.value)}
                placeholder="Private dining room"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time <span className="text-red-500">*</span></Label>
              <Input
                type="time"
                value={form.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input
                type="time"
                value={form.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Guest Capacity</Label>
            <Input
              type="number"
              value={form.guestCount}
              onChange={(e) => set("guestCount", e.target.value)}
              placeholder="40"
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Contact Information
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Contact Name <span className="text-red-500">*</span></Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                  placeholder="Event coordinator name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => set("contactPhone", e.target.value)}
                    placeholder="555-0100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => set("contactEmail", e.target.value)}
                    placeholder="events@restaurant.com"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Financials
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Deposit Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.depositAmount}
                  onChange={(e) => set("depositAmount", e.target.value)}
                  placeholder="500.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.totalAmount}
                  onChange={(e) => set("totalAmount", e.target.value)}
                  placeholder="2500.00"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Event Description (shown publicly)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Describe the event for guests…"
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Menu Notes</Label>
              <Textarea
                value={form.menuNotes}
                onChange={(e) => set("menuNotes", e.target.value)}
                placeholder="Special menu, dietary options…"
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.publish === "true"}
              onChange={(e) => set("publish", e.target.checked ? "true" : "false")}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
            />
            <span className="text-sm">
              <span className="font-medium text-gray-900">Show on public events page</span>
              <span className="block text-xs text-gray-500">
                Publishes this event to your public booking page so guests can see and inquire. Leave off to keep it as a private inquiry you can confirm later.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              {saving ? "Creating…" : "Create Event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | EventStatus>("upcoming");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/events");
    if (res.ok) {
      const data = await res.json() as EventRecord[];
      setEvents(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const today = todayStr();
  const filtered = events.filter((e) => {
    if (filter === "all") return true;
    if (filter === "upcoming") return e.date >= today && e.status !== "CANCELLED";
    return e.status === filter;
  });

  // Sort by date ascending
  filtered.sort((a, b) => a.date.localeCompare(b.date));

  const counts = {
    INQUIRY: events.filter((e) => e.status === "INQUIRY").length,
    CONFIRMED: events.filter((e) => e.status === "CONFIRMED").length,
    COMPLETED: events.filter((e) => e.status === "COMPLETED").length,
    CANCELLED: events.filter((e) => e.status === "CANCELLED").length,
    upcoming: events.filter((e) => e.date >= today && e.status !== "CANCELLED").length,
  };

  const headerActions = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="h-4 w-4 mr-1.5" />
      New Event
    </Button>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Events"
        description="Manage private events, tastings, and catering bookings"
        actions={headerActions}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(
            [
              { key: "INQUIRY", label: "Inquiries", icon: FileText, color: "text-gray-600" },
              { key: "CONFIRMED", label: "Confirmed", icon: CalendarDays, color: "text-green-600" },
              { key: "COMPLETED", label: "Completed", icon: Check, color: "text-blue-600" },
              { key: "CANCELLED", label: "Cancelled", icon: null, color: "text-red-600" },
            ] as const
          ).map(({ key, label, icon: Icon, color }) => (
            <div
              key={key}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-3"
            >
              {Icon && <Icon className={cn("h-5 w-5", color)} />}
              <div>
                <p className="text-2xl font-bold text-gray-900">{counts[key]}</p>
                <p className="text-xs text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
          {(
            [
              { value: "upcoming", label: `Upcoming (${counts.upcoming})` },
              { value: "all", label: "All" },
              { value: "INQUIRY", label: "Inquiries" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "COMPLETED", label: "Completed" },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "text-sm px-3 py-1.5 rounded-md font-medium transition-colors",
                filter === value
                  ? "bg-white shadow-sm text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Event list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <CalendarDays className="h-14 w-14 mb-4 opacity-30" />
            <p className="text-lg font-medium text-gray-500">No events found</p>
            <p className="text-sm mt-1">
              {filter === "upcoming"
                ? "No upcoming events. Create one to get started."
                : "Try a different filter or create a new event."}
            </p>
            <Button
              variant="outline"
              className="mt-5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Event
            </Button>
          </div>
        ) : (
          <div className="max-w-4xl space-y-2">
            {filtered.map((event) => (
              <EventRow key={event.id} event={event} onRefresh={loadEvents} />
            ))}
          </div>
        )}
      </div>

      <CreateEventDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadEvents}
      />
    </div>
  );
}
