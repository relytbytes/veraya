"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Users, Loader2, Clock, LogIn, LogOut, History,
  ChevronLeft, ChevronRight, CalendarDays, Pencil, Trash2, X,
  Send, Copy, CheckCircle2, Eye, EyeOff,
  MessageSquare, GraduationCap, ChevronDown, ChevronUp, AlertTriangle, Sparkles,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { STAFF_NOTE_TYPES, STAFF_NOTE_TEMPLATES, STAFF_NOTE_BADGE, type StaffNoteType } from "@/lib/staff-note-templates";
import { TimeInput } from "@/components/ui/time-input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClockEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  notes: string | null;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  hourlyRate: number | null;
  employmentType: string;
  annualSalary: number | null;
  clockEntries?: ClockEntry[];
}

interface Shift {
  id: string;
  userId: string;
  date: string;         // YYYY-MM-DD
  startTime: string;    // HH:MM
  endTime: string;      // HH:MM
  position: string | null;
  notes: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  user: { id: string; name: string; role: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  "ADMIN", "MANAGER",
  "SERVER", "HOST", "BARTENDER", "BARBACK", "SERVER_ASSISTANT", "FOOD_RUNNER", "CASHIER",
  "KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP", "KITCHEN_DISH",
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin", MANAGER: "Manager",
  SERVER: "Server", HOST: "Host", BARTENDER: "Bartender", BARBACK: "Barback",
  SERVER_ASSISTANT: "Srvr Asst", FOOD_RUNNER: "Food Runner", CASHIER: "Cashier",
  KITCHEN: "Kitchen", KITCHEN_LINE: "Kitchen Line", KITCHEN_PREP: "Kitchen Prep",
  KITCHEN_DISH: "Dishwasher",
};

const ROLE_COLORS: Record<string, "default" | "secondary" | "success" | "warning" | "destructive"> = {
  ADMIN: "destructive", MANAGER: "warning",
  SERVER: "default", HOST: "default", BARTENDER: "default",
  BARBACK: "secondary", SERVER_ASSISTANT: "default", FOOD_RUNNER: "default", CASHIER: "secondary",
  KITCHEN: "success", KITCHEN_LINE: "success", KITCHEN_PREP: "success", KITCHEN_DISH: "success",
};

const SHIFT_COLORS: Record<string, string> = {
  ADMIN:            "bg-red-100 text-red-800 border-red-200",
  MANAGER:          "bg-amber-100 text-amber-800 border-amber-200",
  SERVER:           "bg-blue-100 text-blue-800 border-blue-200",
  HOST:             "bg-indigo-100 text-indigo-800 border-indigo-200",
  BARTENDER:        "bg-cyan-100 text-cyan-800 border-cyan-200",
  BARBACK:          "bg-sky-100 text-sky-800 border-sky-200",
  SERVER_ASSISTANT: "bg-blue-50 text-blue-700 border-blue-100",
  FOOD_RUNNER:      "bg-teal-100 text-teal-800 border-teal-200",
  CASHIER:          "bg-purple-100 text-purple-800 border-purple-200",
  KITCHEN:          "bg-green-100 text-green-800 border-green-200",
  KITCHEN_LINE:     "bg-green-100 text-green-800 border-green-200",
  KITCHEN_PREP:     "bg-lime-100 text-lime-800 border-lime-200",
  KITCHEN_DISH:     "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const AVATAR_COLORS: Record<string, string> = {
  ADMIN:            "bg-red-100 text-red-700",
  MANAGER:          "bg-amber-100 text-amber-700",
  SERVER:           "bg-blue-100 text-blue-700",
  HOST:             "bg-indigo-100 text-indigo-700",
  BARTENDER:        "bg-cyan-100 text-cyan-700",
  BARBACK:          "bg-sky-100 text-sky-700",
  SERVER_ASSISTANT: "bg-blue-50 text-blue-600",
  FOOD_RUNNER:      "bg-teal-100 text-teal-700",
  CASHIER:          "bg-purple-100 text-purple-700",
  KITCHEN:          "bg-green-100 text-green-700",
  KITCHEN_LINE:     "bg-green-100 text-green-700",
  KITCHEN_PREP:     "bg-lime-100 text-lime-700",
  KITCHEN_DISH:     "bg-emerald-100 text-emerald-700",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const POSITIONS = ["Floor", "Bar", "Kitchen", "Host", "Takeout", "Manager on Duty"];

const EMPTY_FORM = { name: "", email: "", password: "", role: "SERVER", hourlyRate: "", employmentType: "HOURLY", annualSalary: "" };
const EMPTY_SHIFT = { userId: "", date: "", startTime: "09:00", endTime: "17:00", position: "", notes: "" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(start: string, end: string | null) {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const diff = Math.floor((e.getTime() - s.getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatHHMM(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Return Monday of the week containing `date` */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDayHeader(date: Date): { short: string; num: string; full: string } {
  return {
    short: DAY_NAMES[date.getDay()],
    num: String(date.getDate()),
    full: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
  };
}

function shiftHours(s: Shift): number {
  const [sh, sm] = s.startTime.split(":").map(Number);
  const [eh, em] = s.endTime.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const [tab, setTab] = useState<"roster" | "schedule" | "notes" | "training">("roster");

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [historyMember, setHistoryMember] = useState<StaffMember | null>(null);
  const [clockEntries, setClockEntries] = useState<ClockEntry[]>([]);
  const [clockEntriesLoading, setClockEntriesLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [clocking, setClocking] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  // Edit staff
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "SERVER", hourlyRate: "", isActive: true, employmentType: "HOURLY", annualSalary: "", managerPin: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Schedule
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftDialog, setShiftDialog] = useState<{
    open: boolean;
    mode: "add" | "edit";
    shift?: Shift;
    prefillDate?: string;
    prefillUser?: string;
  }>({ open: false, mode: "add" });
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [copyScheduleOpen, setCopyScheduleOpen] = useState(false);

  // Labor forecast
  const [projectedSales, setProjectedSales] = useState<string>("");
  const [forecast, setForecast] = useState<{ projectedWeeklyTotal: number; weeksOfData: number; confidence: string } | null>(null);

  useEffect(() => { loadStaff(); }, []);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    const ws = toDateStr(weekStart);
    const res = await fetch(`/api/shifts?weekStart=${ws}`);
    if (!res.ok) { setShiftsLoading(false); return; }
    const data = await res.json();
    setShifts(data);
    setShiftsLoading(false);
  }, [weekStart]);

  useEffect(() => {
    if (tab === "schedule") loadShifts();
  }, [tab, loadShifts]);

  // Fetch sales forecast when on schedule tab
  useEffect(() => {
    if (tab !== "schedule") return;
    const mon = toDateStr(weekDays[0]); // Monday of current displayed week
    fetch(`/api/sales/forecast?weekStart=${mon}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setForecast(d); })
      .catch(() => {});
  // weekDays is derived from weekStart, so depend on weekStart
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, weekStart]);

  async function loadStaff() {
    setLoading(true);
    const res = await fetch("/api/staff");
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setStaff(data);
    setLoading(false);
  }

  async function saveStaff() {
    setSaving(true);
    setFormError("");
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
        annualSalary: form.annualSalary ? Number(form.annualSalary) : null,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setFormError(data.error ?? "Failed to create staff member");
    } else {
      setAddDialogOpen(false);
      loadStaff();
    }
    setSaving(false);
  }

  function openEditMember(member: StaffMember) {
    setEditMember(member);
    setEditForm({
      name: member.name,
      role: member.role,
      hourlyRate: member.hourlyRate != null ? String(member.hourlyRate) : "",
      isActive: member.isActive,
      employmentType: member.employmentType ?? "HOURLY",
      annualSalary: member.annualSalary != null ? String(member.annualSalary) : "",
      managerPin: "",
    });
    setEditError("");
  }

  async function saveEditMember() {
    if (!editMember) return;
    setEditSaving(true);
    setEditError("");
    const res = await fetch(`/api/staff/${editMember.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        role: editForm.role,
        isActive: editForm.isActive,
        hourlyRate: editForm.hourlyRate ? Number(editForm.hourlyRate) : null,
        employmentType: editForm.employmentType,
        annualSalary: editForm.annualSalary ? Number(editForm.annualSalary) : null,
        // Only send when a new PIN was typed; blank leaves it unchanged.
        ...(editForm.managerPin.trim() ? { managerPin: editForm.managerPin.trim() } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setEditError(data.error ?? "Failed to save");
    } else {
      setEditMember(null);
      loadStaff();
    }
    setEditSaving(false);
  }

  async function clockToggle(memberId: string) {
    setClocking(memberId);
    await fetch(`/api/staff/${memberId}/clock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setClocking(null);
    loadStaff();
  }

  async function openHistory(member: StaffMember) {
    setHistoryMember(member);
    setClockEntriesLoading(true);
    const res = await fetch(`/api/staff/${member.id}/clock`);
    setClockEntries(await res.json());
    setClockEntriesLoading(false);
  }

  // ── Schedule helpers ──────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function openAddShift(date: string, userId?: string) {
    setShiftForm({ ...EMPTY_SHIFT, date, userId: userId ?? "" });
    setShiftError("");
    setShiftDialog({ open: true, mode: "add", prefillDate: date, prefillUser: userId });
  }

  function openEditShift(shift: Shift) {
    setShiftForm({
      userId: shift.userId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      position: shift.position ?? "",
      notes: shift.notes ?? "",
    });
    setShiftError("");
    setShiftDialog({ open: true, mode: "edit", shift });
  }

  async function saveShift() {
    setShiftSaving(true);
    setShiftError("");
    const payload = {
      userId: shiftForm.userId,
      date: shiftForm.date,
      startTime: shiftForm.startTime,
      endTime: shiftForm.endTime,
      position: shiftForm.position || null,
      notes: shiftForm.notes || null,
    };

    let res: Response;
    if (shiftDialog.mode === "edit" && shiftDialog.shift) {
      res = await fetch(`/api/shifts/${shiftDialog.shift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const data = await res.json();
      setShiftError(data.error ?? "Failed to save shift");
    } else {
      setShiftDialog({ open: false, mode: "add" });
      loadShifts();
    }
    setShiftSaving(false);
  }

  async function deleteShift(id: string) {
    await fetch(`/api/shifts/${id}`, { method: "DELETE" });
    loadShifts();
  }

  const weekIsPublished = shifts.length > 0 && shifts.every((s) => s.isPublished);
  const weekIsPartiallyPublished = shifts.some((s) => s.isPublished) && !weekIsPublished;

  async function publishWeek(action: "publish" | "unpublish") {
    setPublishing(true);
    const ws = toDateStr(weekStart);
    await fetch(`/api/shifts?weekStart=${ws}&action=${action}`, { method: "PATCH" });
    await loadShifts();
    setPublishing(false);
  }

  const [autoScheduling, setAutoScheduling] = useState(false);
  async function autoSchedule() {
    if (!confirm("Auto-fill empty days this week with draft shifts based on forecast and staff? You can edit before publishing.")) return;
    setAutoScheduling(true);
    try {
      const res = await fetch("/api/shifts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: toDateStr(weekStart) }),
      });
      const data = await res.json();
      await loadShifts();
      if (!res.ok) { alert(data.error ?? "Could not auto-schedule"); return; }
      const parts = [`Added ${data.created} draft shift${data.created === 1 ? "" : "s"}.`];
      if (data.skippedDays) parts.push(`${data.skippedDays} day${data.skippedDays === 1 ? "" : "s"} already had shifts (left alone).`);
      if (data.shortfalls?.length) parts.push(`${data.shortfalls.length} slot${data.shortfalls.length === 1 ? "" : "s"} couldn't be filled — not enough staff in those roles.`);
      if (!data.hasHistory) parts.push("No sales history yet, so a baseline crew was scheduled.");
      alert(parts.join("\n"));
    } finally {
      setAutoScheduling(false);
    }
  }

  function buildScheduleText(): string {
    const ws = toDateStr(weekStart);
    const we = toDateStr(addDays(weekStart, 6));
    const lines: string[] = [
      `📅 SCHEDULE: ${ws} – ${we}`,
      "─".repeat(40),
    ];
    for (const day of weekDays) {
      const ds = toDateStr(day);
      const dayShifts = shifts.filter((s) => s.date === ds);
      if (dayShifts.length === 0) continue;
      lines.push(`\n${day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`);
      for (const s of dayShifts.sort((a, b) => a.startTime.localeCompare(b.startTime))) {
        const pos = s.position ? ` [${s.position}]` : "";
        lines.push(`  ${formatHHMM(s.startTime)}–${formatHHMM(s.endTime)}  ${s.user.name}${pos}`);
      }
    }
    lines.push("\n─".repeat(40));
    return lines.join("\n");
  }

  // Shifts keyed by "userId|date"
  function shiftsFor(userId: string, dateStr: string): Shift[] {
    return shifts.filter((s) => s.userId === userId && s.date === dateStr);
  }

  // Total scheduled hours for a staff member this week
  function weeklyHours(userId: string): number {
    return shifts.filter((s) => s.userId === userId).reduce((acc, s) => acc + shiftHours(s), 0);
  }

  const today = toDateStr(new Date());
  const activeStaff = staff.filter((s) => s.isActive);

  // Labor forecast calculations
  const totalScheduledHours = activeStaff.reduce((acc, m) => acc + weeklyHours(m.id), 0);
  const totalLaborCost = activeStaff.reduce((acc, m) => {
    const rate = m.hourlyRate ? Number(m.hourlyRate) : 0;
    return acc + weeklyHours(m.id) * rate;
  }, 0);
  const staffWithRates = activeStaff.filter((m) => m.hourlyRate != null).length;
  const projectedSalesNum = projectedSales ? Number(projectedSales.replace(/[^0-9.]/g, "")) : 0;
  const laborPct = projectedSalesNum > 0 ? (totalLaborCost / projectedSalesNum) * 100 : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Staff"
        description={`${activeStaff.length} active staff members`}
        actions={
          tab === "roster" ? (
            <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setFormError(""); setAddDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> Add Staff
            </Button>
          ) : tab === "schedule" ? (
            <Button size="sm" onClick={() => openAddShift(today)}>
              <Plus className="h-4 w-4" /> Add Shift
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        {([
          ["roster", "Roster", <Users key="r" className="h-3.5 w-3.5" />],
          ["schedule", "Schedule", <CalendarDays key="s" className="h-3.5 w-3.5" />],
          ["notes", "Notes", <MessageSquare key="n" className="h-3.5 w-3.5" />],
          ["training", "Training", <GraduationCap key="t" className="h-3.5 w-3.5" />],
        ] as ["roster" | "schedule" | "notes" | "training", string, React.ReactNode][]).map(([t, label, icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "pb-3 mr-6 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors",
              tab === t
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── ROSTER TAB ─────────────────────────────────────────────────────── */}
      {tab === "roster" && (
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : staff.length === 0 ? (
            <div className="py-24 text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No staff members yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {staff.map((member) => (
                <Card key={member.id} className="overflow-hidden">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0", AVATAR_COLORS[member.role] ?? "bg-gray-100 text-gray-700")}>
                        {member.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                        <p className="text-sm text-gray-400 truncate">{member.email}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge variant={ROLE_COLORS[member.role] ?? "secondary"}>
                        {member.role}
                      </Badge>
                      {!member.isActive && <Badge variant="secondary">Inactive</Badge>}
                      {member.employmentType === "SALARY" && member.annualSalary != null ? (
                        <span className="text-xs text-gray-400 ml-auto">${Number(member.annualSalary).toLocaleString()}/yr</span>
                      ) : member.hourlyRate != null ? (
                        <span className="text-xs text-gray-400 ml-auto">${Number(member.hourlyRate).toFixed(2)}/hr</span>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs"
                        disabled={clocking === member.id}
                        onClick={() => clockToggle(member.id)}
                      >
                        {clocking === member.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <><Clock className="h-3.5 w-3.5" /> Clock In/Out</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-gray-500"
                        onClick={() => openHistory(member)}
                      >
                        <History className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-gray-500"
                        onClick={() => openEditMember(member)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SCHEDULE TAB ───────────────────────────────────────────────────── */}
      {tab === "schedule" && (
        <div className="p-6 space-y-4">
          {/* Week navigation */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700 min-w-[180px] text-center">
                {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                {" – "}
                {weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-gray-500"
                onClick={() => setWeekStart(getWeekStart(new Date()))}
              >
                This week
              </Button>
            </div>

            {/* Publish controls */}
            <div className="flex items-center gap-2">
              {/* Publish status badge */}
              {shifts.length > 0 && (
                <span className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border",
                  weekIsPublished
                    ? "bg-green-50 text-green-700 border-green-200"
                    : weekIsPartiallyPublished
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-gray-50 text-gray-500 border-gray-200"
                )}>
                  {weekIsPublished ? (
                    <><CheckCircle2 className="h-3 w-3" /> Published</>
                  ) : weekIsPartiallyPublished ? (
                    <><Eye className="h-3 w-3" /> Partial</>
                  ) : (
                    <><EyeOff className="h-3 w-3" /> Draft</>
                  )}
                </span>
              )}

              {/* Copy schedule */}
              {shifts.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => setCopyScheduleOpen(true)}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy Schedule
                </Button>
              )}

              {/* Auto-schedule (#13) — fill empty days from forecast + staff */}
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-teal-200 text-teal-700 hover:bg-teal-50"
                disabled={autoScheduling}
                onClick={autoSchedule}
                title="Forecast staffing need per daypart and assign available staff to empty days"
              >
                {autoScheduling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Auto-schedule
              </Button>

              {/* Publish / Unpublish */}
              {shifts.length > 0 && (
                weekIsPublished ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                    disabled={publishing}
                    onClick={() => publishWeek("unpublish")}
                  >
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="text-xs bg-green-600 hover:bg-green-700 text-white"
                    disabled={publishing}
                    onClick={() => publishWeek("publish")}
                  >
                    {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {weekIsPartiallyPublished ? "Publish All" : "Publish Week"}
                  </Button>
                )
              )}
            </div>
          </div>

          {/* OT Warning Banner */}
          {(() => {
            const otStaff = activeStaff.filter((m) => weeklyHours(m.id) >= 40);
            const warnStaff = activeStaff.filter((m) => weeklyHours(m.id) >= 35 && weeklyHours(m.id) < 40);
            if (otStaff.length === 0 && warnStaff.length === 0) return null;
            return (
              <div className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                otStaff.length > 0 ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
              )}>
                <AlertTriangle className={cn("h-4 w-4 shrink-0 mt-0.5", otStaff.length > 0 ? "text-red-600" : "text-amber-600")} />
                <div>
                  <p className={cn("text-sm font-semibold", otStaff.length > 0 ? "text-red-800" : "text-amber-800")}>
                    {otStaff.length > 0 ? "Overtime Projected" : "Approaching Overtime"}
                  </p>
                  <p className={cn("text-xs mt-0.5", otStaff.length > 0 ? "text-red-700" : "text-amber-700")}>
                    {[...otStaff.map((m) => `${m.name.split(" ")[0]} (${weeklyHours(m.id).toFixed(1)}h OT)`),
                      ...warnStaff.map((m) => `${m.name.split(" ")[0]} (${weeklyHours(m.id).toFixed(1)}h)`)
                    ].join(" · ")}
                  </p>
                </div>
              </div>
            );
          })()}

          {shiftsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : activeStaff.length === 0 ? (
            <div className="py-24 text-center text-gray-400">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Add staff members first</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white">
              <table className="w-full min-w-[700px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {/* Staff column header */}
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-36 sticky left-0 bg-gray-50 z-10">
                      Staff
                    </th>
                    {weekDays.map((day) => {
                      const dateStr = toDateStr(day);
                      const isToday = dateStr === today;
                      const hdr = formatDayHeader(day);
                      return (
                        <th
                          key={dateStr}
                          className={cn(
                            "px-2 py-3 font-medium text-center w-[calc((100%-9rem)/7)]",
                            isToday ? "text-amber-600" : "text-gray-500"
                          )}
                        >
                          <div className={cn("text-xs", isToday && "font-bold")}>{hdr.short}</div>
                          <div className={cn(
                            "text-base font-semibold mt-0.5 h-7 w-7 rounded-full mx-auto flex items-center justify-center",
                            isToday ? "bg-amber-500 text-white" : "text-gray-800"
                          )}>
                            {hdr.num}
                          </div>
                        </th>
                      );
                    })}
                    <th className="text-center px-2 py-3 font-medium text-gray-500 text-xs w-16">Hrs</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member, rowIdx) => (
                    <tr
                      key={member.id}
                      className={cn(
                        "border-b border-gray-100 last:border-0",
                        rowIdx % 2 === 1 && "bg-gray-50/40"
                      )}
                    >
                      {/* Staff name cell */}
                      <td className={cn(
                        "px-4 py-3 sticky left-0 z-10",
                        rowIdx % 2 === 1 ? "bg-gray-50/40" : "bg-white"
                      )}>
                        <div className="flex items-center gap-2">
                          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs shrink-0", AVATAR_COLORS[member.role] ?? "bg-gray-100 text-gray-700")}>
                            {member.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-xs truncate">{member.name.split(" ")[0]}</p>
                            <p className="text-[10px] text-gray-400 truncate">{member.role}</p>
                          </div>
                        </div>
                      </td>

                      {/* Day cells */}
                      {weekDays.map((day) => {
                        const dateStr = toDateStr(day);
                        const dayShifts = shiftsFor(member.id, dateStr);
                        const isToday = dateStr === today;
                        return (
                          <td
                            key={dateStr}
                            className={cn(
                              "px-1.5 py-1.5 align-top",
                              isToday && "bg-amber-50/40"
                            )}
                          >
                            <div className="space-y-1 min-h-[40px]">
                              {dayShifts.map((shift) => (
                                <ShiftBlock
                                  key={shift.id}
                                  shift={shift}
                                  memberRole={member.role}
                                  onEdit={() => openEditShift(shift)}
                                  onDelete={() => deleteShift(shift.id)}
                                />
                              ))}
                              {/* Add shift button */}
                              <button
                                onClick={() => openAddShift(dateStr, member.id)}
                                className="w-full h-6 rounded border border-dashed border-gray-200 text-gray-300 hover:border-amber-300 hover:text-amber-400 transition-colors flex items-center justify-center"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        );
                      })}

                      {/* Weekly hours */}
                      <td className="px-2 py-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={cn(
                            "text-xs font-semibold",
                            weeklyHours(member.id) >= 40 ? "text-red-500" :
                            weeklyHours(member.id) >= 35 ? "text-amber-500" : "text-gray-600"
                          )}>
                            {weeklyHours(member.id).toFixed(1)}h
                          </span>
                          {weeklyHours(member.id) >= 40 && (
                            <span className="text-[9px] font-bold bg-red-500 text-white px-1 py-0 rounded leading-4">OT</span>
                          )}
                          {weeklyHours(member.id) >= 35 && weeklyHours(member.id) < 40 && (
                            <span className="text-[9px] font-bold bg-amber-400 text-white px-1 py-0 rounded leading-4">35h</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-1">
            {Object.entries(SHIFT_COLORS).map(([role, cls]) => (
              <div key={role} className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium", cls)}>
                {role}
              </div>
            ))}
          </div>

          {/* ── LABOR FORECAST ────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <span className="text-base">📊</span> Labor Forecast
            </h3>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{totalScheduledHours.toFixed(1)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Scheduled hrs</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {staffWithRates > 0 ? `$${totalLaborCost.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Est. labor cost</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                <p className={cn(
                  "text-2xl font-bold",
                  laborPct == null ? "text-gray-400"
                    : laborPct < 25 ? "text-green-600"
                    : laborPct < 35 ? "text-amber-600"
                    : "text-red-600"
                )}>
                  {laborPct != null ? `${laborPct.toFixed(1)}%` : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Labor %</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-center">
                <p className={cn(
                  "text-sm font-semibold mt-1",
                  laborPct == null ? "text-gray-400"
                    : laborPct < 25 ? "text-green-600"
                    : laborPct < 35 ? "text-amber-600"
                    : "text-red-600"
                )}>
                  {laborPct == null ? "—"
                    : laborPct < 25 ? "✓ Excellent"
                    : laborPct < 30 ? "✓ On target"
                    : laborPct < 35 ? "⚠ Watch"
                    : "✗ Over budget"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Status</p>
              </div>
            </div>

            {/* Projected sales input */}
            <div className="space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Label className="text-sm text-gray-600 shrink-0">Projected weekly sales</Label>
                <div className="relative flex-1 max-w-[180px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input
                    className="pl-6 text-sm"
                    placeholder="0.00"
                    value={projectedSales}
                    onChange={(e) => setProjectedSales(e.target.value)}
                  />
                </div>
                {forecast && forecast.confidence !== "none" && (
                  <button
                    type="button"
                    onClick={() => setProjectedSales(forecast.projectedWeeklyTotal.toFixed(2))}
                    className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md px-2.5 py-1.5 hover:bg-blue-100 transition-colors"
                  >
                    <span>📈</span>
                    <span>Use forecast: {formatCurrency(forecast.projectedWeeklyTotal)}</span>
                    <span className="text-blue-400">({forecast.weeksOfData}wk avg)</span>
                  </button>
                )}
                {staffWithRates < activeStaff.length && (
                  <p className="text-xs text-gray-400">
                    {activeStaff.length - staffWithRates} staff missing hourly rate
                  </p>
                )}
              </div>
              {forecast && forecast.confidence !== "none" && (
                <p className="text-xs text-gray-400">
                  Forecast based on {forecast.weeksOfData} week{forecast.weeksOfData !== 1 ? "s" : ""} of historical sales —{" "}
                  <span className={forecast.confidence === "high" ? "text-green-600" : forecast.confidence === "medium" ? "text-amber-600" : "text-orange-500"}>
                    {forecast.confidence} confidence
                  </span>
                </p>
              )}
            </div>

            {/* Labor % benchmark guide */}
            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="font-medium">Industry benchmarks:</span>
              <span className="text-green-600">Below 25% — excellent</span>
              <span className="text-amber-600">25–35% — acceptable</span>
              <span className="text-red-600">Above 35% — over budget</span>
            </div>
          </div>
        </div>
      )}

      {/* ── NOTES TAB ─────────────────────────────────────────────────────── */}
      {tab === "notes" && (
        <NotesTab staff={activeStaff} />
      )}

      {/* ── TRAINING TAB ──────────────────────────────────────────────────── */}
      {tab === "training" && (
        <TrainingTab staff={activeStaff} />
      )}

      {/* ── ADD STAFF DIALOG ───────────────────────────────────────────────── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input placeholder="Jane Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input type="email" placeholder="jane@restaurant.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                  <SelectItem value="SALARY">Salaried</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.employmentType === "HOURLY" ? (
              <div className="space-y-1.5">
                <Label>Hourly Rate <span className="text-gray-400 text-xs">(for labor forecasting)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-6"
                    value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Annual Salary <span className="text-gray-400 text-xs">(used in P&L labor cost)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input type="number" step="1" min="0" placeholder="60000" className="pl-6"
                    value={form.annualSalary} onChange={(e) => setForm({ ...form, annualSalary: e.target.value })} />
                </div>
              </div>
            )}
            {formError && <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{formError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveStaff} disabled={saving || !form.name || !form.email || !form.password}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── EDIT STAFF DIALOG ──────────────────────────────────────────────── */}
      <Dialog open={!!editMember} onOpenChange={(o) => { if (!o) setEditMember(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-amber-500" />
              Edit {editMember?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={editForm.employmentType} onValueChange={(v) => setEditForm({ ...editForm, employmentType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                  <SelectItem value="SALARY">Salaried</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editForm.employmentType === "HOURLY" ? (
              <div className="space-y-1.5">
                <Label>Hourly Rate <span className="text-gray-400 text-xs">(for labor forecasting)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input type="number" step="0.01" min="0" placeholder="0.00" className="pl-6"
                    value={editForm.hourlyRate} onChange={(e) => setEditForm({ ...editForm, hourlyRate: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Annual Salary <span className="text-gray-400 text-xs">(used in P&L labor cost)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <Input type="number" step="1" min="0" placeholder="60000" className="pl-6"
                    value={editForm.annualSalary} onChange={(e) => setEditForm({ ...editForm, annualSalary: e.target.value })} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-isActive"
                checked={editForm.isActive}
                onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="edit-isActive">Active</Label>
            </div>
            {(editForm.role === "ADMIN" || editForm.role === "MANAGER") && (
              <div className="space-y-1.5">
                <Label>Manager Override PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Leave blank to keep current"
                  value={editForm.managerPin}
                  onChange={(e) => setEditForm({ ...editForm, managerPin: e.target.value })}
                />
                <p className="text-xs text-gray-400">4 to 6 digits. Used to authorize comps and voids at the POS.</p>
              </div>
            )}
            {editError && <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={saveEditMember} disabled={editSaving || !editForm.name}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CLOCK HISTORY DIALOG ───────────────────────────────────────────── */}
      <Dialog open={!!historyMember} onOpenChange={(open) => { if (!open) setHistoryMember(null); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              {historyMember?.name} — Time Log
            </DialogTitle>
          </DialogHeader>
          {clockEntriesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : clockEntries.length === 0 ? (
            <p className="text-center text-gray-400 py-6 text-sm">No clock entries yet</p>
          ) : (
            <div className="space-y-2">
              {clockEntries.map((entry) => {
                const isOpen = !entry.clockOut;
                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border",
                      isOpen ? "border-green-200 bg-green-50" : "border-gray-100"
                    )}
                  >
                    {isOpen ? (
                      <LogIn className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <LogOut className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(entry.clockIn).toLocaleDateString()}
                        <span className="text-gray-500 font-normal ml-1">
                          {formatTime(entry.clockIn)} → {entry.clockOut ? formatTime(entry.clockOut) : "Now"}
                        </span>
                      </p>
                      {entry.notes && <p className="text-xs text-gray-400 truncate">{entry.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-700">
                        {formatDuration(entry.clockIn, entry.clockOut)}
                      </p>
                      {isOpen && <Badge variant="success" className="text-xs">Active</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryMember(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── COPY SCHEDULE DIALOG ──────────────────────────────────────────── */}
      <Dialog open={copyScheduleOpen} onOpenChange={setCopyScheduleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-4 w-4 text-amber-500" />
              Copy Schedule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Copy the text below to share with your team via text, email, or group chat.</p>
            <textarea
              readOnly
              className="w-full h-56 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 resize-none focus:outline-none"
              value={buildScheduleText()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyScheduleOpen(false)}>Close</Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(buildScheduleText()).catch(() => {});
                setCopyScheduleOpen(false);
              }}
            >
              <Copy className="h-4 w-4" /> Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SHIFT DIALOG (add / edit) ──────────────────────────────────────── */}
      <Dialog
        open={shiftDialog.open}
        onOpenChange={(o) => { if (!o) setShiftDialog({ open: false, mode: "add" }); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-amber-500" />
              {shiftDialog.mode === "edit" ? "Edit Shift" : "Add Shift"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Staff member */}
            <div className="space-y-1.5">
              <Label>Staff Member *</Label>
              <Select
                value={shiftForm.userId}
                onValueChange={(v) => setShiftForm({ ...shiftForm, userId: v })}
              >
                <SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input
                type="date"
                value={shiftForm.date}
                onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })}
              />
            </div>

            {/* Start / End time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 pb-1">
                <Label>Start Time *</Label>
                <TimeInput
                  value={shiftForm.startTime}
                  onChange={(v) => setShiftForm({ ...shiftForm, startTime: v })}
                />
              </div>
              <div className="space-y-1.5 pb-1">
                <Label>End Time *</Label>
                <TimeInput
                  value={shiftForm.endTime}
                  onChange={(v) => setShiftForm({ ...shiftForm, endTime: v })}
                />
              </div>
            </div>

            {/* Position */}
            <div className="space-y-1.5">
              <Label>Position <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Select
                value={shiftForm.position || "__none__"}
                onValueChange={(v) => setShiftForm({ ...shiftForm, position: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="e.g. Floor, Bar…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {POSITIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Cover for Tue shift"
                value={shiftForm.notes}
                onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
              />
            </div>

            {shiftError && (
              <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{shiftError}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            {shiftDialog.mode === "edit" && shiftDialog.shift && (
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  await deleteShift(shiftDialog.shift!.id);
                  setShiftDialog({ open: false, mode: "add" });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setShiftDialog({ open: false, mode: "add" })}>
              Cancel
            </Button>
            <Button
              onClick={saveShift}
              disabled={shiftSaving || !shiftForm.userId || !shiftForm.date || !shiftForm.startTime || !shiftForm.endTime}
            >
              {shiftSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {shiftDialog.mode === "edit" ? "Save" : "Add Shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

interface StaffNote {
  id: string;
  userId: string;
  authorId: string;
  type?: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
  user: { id: string; name: string };
}

function NotesTab({ staff }: { staff: StaffMember[] }) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [notes, setNotes] = useState<StaffNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<StaffNoteType>("GENERAL");
  const [savingNote, setSavingNote] = useState(false);

  // Switching to a report type seeds its template (only if the box is empty or
  // still holds another template, so we never clobber typed text).
  function pickType(t: StaffNoteType) {
    setNoteType(t);
    const isTemplate = noteBody.trim() === "" || Object.values(STAFF_NOTE_TEMPLATES).some((tpl) => tpl && noteBody.trim() === tpl.trim());
    if (isTemplate) setNoteBody(STAFF_NOTE_TEMPLATES[t]);
  }

  const loadNotes = useCallback(async (userId: string) => {
    if (!userId) return;
    setNotesLoading(true);
    const res = await fetch(`/api/staff-notes?userId=${userId}`);
    if (res.ok) setNotes(await res.json());
    setNotesLoading(false);
  }, []);

  useEffect(() => {
    if (selectedUserId) loadNotes(selectedUserId);
    else setNotes([]);
  }, [selectedUserId, loadNotes]);

  async function saveNote() {
    if (!selectedUserId || !noteBody.trim()) return;
    setSavingNote(true);
    const res = await fetch("/api/staff-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, body: noteBody.trim(), type: noteType }),
    });
    if (res.ok) {
      setNoteBody("");
      setNoteType("GENERAL");
      loadNotes(selectedUserId);
    }
    setSavingNote(false);
  }

  async function deleteNote(id: string) {
    await fetch(`/api/staff-notes/${id}`, { method: "DELETE" });
    loadNotes(selectedUserId);
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      {/* Staff selector */}
      <div className="space-y-1.5">
        <Label>Select Staff Member</Label>
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue placeholder="Choose a staff member…" />
          </SelectTrigger>
          <SelectContent>
            {staff.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.name} — {m.role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add note */}
      {selectedUserId && (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
          <Label>Add Note</Label>
          {/* Report type — seeds a structured template for the record (#14) */}
          <div className="flex flex-wrap gap-1.5">
            {STAFF_NOTE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => pickType(t.value)}
                title={t.hint}
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full border transition-colors",
                  noteType === t.value ? STAFF_NOTE_BADGE[t.value].cls : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Write a note about this staff member…"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
          />
          {noteType !== "GENERAL" && <p className="text-[11px] text-gray-400">{STAFF_NOTE_TYPES.find((t) => t.value === noteType)?.hint}</p>}
          <Button
            size="sm"
            onClick={saveNote}
            disabled={savingNote || !noteBody.trim()}
          >
            {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save Note
          </Button>
        </div>
      )}

      {/* Notes list */}
      {selectedUserId && (
        notesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : notes.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">No notes yet for this staff member</p>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {note.type && note.type !== "GENERAL" && (
                      <span className={cn("inline-block mb-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", STAFF_NOTE_BADGE[note.type as StaffNoteType]?.cls)}>
                        {STAFF_NOTE_BADGE[note.type as StaffNoteType]?.label}
                      </span>
                    )}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {note.author.name} · {timeAgo(note.createdAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-400 hover:text-red-600 shrink-0"
                    onClick={() => deleteNote(note.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Training Tab ─────────────────────────────────────────────────────────────

interface TrainingTemplate {
  id: string;
  name: string;
  role: string | null;
  isActive: boolean;
  items: TrainingItem[];
}

interface TrainingItem {
  id: string;
  templateId: string;
  title: string;
  description: string | null;
  sortOrder: number;
}

interface TrainingSignoff {
  id: string;
  assignmentId: string;
  itemId: string;
  signedOffBy: string;
  signedOffAt: string;
  notes: string | null;
  manager: { id: string; name: string };
}

interface TrainingAssignment {
  id: string;
  userId: string;
  templateId: string;
  assignedBy: string;
  assignedAt: string;
  dueDate: string | null;
  user: { id: string; name: string; role: string };
  assigner: { id: string; name: string };
  template: TrainingTemplate;
  signoffs: TrainingSignoff[];
}

function TrainingTab({ staff }: { staff: StaffMember[] }) {
  const [subTab, setSubTab] = useState<"checklists" | "assignments">("checklists");

  // Templates state
  const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateRole, setNewTemplateRole] = useState("__all__");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  // Assignments state
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);
  const [signingOff, setSigningOff] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    const res = await fetch("/api/training/templates");
    if (res.ok) setTemplates(await res.json());
    setTemplatesLoading(false);
  }, []);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    const res = await fetch("/api/training/assignments");
    if (res.ok) setAssignments(await res.json());
    setAssignmentsLoading(false);
  }, []);

  useEffect(() => {
    if (subTab === "checklists") loadTemplates();
    else loadAssignments();
  }, [subTab, loadTemplates, loadAssignments]);

  async function createTemplate() {
    if (!newTemplateName.trim()) return;
    setSavingTemplate(true);
    const res = await fetch("/api/training/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTemplateName.trim(),
        role: newTemplateRole === "__all__" ? null : newTemplateRole,
      }),
    });
    if (res.ok) {
      setNewTemplateName("");
      setNewTemplateRole("__all__");
      loadTemplates();
    }
    setSavingTemplate(false);
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/training/templates/${id}`, { method: "DELETE" });
    loadTemplates();
  }

  async function addItem(templateId: string) {
    if (!newItemTitle.trim()) return;
    setAddingItem(true);
    const res = await fetch("/api/training/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, title: newItemTitle.trim() }),
    });
    if (res.ok) {
      setNewItemTitle("");
      loadTemplates();
    }
    setAddingItem(false);
  }

  async function deleteItem(id: string) {
    await fetch(`/api/training/items/${id}`, { method: "DELETE" });
    loadTemplates();
  }

  async function createAssignment() {
    if (!assignUserId || !assignTemplateId) return;
    setSavingAssignment(true);
    const res = await fetch("/api/training/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: assignUserId,
        templateId: assignTemplateId,
        dueDate: assignDueDate || null,
      }),
    });
    if (res.ok) {
      setAssignUserId("");
      setAssignTemplateId("");
      setAssignDueDate("");
      loadAssignments();
    }
    setSavingAssignment(false);
  }

  async function signOffItem(assignmentId: string, itemId: string) {
    setSigningOff(itemId);
    const res = await fetch("/api/training/signoffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignmentId, itemId }),
    });
    if (res.ok) loadAssignments();
    setSigningOff(null);
  }

  async function undoSignoff(signoffId: string) {
    await fetch(`/api/training/signoffs/${signoffId}`, { method: "DELETE" });
    loadAssignments();
  }

  const ROLES_ALL = ["__all__", "ADMIN", "MANAGER", "SERVER", "HOST", "BARTENDER", "BARBACK", "SERVER_ASSISTANT", "FOOD_RUNNER", "CASHIER", "KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP", "KITCHEN_DISH"];

  return (
    <div className="p-6 space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-4 border-b border-gray-100 pb-0">
        {(["checklists", "assignments"] as const).map((st) => (
          <button
            key={st}
            onClick={() => setSubTab(st)}
            className={cn(
              "pb-2.5 text-sm font-medium border-b-2 capitalize transition-colors",
              subTab === st
                ? "border-amber-400 text-amber-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            )}
          >
            {st}
          </button>
        ))}
      </div>

      {/* ── CHECKLISTS ─────────────────────────────────────────────────────── */}
      {subTab === "checklists" && (
        <div className="space-y-4 max-w-2xl">
          {/* Create template */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="font-medium text-sm text-gray-700">New Checklist Template</p>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="Template name…"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                className="flex-1 min-w-[160px]"
              />
              <Select value={newTemplateRole} onValueChange={setNewTemplateRole}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES_ALL.map((r) => (
                    <SelectItem key={r} value={r}>{r === "__all__" ? "All Roles" : r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={createTemplate} disabled={savingTemplate || !newTemplateName.trim()}>
                {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </Button>
            </div>
          </div>

          {/* Templates list */}
          {templatesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : templates.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No templates yet</p>
          ) : (
            <div className="space-y-2">
              {templates.map((tmpl) => (
                <div key={tmpl.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedTemplate(expandedTemplate === tmpl.id ? null : tmpl.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedTemplate === tmpl.id
                          ? <ChevronUp className="h-4 w-4" />
                          : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <p className="font-medium text-gray-900">{tmpl.name}</p>
                      {tmpl.role && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{tmpl.role}</span>
                      )}
                      <span className="text-xs text-gray-400">{tmpl.items.length} item{tmpl.items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-gray-400 hover:text-red-600"
                      onClick={() => deleteTemplate(tmpl.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {expandedTemplate === tmpl.id && (
                    <div className="border-t border-gray-100 px-4 pb-3 space-y-2">
                      {tmpl.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                          <p className="text-sm text-gray-700">{item.title}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-300 hover:text-red-600 h-6 w-6 p-0"
                            onClick={() => deleteItem(item.id)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Input
                          placeholder="Add checklist item…"
                          value={expandedTemplate === tmpl.id ? newItemTitle : ""}
                          onChange={(e) => setNewItemTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addItem(tmpl.id);
                          }}
                          className="flex-1 h-8 text-sm"
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => addItem(tmpl.id)}
                          disabled={addingItem || !newItemTitle.trim()}
                        >
                          {addingItem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS ─────────────────────────────────────────────────────── */}
      {subTab === "assignments" && (
        <div className="space-y-4 max-w-2xl">
          {/* Create assignment */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="font-medium text-sm text-gray-700">Assign Training Checklist</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger><SelectValue placeholder="Staff member…" /></SelectTrigger>
                <SelectContent>
                  {staff.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignTemplateId} onValueChange={setAssignTemplateId}>
                <SelectTrigger><SelectValue placeholder="Template…" /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                placeholder="Due date (optional)"
                value={assignDueDate}
                onChange={(e) => setAssignDueDate(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              onClick={createAssignment}
              disabled={savingAssignment || !assignUserId || !assignTemplateId}
            >
              {savingAssignment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Assign
            </Button>
          </div>

          {/* Assignments list */}
          {assignmentsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : assignments.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">No assignments yet</p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => {
                const totalItems = assignment.template.items.length;
                const signedOff = assignment.signoffs.length;
                const pct = totalItems > 0 ? Math.round((signedOff / totalItems) * 100) : 0;
                const isComplete = signedOff === totalItems && totalItems > 0;
                const isExpanded = expandedAssignment === assignment.id;

                return (
                  <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedAssignment(isExpanded ? null : assignment.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button className="text-gray-400 hover:text-gray-600 shrink-0">
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900">{assignment.user.name}</p>
                            <span className="text-gray-400 text-xs">→</span>
                            <p className="text-sm text-gray-600">{assignment.template.name}</p>
                            {isComplete && (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="h-3 w-3" /> Complete
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", isComplete ? "bg-green-500" : "bg-amber-400")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">{signedOff}/{totalItems}</span>
                            {assignment.dueDate && (
                              <span className="text-xs text-gray-400">
                                Due {new Date(assignment.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-3 space-y-1">
                        {assignment.template.items.map((item) => {
                          const signoff = assignment.signoffs.find((s) => s.itemId === item.id);
                          return (
                            <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                              <div className="flex items-center gap-2">
                                {signoff ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-200 shrink-0" />
                                )}
                                <span className={cn("text-sm", signoff ? "text-gray-400 line-through" : "text-gray-700")}>
                                  {item.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {signoff ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs text-gray-400">{signoff.manager.name}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-xs text-gray-400 hover:text-red-600 px-1"
                                      onClick={() => undoSignoff(signoff.id)}
                                    >
                                      Undo
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs px-2"
                                    disabled={signingOff === item.id}
                                    onClick={() => signOffItem(assignment.id, item.id)}
                                  >
                                    {signingOff === item.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Sign Off"
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ShiftBlock ───────────────────────────────────────────────────────────────

function ShiftBlock({
  shift,
  memberRole,
  onEdit,
  onDelete,
}: {
  shift: Shift;
  memberRole: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const colorCls = SHIFT_COLORS[memberRole] ?? "bg-gray-100 text-gray-700 border-gray-200";
  const hours = shiftHours(shift);

  return (
    <div
      className={cn(
        "group relative rounded border px-1.5 py-1 text-[10px] leading-tight cursor-pointer hover:brightness-95 transition-all",
        colorCls,
        shift.isPublished && "ring-1 ring-green-400/60"
      )}
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-0.5">
        <p className="font-semibold">{formatHHMM(shift.startTime)}–{formatHHMM(shift.endTime)}</p>
        {shift.isPublished && (
          <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0 mt-px" />
        )}
      </div>
      {shift.position && <p className="opacity-70 truncate">{shift.position}</p>}
      <p className="opacity-50">{hours.toFixed(1)}h</p>
      {/* Quick delete on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-0.5 right-0.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-black/10 hover:bg-black/20"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

import React from "react";
