"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import {
  type TableRow, type Reservation, type WaitlistEntry, type FloorObject,
  type CardPolicy, type PeriodLabel, type StaffMember, type ServerSection, SERVER_ROLES,
  toISO, stateStyle, BRAND,
} from "./host-utils";
import { SectionsDialog } from "./components/sections-dialog";
import { ReservationRail } from "./components/reservation-rail";
import { FloorCanvas, isEligibleForSeating } from "./components/floor-canvas";
import { TimelineGrid } from "./components/timeline-grid";
import { TablePanel } from "./components/table-panel";
import { toMinutes } from "./host-utils";
import { LayoutGrid, CalendarRange, Users } from "lucide-react";
import { ReservationFormDialog, type NewReservation } from "./components/reservation-form-dialog";
import { SeatWalkInDialog, type WalkInData } from "./components/seat-walkin-dialog";
import { GuestEditDialog } from "./components/guest-edit-dialog";
import type { CustomerProfile } from "./host-utils";
import { useRealtime } from "@/lib/use-realtime";
import { toast } from "@/components/ui/toast";
import { blockedTableIds, type TableBlock } from "@/lib/table-blocks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SeatMode =
  | { kind: "reservation"; reservation: Reservation }
  | { kind: "walkin"; data: WalkInData; waitlistId?: string }
  | null;

const LEGEND: { label: string; state: Parameters<typeof stateStyle>[0] }[] = [
  { label: "Open", state: "OPEN" },
  { label: "Reserved", state: "UPCOMING" },
  { label: "Seated / Apps", state: "SEATED" },
  { label: "Entrees / Dessert", state: "DINING" },
  { label: "Check", state: "CHECK" },
  { label: "Bussing", state: "BUSSING" },
];

export function HostClient() {
  const [date, setDate] = useState(toISO(new Date()));
  const [period, setPeriod] = useState<PeriodLabel>("All Day");
  const [search, setSearch] = useState("");

  const [tables, setTables] = useState<TableRow[]>([]);
  const [floorObjects, setFloorObjects] = useState<FloorObject[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [cardPolicy, setCardPolicy] = useState<CardPolicy | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [sections, setSections] = useState<ServerSection[]>([]);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [sectionMode, setSectionMode] = useState<string | null>(null); // section id accepting table taps
  const [blocks, setBlocks] = useState<TableBlock[]>([]);
  const [blockTarget, setBlockTarget] = useState<TableRow | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [seatMode, setSeatMode] = useState<SeatMode>(null);
  const [moveFromId, setMoveFromId] = useState<string | null>(null);
  const [combinePrimaryId, setCombinePrimaryId] = useState<string | null>(null);
  const [combineSet, setCombineSet] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const [newResOpen, setNewResOpen] = useState(false);
  const [savingRes, setSavingRes] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInTarget, setWalkInTarget] = useState<TableRow | null>(null);
  const [savingWalkIn, setSavingWalkIn] = useState(false);
  const [editGuest, setEditGuest] = useState<CustomerProfile | null>(null);
  const [viewMode, setViewMode] = useState<"floor" | "timeline">("floor");

  const [, setTick] = useState(0); // forces timer re-render

  // ── Data ──────────────────────────────────────────────────────────────────
  const loadAll = useCallback(async (d: string) => {
    const [tabRes, resRes, waitRes, settingsRes, staffRes, secRes] = await Promise.all([
      fetch("/api/tables"),
      fetch(`/api/reservations?date=${d}`),
      fetch("/api/waitlist"),
      fetch("/api/settings"),
      fetch("/api/staff"),
      fetch("/api/sections"),
    ]);
    if (tabRes.ok) setTables(((await tabRes.json()) as TableRow[]).sort((a, b) => a.number - b.number));
    if (resRes.ok) setReservations(await resRes.json());
    if (waitRes.ok) setWaitlist(await waitRes.json());
    if (secRes.ok) setSections(await secRes.json());
    if (staffRes.ok) {
      const all = (await staffRes.json()) as StaffMember[];
      setStaff(all.filter((s) => s.isActive && SERVER_ROLES.includes(s.role)));
    }
    if (settingsRes.ok) {
      const s: Record<string, string> = await settingsRes.json();
      if (s.floorPlanObjects) { try { setFloorObjects(JSON.parse(s.floorPlanObjects)); } catch {} }
      if (s.reservationCardPolicy) { try { setCardPolicy(JSON.parse(s.reservationCardPolicy)); } catch {} }
      if (s.tableBlocks) { try { setBlocks(JSON.parse(s.tableBlocks) as TableBlock[]); } catch {} } else { setBlocks([]); }
    }
    setLoading(false);
  }, []);

  // Persist the table-block list and refresh the floor.
  async function writeBlocks(updated: TableBlock[]) {
    setBlocks(updated);
    await api("/api/settings", { tableBlocks: JSON.stringify(updated) }, "PATCH");
  }

  async function blockTable(table: TableRow, reason: string) {
    const block: TableBlock = {
      id: (globalThis.crypto?.randomUUID?.() ?? `blk_${Date.now()}`),
      tableIds: [table.id], startDate: date, endDate: date,
      startTime: "00:00", endTime: "23:59", reason: reason.trim() || "Out of service", allDay: true,
    };
    await writeBlocks([...blocks, block]);
    toast.success(`Table ${table.number} blocked`);
  }

  async function unblockTable(table: TableRow) {
    // Drop this table from any block covering the selected date; remove empties.
    const updated = blocks
      .map((b) => (b.tableIds.includes(table.id) && date >= b.startDate && date <= b.endDate
        ? { ...b, tableIds: b.tableIds.filter((id) => id !== table.id) }
        : b))
      .filter((b) => b.tableIds.length > 0);
    await writeBlocks(updated);
    toast.success(`Table ${table.number} unblocked`);
  }

  useEffect(() => { loadAll(date); }, [date, loadAll]);
  // Live updates drive freshness; polling is just a safety net now.
  useRealtime("floor", () => loadAll(date));
  useEffect(() => {
    const poll = setInterval(() => loadAll(date), 60_000);
    const tick = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [date, loadAll]);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const choosing = !!seatMode || !!moveFromId || !!combinePrimaryId;
  const blockedIds = blockedTableIds(date, new Date().toTimeString().slice(0, 5), blocks);
  const selectedBlocked = selectedTable ? blockedIds.has(selectedTable.id) : false;

  // ── API helpers ─────────────────────────────────────────────────────────────
  async function api(url: string, body: object, method = "PATCH") {
    return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  function cancelModes() {
    setSeatMode(null);
    setMoveFromId(null);
    setCombinePrimaryId(null);
    setCombineSet([]);
    setSectionMode(null);
  }

  // ── Server sections ─────────────────────────────────────────────────────────
  async function createSection(name: string) {
    const res = await api("/api/sections", { name }, "POST");
    if (res.ok) { await loadAll(date); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Could not create section"); }
  }
  async function updateSection(id: string, patch: { serverId?: string | null; name?: string; color?: string }) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch, server: patch.serverId !== undefined ? (staff.find((u) => u.id === patch.serverId) ?? null) : s.server } : s)));
    await api(`/api/sections/${id}`, patch, "PATCH");
    await loadAll(date);
  }
  async function deleteSection(id: string) {
    await api(`/api/sections/${id}`, {}, "DELETE");
    if (sectionMode === id) setSectionMode(null);
    await loadAll(date);
  }
  function startSectionAssign(id: string) {
    cancelModes();
    setSelectedTableId(null);
    setSectionsOpen(false);
    setSectionMode(id);
  }
  async function toggleTableSection(t: TableRow) {
    if (!sectionMode) return;
    const next = t.sectionId === sectionMode ? null : sectionMode;
    setTables((prev) => prev.map((x) => (x.id === t.id ? { ...x, sectionId: next } : x)));
    await api(`/api/tables/${t.id}`, { sectionId: next });
  }

  // ── Combine / merge tables ──────────────────────────────────────────────────
  function startCombine() {
    if (!selectedTable) return;
    setCombinePrimaryId(selectedTable.id);
    setCombineSet([]);
  }
  async function confirmCombine() {
    if (!combinePrimaryId || combineSet.length === 0) { cancelModes(); return; }
    const primary = combinePrimaryId;
    setBusy(true);
    try {
      await api("/api/host/combine", { primaryTableId: primary, tableIds: combineSet }, "POST");
      cancelModes();
      await loadAll(date);
      setSelectedTableId(primary);
      toast.success(`Combined ${combineSet.length + 1} tables`);
    } finally { setBusy(false); }
  }
  async function splitCombine() {
    if (!selectedTable) return;
    setBusy(true);
    try {
      await api(`/api/host/combine?primaryTableId=${selectedTable.id}`, {}, "DELETE");
      await loadAll(date);
    } finally { setBusy(false); }
  }

  // Cover-balancing: pick the server currently carrying the fewest covers, so
  // new parties spread evenly across the floor (round-robin by load).
  function suggestServerId(): string | null {
    if (staff.length === 0) return null;
    const covers = new Map<string, number>(staff.map((s) => [s.id, 0]));
    for (const t of tables) {
      if (t.status === "OCCUPIED" && t.serverId && covers.has(t.serverId)) {
        covers.set(t.serverId, covers.get(t.serverId)! + (t.partySize ?? 0));
      }
    }
    let best: string | null = null, bestCovers = Infinity;
    for (const s of staff) {
      const c = covers.get(s.id) ?? 0;
      if (c < bestCovers) { bestCovers = c; best = s.id; }
    }
    return best;
  }

  // ── Seating ───────────────────────────────────────────────────────────────
  async function seatAtTable(table: TableRow) {
    if (!seatMode) return;
    setBusy(true);
    try {
      if (seatMode.kind === "reservation") {
        await api(`/api/reservations/${seatMode.reservation.id}`, { status: "SEATED", tableId: table.id });
      } else {
        await api(`/api/tables/${table.id}`, {
          status: "OCCUPIED",
          guestName: seatMode.data.name.trim(),
          partySize: Number(seatMode.data.partySize),
          seatedAt: new Date().toISOString(),
          serviceStage: "SEATED",
        });
        if (seatMode.waitlistId) {
          await api(`/api/waitlist/${seatMode.waitlistId}`, { status: "SEATED", tableId: table.id });
        }
      }
      // Auto-balance: assign the least-loaded server if this table has none.
      if (!table.serverId) {
        const suggested = suggestServerId();
        if (suggested) await api(`/api/tables/${table.id}`, { serverId: suggested });
      }
      cancelModes();
      await loadAll(date);
      setSelectedTableId(table.id);
    } finally { setBusy(false); }
  }

  async function moveToTable(target: TableRow) {
    if (!moveFromId) return;
    setBusy(true);
    try {
      const res = await api("/api/host/move", { fromTableId: moveFromId, toTableId: target.id }, "POST");
      cancelModes();
      await loadAll(date);
      if (res.ok) setSelectedTableId(target.id);
    } finally { setBusy(false); }
  }

  // ── Drag-and-drop: drop a reservation or a seated party onto a table ─────────
  async function handleDropOnTable(
    payload: { kind: string; id?: string; fromId?: string; partySize?: number },
    table: TableRow,
  ) {
    if (payload.kind === "reservation" && payload.id) {
      if (!isEligibleForSeating(table, payload.partySize ?? 1)) return;
      setBusy(true);
      try {
        await api(`/api/reservations/${payload.id}`, { status: "SEATED", tableId: table.id });
        if (!table.serverId) {
          const suggested = suggestServerId();
          if (suggested) await api(`/api/tables/${table.id}`, { serverId: suggested });
        }
        await loadAll(date);
        setSelectedTableId(table.id);
      } finally { setBusy(false); }
    } else if (payload.kind === "move" && payload.fromId && payload.fromId !== table.id) {
      if (!isEligibleForSeating(table, 1)) return;
      setBusy(true);
      try {
        const r = await api("/api/host/move", { fromTableId: payload.fromId, toTableId: table.id }, "POST");
        await loadAll(date);
        if (r.ok) setSelectedTableId(table.id);
      } finally { setBusy(false); }
    }
  }

  // ── Floor table click router ────────────────────────────────────────────────
  function handleTableClick(t: TableRow) {
    if (sectionMode) {
      if (!t.primaryTableId) toggleTableSection(t);
      return;
    }
    if (seatMode) {
      if (isEligibleForSeating(t, seatMode.kind === "walkin" ? Number(seatMode.data.partySize) : seatMode.reservation.partySize, tables)) {
        seatAtTable(t);
      }
      return;
    }
    if (moveFromId) {
      if (t.id !== moveFromId && isEligibleForSeating(t, 1, tables)) moveToTable(t);
      return;
    }
    if (combinePrimaryId) {
      // Toggle a free table into/out of the combination.
      if (t.id !== combinePrimaryId && !t.primaryTableId && t.status !== "OCCUPIED" && t.status !== "DIRTY") {
        setCombineSet((prev) => prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]);
      }
      return;
    }
    // A linked member opens its primary so the combo is managed in one place.
    setSelectedTableId(t.primaryTableId ?? t.id);
  }

  // ── Rail interactions ───────────────────────────────────────────────────────
  function selectReservation(r: Reservation) {
    setSelectedTableId(null);
    setMoveFromId(null);
    setSeatMode({ kind: "reservation", reservation: r });
  }

  async function quickSeatReservation(r: Reservation) {
    // If already assigned to a free table, seat directly; else enter pick-a-table mode.
    const assigned = r.tableId ? tables.find((t) => t.id === r.tableId) : null;
    if (assigned && assigned.status !== "OCCUPIED" && assigned.status !== "DIRTY") {
      setBusy(true);
      try {
        await api(`/api/reservations/${r.id}`, { status: "SEATED", tableId: assigned.id });
        await loadAll(date);
        setSelectedTableId(assigned.id);
      } finally { setBusy(false); }
    } else {
      selectReservation(r);
    }
  }

  async function notifyWaitlist(e: WaitlistEntry) {
    const res = await api(`/api/waitlist/${e.id}/notify`, {}, "POST");
    if (res.ok) {
      toast.success(`Texted ${e.name.split(" ")[0]} — table ready`);
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Could not send text");
    }
  }

  function selectWaitlist(e: WaitlistEntry) {
    setSelectedTableId(null);
    setMoveFromId(null);
    setSeatMode({
      kind: "walkin",
      data: { name: e.name, partySize: String(e.partySize), phone: e.phone ?? "", notes: e.notes ?? "" },
      waitlistId: e.id,
    });
  }

  // ── Table panel actions ─────────────────────────────────────────────────────
  async function tablePatch(body: object) {
    if (!selectedTable) return;
    const id = selectedTable.id;
    // Optimistic: reflect the change locally now; realtime/refetch reconciles.
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...(body as Partial<TableRow>) } : t)));
    setBusy(true);
    try { await api(`/api/tables/${id}`, body); await loadAll(date); }
    finally { setBusy(false); }
  }

  async function finishTable() {
    if (!selectedTable) return;
    setBusy(true);
    try {
      // Detach the seated reservation so it no longer maps to the table, then release.
      const seated = reservations.find((r) => r.tableId === selectedTable.id && r.status === "SEATED");
      if (seated) await api(`/api/reservations/${seated.id}`, { tableId: null });
      await api(`/api/tables/${selectedTable.id}?force=true`, { status: "AVAILABLE" });
      await loadAll(date);
      setSelectedTableId(null);
      toast.success(`Table ${selectedTable.number} cleared`);
    } finally { setBusy(false); }
  }

  async function seatUpcomingHere(r: Reservation) {
    setBusy(true);
    try {
      await api(`/api/reservations/${r.id}`, { status: "SEATED", tableId: r.tableId ?? selectedTable?.id });
      await loadAll(date);
    } finally { setBusy(false); }
  }

  // ── Dialog submits ──────────────────────────────────────────────────────────
  async function submitReservation(form: NewReservation) {
    if (!form.name.trim() || !form.time) return;
    setSavingRes(true);
    try {
      const res = await api("/api/reservations", {
        date, time: form.time, partySize: Number(form.partySize),
        name: form.name.trim(), phone: form.phone || undefined, notes: form.notes || undefined,
        tableId: form.tableId || undefined,
        ...(cardPolicy?.enabled ? { requiresCard: true, cardHoldAmount: cardPolicy.holdAmountCents / 100 } : {}),
      }, "POST");
      if (res.ok) { setNewResOpen(false); await loadAll(date); }
    } finally { setSavingRes(false); }
  }

  async function walkInSeat(data: WalkInData, table: TableRow | null) {
    if (table) {
      setSavingWalkIn(true);
      try {
        await api(`/api/tables/${table.id}`, {
          status: "OCCUPIED", guestName: data.name.trim(), partySize: Number(data.partySize),
          seatedAt: new Date().toISOString(), serviceStage: "SEATED",
          ...(data.customerId ? { customerId: data.customerId } : {}),
          ...(table.serverId ? {} : (() => { const s = suggestServerId(); return s ? { serverId: s } : {}; })()),
        });
        setWalkInOpen(false); setWalkInTarget(null);
        await loadAll(date);
        setSelectedTableId(table.id);
      } finally { setSavingWalkIn(false); }
    } else {
      // Enter pick-a-table mode with this walk-in.
      setWalkInOpen(false);
      setSelectedTableId(null);
      setSeatMode({ kind: "walkin", data });
    }
  }

  async function walkInWaitlist(data: WalkInData) {
    setSavingWalkIn(true);
    try {
      await api("/api/waitlist", {
        name: data.name.trim(), partySize: Number(data.partySize),
        phone: data.phone || undefined, notes: data.notes || undefined,
        customerId: data.customerId || undefined,
      }, "POST");
      setWalkInOpen(false); setWalkInTarget(null);
      await loadAll(date);
    } finally { setSavingWalkIn(false); }
  }

  function shiftDate(days: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + days);
    setDate(toISO(d));
    setSelectedTableId(null);
    cancelModes();
  }

  const availableTables = tables.filter((t) => t.status === "AVAILABLE");
  const seatPartySize = seatMode?.kind === "walkin" ? Number(seatMode.data.partySize)
    : seatMode?.kind === "reservation" ? seatMode.reservation.partySize : 1;

  // Timeline window hugs the day's reservations (1h pad before, 2h after for
  // dining duration), so dinner service isn't buried behind an empty morning.
  const resMins = reservations
    .filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
    .map((r) => toMinutes(r.time))
    .filter((m) => !Number.isNaN(m));
  const minRes = resMins.length ? Math.min(...resMins) : 17 * 60;
  const maxRes = resMins.length ? Math.max(...resMins) : 21 * 60;
  const openMin = Math.max(0, Math.floor((minRes - 60) / 60) * 60);
  const closeMin = Math.ceil((maxRes + 120) / 60) * 60;

  function onTimelineReservation(r: Reservation) {
    if (r.status === "SEATED" && r.tableId) setSelectedTableId(r.tableId);
    else selectReservation(r);
  }

  // Banner text for choosing modes
  const banner = seatMode
    ? `Seating ${seatMode.kind === "walkin" ? seatMode.data.name || "walk-in" : seatMode.reservation.name} (party of ${seatPartySize}) — tap a highlighted table`
    : moveFromId
    ? `Moving Table ${tables.find((t) => t.id === moveFromId)?.number ?? ""} — tap the destination table`
    : null;

  return (
    <div className="relative flex h-full overflow-hidden bg-[#0C1A1E]">
      <ReservationRail
        date={date} onShiftDate={shiftDate} onToday={() => { setDate(toISO(new Date())); cancelModes(); }}
        period={period} onPeriod={setPeriod}
        search={search} onSearch={setSearch}
        reservations={reservations} waitlist={waitlist} tables={tables}
        selectedReservationId={seatMode?.kind === "reservation" ? seatMode.reservation.id : null}
        onSelectReservation={selectReservation}
        onSeatReservation={quickSeatReservation}
        onSelectWaitlist={selectWaitlist}
        onNotifyWaitlist={notifyWaitlist}
        onAddReservation={() => setNewResOpen(true)}
        onSeatWalkIn={() => { setWalkInTarget(null); setWalkInOpen(true); }}
      />

      {/* Floor area */}
      <div className="relative flex-1 flex flex-col min-w-0">
        {/* Top bar: legend + mode banner */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800 bg-gray-900 shrink-0">
          {combinePrimaryId ? (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-semibold" style={{ color: BRAND.goldBright }}>
                Combining Table {tables.find((t) => t.id === combinePrimaryId)?.number} — tap free tables to add ({combineSet.length} selected)
              </span>
              <button onClick={confirmCombine} disabled={combineSet.length === 0}
                className="text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded disabled:opacity-40">
                Confirm
              </button>
              <button onClick={cancelModes} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          ) : sectionMode ? (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-semibold" style={{ color: BRAND.goldBright }}>
                Assigning to {sections.find((s) => s.id === sectionMode)?.name ?? "section"} — tap tables to add / remove
              </span>
              <button onClick={() => setSectionsOpen(true)} className="text-xs font-semibold text-gray-300 hover:text-white underline">
                Manage sections
              </button>
              <button onClick={() => setSectionMode(null)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                <X className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          ) : banner ? (
            <div className="flex items-center gap-3 flex-1">
              <span className="text-sm font-semibold" style={{ color: BRAND.goldBright }}>{banner}</span>
              <button onClick={cancelModes} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              {LEGEND.map((l) => {
                const st = stateStyle(l.state).style;
                return (
                  <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-gray-400">
                    <span className="h-3 w-3 rounded border" style={{ background: st.background, borderColor: st.borderColor }} />
                    {l.label}
                  </span>
                );
              })}
            </div>
          )}
          {(loading || busy) && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {/* Sections manager */}
          <button onClick={() => setSectionsOpen(true)} title="Server sections"
            className="ml-auto flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gray-800 text-gray-300 hover:text-white">
            <Users className="h-3.5 w-3.5" /> Sections{sections.length > 0 ? ` (${sections.length})` : ""}
          </button>
          {/* Floor / Timeline toggle */}
          <div className="flex items-center gap-0.5 rounded-lg bg-gray-800 p-0.5">
            <button onClick={() => setViewMode("floor")} title="Floor plan"
              className={cn("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md", viewMode === "floor" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-white")}>
              <LayoutGrid className="h-3.5 w-3.5" /> Floor
            </button>
            <button onClick={() => setViewMode("timeline")} title="Timeline"
              className={cn("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md", viewMode === "timeline" ? "bg-gray-700 text-white shadow-sm" : "text-gray-400 hover:text-white")}>
              <CalendarRange className="h-3.5 w-3.5" /> Timeline
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {viewMode === "floor" ? (
            <FloorCanvas
              tables={tables} floorObjects={floorObjects} reservations={reservations} staff={staff}
              sections={sections} sectionMode={sectionMode}
              selectedTableId={selectedTableId}
              seatMode={!!seatMode} seatPartySize={seatPartySize}
              moveMode={!!moveFromId}
              combinePrimaryId={combinePrimaryId} combineSet={combineSet}
              blockedIds={blockedIds}
              onTableClick={handleTableClick}
              onDropOnTable={handleDropOnTable}
            />
          ) : (
            <TimelineGrid
              tables={tables} reservations={reservations}
              openMin={openMin} closeMin={closeMin}
              onReservationClick={onTimelineReservation}
            />
          )}
        </div>

        {/* Unified table panel (hidden while choosing a table) */}
        {selectedTable && !choosing && (
          <TablePanel
            table={selectedTable} reservations={reservations} busy={busy} moveMode={false}
            staff={staff} tables={tables}
            onAssignServer={(serverId) => tablePatch({ serverId })}
            onClose={() => setSelectedTableId(null)}
            onSetStage={(stage) => tablePatch({ serviceStage: stage })}
            onBussing={() => tablePatch({ status: "DIRTY" })}
            onFinish={finishTable}
            onMarkClean={() => tablePatch({ status: "AVAILABLE" })}
            onSeatReservation={seatUpcomingHere}
            onStartMove={() => { setMoveFromId(selectedTable.id); }}
            onSeatWalkInHere={() => { setWalkInTarget(selectedTable); setWalkInOpen(true); }}
            onStartCombine={startCombine}
            onSplit={splitCombine}
            onEditGuest={setEditGuest}
            isBlocked={selectedBlocked}
            onBlock={() => { setBlockReason(""); setBlockTarget(selectedTable); }}
            onUnblock={() => unblockTable(selectedTable)}
          />
        )}
      </div>

      <ReservationFormDialog
        open={newResOpen} onClose={() => setNewResOpen(false)} onSubmit={submitReservation}
        saving={savingRes} availableTables={availableTables} cardPolicy={cardPolicy}
      />
      <SeatWalkInDialog
        open={walkInOpen} onClose={() => { setWalkInOpen(false); setWalkInTarget(null); }}
        targetTable={walkInTarget} saving={savingWalkIn}
        onSeat={walkInSeat} onWaitlist={walkInWaitlist}
      />
      <GuestEditDialog
        open={!!editGuest} customer={editGuest}
        onClose={() => setEditGuest(null)}
        onSaved={() => { toast.success("Guest updated"); loadAll(date); }}
      />
      <SectionsDialog
        open={sectionsOpen} onClose={() => setSectionsOpen(false)}
        sections={sections} staff={staff} activeAssignId={sectionMode}
        onCreate={createSection} onUpdate={updateSection} onDelete={deleteSection}
        onAssignTables={startSectionAssign}
      />

      {/* Block table (today) */}
      <Dialog open={blockTarget !== null} onOpenChange={(o) => { if (!o) setBlockTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Block Table {blockTarget?.number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Takes this table out of service for {date === toISO(new Date()) ? "today" : date}. It won&apos;t be bookable or seatable until you unblock it.
            </p>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <div className="flex flex-wrap gap-1.5">
                {["Out of service", "Broken/repair", "Reserved setup", "Deep clean", "Private use"].map((r) => (
                  <button key={r} type="button" onClick={() => setBlockReason(r)}
                    className={cn("rounded-full border px-2.5 py-1 text-xs font-medium",
                      blockReason === r ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600 hover:border-amber-400")}>
                    {r}
                  </button>
                ))}
              </div>
              <Input placeholder="Reason (optional)" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockTarget(null)}>Cancel</Button>
            <Button onClick={async () => { const t = blockTarget!; setBlockTarget(null); await blockTable(t, blockReason); }}>
              Block Table
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
