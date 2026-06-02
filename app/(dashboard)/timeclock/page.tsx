"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, Loader2, LogIn, LogOut, Pencil } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClockEditRecord {
  id: string;
  reason: string;
  createdAt: string;
  editedBy: { name: string | null } | null;
}

interface ClockEntry {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  notes: string | null;
  createdAt: string;
  edits?: ClockEditRecord[];
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  hourlyRate: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700 border-red-200",
  MANAGER: "bg-amber-100 text-amber-700 border-amber-200",
  SERVER: "bg-blue-100 text-blue-700 border-blue-200",
  KITCHEN: "bg-green-100 text-green-700 border-green-200",
  CASHIER: "bg-purple-100 text-purple-700 border-purple-200",
};

const AVATAR_COLORS: Record<string, string> = {
  ADMIN: "bg-red-100 text-red-700",
  MANAGER: "bg-amber-100 text-amber-700",
  SERVER: "bg-blue-100 text-blue-700",
  KITCHEN: "bg-green-100 text-green-700",
  CASHIER: "bg-purple-100 text-purple-700",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(startIso: string): { h: number; m: number; s: number } {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  return {
    h: Math.floor(diff / 3600),
    m: Math.floor((diff % 3600) / 60),
    s: diff % 60,
  };
}

function formatElapsed(startIso: string): string {
  const { h, m, s } = elapsed(startIso);
  return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
}

function formatDuration(start: string, end: string | null): string {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const diff = Math.max(0, Math.floor((e.getTime() - s.getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatShortElapsed(startIso: string): string {
  return formatDuration(startIso, null);
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ISO -> value for <input type="datetime-local"> (local wall-clock, no seconds).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimeClockPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  // Punch editing (manager/admin only)
  const [editEntry, setEditEntry] = useState<ClockEntry | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [myEntries, setMyEntries] = useState<ClockEntry[]>([]);
  const [staffClock, setStaffClock] = useState<Record<string, ClockEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const [clocking, setClocking] = useState(false);
  const [notes, setNotes] = useState("");
  const [tick, setTick] = useState(0);

  // Resolve current user from next-auth session endpoint
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        const id = s?.user?.id as string | undefined;
        if (id) setCurrentUserId(id);
        if (s?.user?.role) setRole(String(s.user.role));
      })
      .catch(() => {});
  }, []);

  // Live clock tick every second
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadAll = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const [staffRes, myClockRes] = await Promise.all([
        fetch("/api/staff"),
        fetch(`/api/staff/${currentUserId}/clock`),
      ]);
      if (staffRes.ok) {
        const staffData: StaffMember[] = await staffRes.json();
        setStaff(staffData);

        // Fetch clock entries for all staff members in parallel (to show who's in)
        const others = staffData.filter((m) => m.id !== currentUserId);
        const clockResults = await Promise.all(
          others.map(async (m) => {
            const res = await fetch(`/api/staff/${m.id}/clock`);
            if (!res.ok) return { id: m.id, entry: null };
            const entries: ClockEntry[] = await res.json();
            const open = entries.find((e) => e.clockOut === null) ?? null;
            return { id: m.id, entry: open };
          })
        );
        const clockMap: Record<string, ClockEntry | null> = {};
        for (const r of clockResults) clockMap[r.id] = r.entry;
        setStaffClock(clockMap);
      }
      if (myClockRes.ok) {
        const entries: ClockEntry[] = await myClockRes.json();
        setMyEntries(entries);
      }
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) loadAll();
  }, [currentUserId, loadAll]);

  // Current user's open entry
  const myOpenEntry = myEntries.find((e) => e.clockOut === null) ?? null;
  const isClockedIn = myOpenEntry !== null;

  async function handleClockAction() {
    if (!currentUserId) return;
    setClocking(true);
    try {
      await fetch(`/api/staff/${currentUserId}/clock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notes.trim() ? { notes: notes.trim() } : {}),
      });
      setNotes("");
      await loadAll();
    } finally {
      setClocking(false);
    }
  }

  const isManager = role === "ADMIN" || role === "MANAGER";

  function openEdit(entry: ClockEntry) {
    setEditEntry(entry);
    setEditIn(toLocalInput(entry.clockIn));
    setEditOut(toLocalInput(entry.clockOut));
    setEditReason("");
    setEditError("");
  }

  async function saveEdit() {
    if (!editEntry) return;
    if (!editReason.trim()) { setEditError("A reason is required."); return; }
    if (!editIn) { setEditError("Clock-in time is required."); return; }
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`/api/timeclock/${editEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clockIn: new Date(editIn).toISOString(),
          clockOut: editOut ? new Date(editOut).toISOString() : null,
          reason: editReason.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not save the edit.");
      }
      setEditEntry(null);
      await loadAll();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setEditSaving(false);
    }
  }

  const me = staff.find((m) => m.id === currentUserId);
  const activeStaff = staff.filter((m) => m.isActive);

  // ── Loading states ──────────────────────────────────────────────────────────

  if (status === "loading" || loading) {
    return (
      <div>
        <Header title="Time Clock" description="Track your shift" />
        <div className="flex justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!currentUserId) {
    return (
      <div>
        <Header title="Time Clock" />
        <div className="p-6 text-center text-gray-400 py-24">
          <p>Sign in to use the time clock.</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Time Clock"
        description={me ? `${me.name} · ${me.role}` : "Track your shift"}
      />

      <div className="p-6 space-y-6 max-w-5xl mx-auto">

        {/* ── Section 1: My Status ──────────────────────────────────────────── */}
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">

              {/* Status indicator */}
              <div className="flex items-center gap-4 flex-1">
                <div className="relative shrink-0">
                  {isClockedIn ? (
                    <>
                      <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                        <Clock className="h-7 w-7 text-green-600" />
                      </div>
                      {/* Pulsing ring */}
                      <span className="absolute inset-0 rounded-full animate-ping bg-green-400 opacity-20" />
                    </>
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
                      <Clock className="h-7 w-7 text-gray-400" />
                    </div>
                  )}
                </div>

                <div>
                  {isClockedIn ? (
                    <>
                      <p className="text-lg font-bold text-green-700">Clocked In</p>
                      {/* tick dependency forces re-render each second */}
                      <p className="text-2xl font-mono font-semibold text-gray-900 mt-0.5 tabular-nums" suppressHydrationWarning>
                        {tick >= 0 && myOpenEntry ? formatElapsed(myOpenEntry.clockIn) : "0h 0m 00s"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Since {formatTime(myOpenEntry!.clockIn)} · {formatDate(myOpenEntry!.clockIn)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-gray-500">Not Clocked In</p>
                      <p className="text-sm text-gray-400 mt-0.5">Start your shift when you&apos;re ready</p>
                    </>
                  )}
                </div>
              </div>

              {/* Action area */}
              <div className="flex flex-col gap-3 sm:min-w-[220px]">
                {!isClockedIn && (
                  <Input
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleClockAction(); }}
                    className="text-sm"
                  />
                )}
                <Button
                  size="lg"
                  className={cn(
                    "w-full font-semibold text-base gap-2",
                    isClockedIn
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  )}
                  onClick={handleClockAction}
                  disabled={clocking}
                >
                  {clocking ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : isClockedIn ? (
                    <><LogOut className="h-5 w-5" /> Clock Out</>
                  ) : (
                    <><LogIn className="h-5 w-5" /> Clock In</>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Who's In ───────────────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Who&apos;s In Today
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {activeStaff.map((member) => {
              const isMe = member.id === currentUserId;
              const openEntry = isMe
                ? myOpenEntry
                : (staffClock[member.id] ?? null);
              const clockedIn = openEntry !== null;

              return (
                <Card
                  key={member.id}
                  className={cn(
                    "overflow-hidden transition-shadow",
                    clockedIn && "ring-1 ring-green-300"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full flex items-center justify-center font-semibold text-xs shrink-0",
                          AVATAR_COLORS[member.role] ?? "bg-gray-100 text-gray-700"
                        )}
                      >
                        {initials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                        <span
                          className={cn(
                            "inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border",
                            ROLE_COLORS[member.role] ?? "bg-gray-50 text-gray-500 border-gray-200"
                          )}
                        >
                          {member.role}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          clockedIn ? "bg-green-500" : "bg-gray-300"
                        )}
                      />
                      {clockedIn && openEntry ? (
                        <span className="text-xs text-green-700 font-medium tabular-nums" suppressHydrationWarning>
                          {/* tick forces re-render */}
                          {tick >= 0 ? `In — ${formatShortElapsed(openEntry.clockIn)}` : "In"}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Off</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ── Section 3: My Recent Entries ─────────────────────────────────── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            My Recent Entries
          </h2>

          {myEntries.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-400">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No clock entries yet</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Date</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Time In</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Time Out</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Duration</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide hidden sm:table-cell">Notes</th>
                    {isManager && <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide text-right">Edit</th>}
                  </tr>
                </thead>
                <tbody>
                  {myEntries.slice(0, 14).map((entry, i) => {
                    const isActive = entry.clockOut === null;
                    return (
                      <tr
                        key={entry.id}
                        className={cn(
                          "border-b border-gray-100 last:border-0",
                          i % 2 === 1 && "bg-gray-50/50",
                          isActive && "bg-green-50/60"
                        )}
                      >
                        <td className="px-4 py-3 text-gray-700 font-medium whitespace-nowrap">
                          {formatDate(entry.clockIn)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap">
                          {formatTime(entry.clockIn)}
                        </td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          {isActive ? (
                            <Badge variant="success" className="text-xs">Active</Badge>
                          ) : (
                            <span className="text-gray-600">{formatTime(entry.clockOut!)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 tabular-nums whitespace-nowrap" suppressHydrationWarning>
                          {isActive
                            ? (tick >= 0 ? formatDuration(entry.clockIn, null) : "—")
                            : formatDuration(entry.clockIn, entry.clockOut)}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell max-w-[200px] truncate">
                          {entry.edits && entry.edits.length > 0 && (
                            <span
                              className="mr-1.5 inline-flex items-center rounded-full bg-warning-100 px-1.5 py-0.5 text-[10px] font-medium text-warning-800 align-middle"
                              title={`Edited by ${entry.edits[0].editedBy?.name ?? "manager"}: ${entry.edits[0].reason}`}
                            >
                              Edited
                            </span>
                          )}
                          {entry.notes ?? "—"}
                        </td>
                        {isManager && (
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openEdit(entry)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Edit Punch Dialog (manager/admin) ─────────────────────────────── */}
      <Dialog open={editEntry !== null} onOpenChange={(o) => { if (!o) setEditEntry(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Punch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Clock In</Label>
              <Input type="datetime-local" value={editIn} onChange={(e) => setEditIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Clock Out</Label>
              <Input type="datetime-local" value={editOut} onChange={(e) => setEditOut(e.target.value)} />
              <p className="text-xs text-gray-400">Leave blank if the shift is still open.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for edit <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. forgot to clock out, fixing a mis-punch"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
              />
              <p className="text-xs text-gray-400">Required. Recorded in the audit trail with your name.</p>
            </div>
            {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={editSaving || !editReason.trim()}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin" />} Save Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
