"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { X, Clock, Users, ArrowRightLeft, CheckCircle2, Loader2, Armchair, Trash2, UserPlus, Link2, Unlink, ClipboardList, Ban } from "lucide-react";
import {
  type TableRow, type Reservation, type StaffMember, type CustomerProfile, BRAND,
  SERVICE_STAGES, STAGE_LABELS, deriveTableState, nextReservationForTable,
  seatedReservationForTable, fmtElapsed, fmtTime, serverColor, initials,
  linkedTablesOf, effectiveCapacity,
} from "../host-utils";
import { GuestCard } from "./guest-card";

export function TablePanel({
  table, reservations, busy, moveMode, staff, tables,
  onClose, onSetStage, onBussing, onFinish, onMarkClean,
  onSeatReservation, onStartMove, onSeatWalkInHere, onAssignServer,
  onStartCombine, onSplit, onEditGuest,
  isBlocked, onBlock, onUnblock,
}: {
  table: TableRow;
  reservations: Reservation[];
  busy: boolean;
  moveMode: boolean;
  staff: StaffMember[];
  tables: TableRow[];
  onClose: () => void;
  onSetStage: (stage: string) => void;
  onBussing: () => void;
  onFinish: () => void;
  onMarkClean: () => void;
  onSeatReservation: (r: Reservation) => void;
  onStartMove: () => void;
  onSeatWalkInHere: () => void;
  onAssignServer: (serverId: string | null) => void;
  onStartCombine: () => void;
  onSplit: () => void;
  onEditGuest: (c: CustomerProfile) => void;
  isBlocked: boolean;
  onBlock: () => void;
  onUnblock: () => void;
}) {
  const router = useRouter();
  const linked = linkedTablesOf(table.id, tables);
  const isPrimary = linked.length > 0;
  const isMember = !!table.primaryTableId;
  const memberPrimaryNumber = isMember ? tables.find((t) => t.id === table.primaryTableId)?.number : null;
  const combinedCap = effectiveCapacity(table, tables);
  const vis = deriveTableState(table);
  const occupied = table.status === "OCCUPIED";
  const dirty = table.status === "DIRTY";
  const seatedRes = seatedReservationForTable(table.id, reservations);
  const next = !occupied ? nextReservationForTable(table.id, reservations) : null;
  const guestName = table.guestName ?? seatedRes?.name ?? null;
  const partySize = table.partySize ?? seatedRes?.partySize ?? null;
  const stageIdx = SERVICE_STAGES.indexOf((table.serviceStage ?? "SEATED") as never);

  const headerColor = occupied ? BRAND.jade : dirty ? BRAND.coral : next ? BRAND.gold : BRAND.mist;

  return (
    <div className="absolute inset-y-0 left-0 z-20 w-80 bg-gray-900 border-r border-gray-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-lg font-bold text-white">Table {table.number}</h2>
          <span className="text-xs font-semibold" style={{ color: headerColor }}>
            {vis.label} · seats {combinedCap}{isPrimary ? " (combined)" : ""}
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Server / section assignment */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Server</p>
          <div className="flex items-center gap-2">
            {table.serverId && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: serverColor(table.serverId) }}>
                {initials(staff.find((s) => s.id === table.serverId)?.name ?? "?")}
              </span>
            )}
            <select
              value={table.serverId ?? ""}
              disabled={busy}
              onChange={(e) => onAssignServer(e.target.value || null)}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {moveMode && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: BRAND.goldMuted, color: BRAND.gold, border: `1px solid ${BRAND.gold}` }}>
            Tap a highlighted table on the floor to move this party there.
          </div>
        )}

        {/* Combine / merge */}
        {isMember ? (
          <div className="rounded-lg bg-white/5 border border-gray-800 px-3 py-2 text-xs text-gray-300 flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" /> Combined into Table {memberPrimaryNumber}. Manage it there.
          </div>
        ) : isPrimary ? (
          <div className="rounded-xl bg-white/5 border border-gray-800 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                Combined · seats {combinedCap}
              </p>
              <button disabled={busy} onClick={onSplit}
                className="flex items-center gap-1 text-xs font-medium text-gray-300 hover:text-white disabled:opacity-50">
                <Unlink className="h-3.5 w-3.5" /> Split
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              With {linked.map((t) => `T${t.number}`).join(", ")}
            </p>
          </div>
        ) : table.status !== "OCCUPIED" && table.status !== "DIRTY" ? (
          <button disabled={busy} onClick={onStartCombine}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-white/10 hover:bg-white/10 text-gray-200 py-2 rounded-lg disabled:opacity-50">
            <Link2 className="h-4 w-4" /> Combine tables
          </button>
        ) : null}

        {occupied && (
          <>
            <div className="rounded-xl bg-white/5 border border-gray-800 p-3">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Currently seated</p>
              <p className="text-base font-bold text-white">{guestName ?? "Walk-in"}</p>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-300">
                {partySize != null && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{partySize}</span>}
                {table.seatedAt && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{fmtElapsed(table.seatedAt)}</span>}
              </div>
            </div>

            {seatedRes?.customer && (
              <GuestCard customer={seatedRes.customer} onEdit={() => onEditGuest(seatedRes.customer!)} />
            )}

            {/* Open a check / start an order for this table in the POS */}
            <button
              disabled={busy}
              onClick={() => router.push(`/pos?table=${table.id}`)}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white py-2.5 rounded-lg disabled:opacity-50"
              style={{ background: BRAND.gold }}
            >
              <ClipboardList className="h-4 w-4" /> Open check
            </button>

            {/* Stage stepper */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Service stage</p>
              <div className="grid grid-cols-4 gap-1">
                {SERVICE_STAGES.map((s, i) => (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => onSetStage(s)}
                    className={cn(
                      "text-[10px] font-medium py-1.5 rounded-md transition-colors disabled:opacity-50",
                      i === stageIdx ? "bg-amber-600 text-white"
                        : i < stageIdx ? "bg-amber-500/20 text-amber-300"
                        : "bg-white/10 text-gray-400 hover:bg-white/10",
                    )}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Workflow actions */}
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={onStartMove}
                className="flex items-center justify-center gap-1.5 text-sm font-medium bg-white/10 hover:bg-white/10 text-gray-200 py-2 rounded-lg disabled:opacity-50">
                <ArrowRightLeft className="h-4 w-4" /> Move
              </button>
              <button disabled={busy} onClick={onBussing}
                className="flex items-center justify-center gap-1.5 text-sm font-medium text-white py-2 rounded-lg disabled:opacity-50"
                style={{ background: BRAND.ember }}>
                <Trash2 className="h-4 w-4" /> Bussing
              </button>
              <button disabled={busy} onClick={onFinish}
                className="col-span-2 flex items-center justify-center gap-1.5 text-sm font-semibold text-white py-2 rounded-lg disabled:opacity-50"
                style={{ background: BRAND.jade }}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Finish & clear
              </button>
            </div>
          </>
        )}

        {dirty && (
          <button disabled={busy} onClick={onMarkClean}
            className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white py-2.5 rounded-lg disabled:opacity-50"
            style={{ background: BRAND.jade }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark clean / available
          </button>
        )}

        {!occupied && !dirty && isBlocked && (
          <div className="rounded-xl border border-gray-700 bg-white/5 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-300">Blocked — out of service</p>
            <button disabled={busy} onClick={onUnblock}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-white py-2 rounded-lg disabled:opacity-50"
              style={{ background: BRAND.jade }}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Unblock table
            </button>
          </div>
        )}

        {!occupied && !dirty && !isBlocked && (
          <>
            <button disabled={busy} onClick={onSeatWalkInHere}
              className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-lg disabled:opacity-50">
              <UserPlus className="h-4 w-4" /> Seat walk-in here
            </button>
            <button disabled={busy} onClick={onBlock}
              className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 py-2 rounded-lg disabled:opacity-50">
              <Ban className="h-3.5 w-3.5" /> Block table (out of service)
            </button>
          </>
        )}

        {next && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Upcoming</p>
            <div className="rounded-xl bg-white/5 border border-gray-800 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{next.name}</p>
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                  <span>{fmtTime(next.time)}</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{next.partySize}</span>
                </div>
              </div>
              <button disabled={busy} onClick={() => onSeatReservation(next)}
                className="shrink-0 flex items-center gap-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">
                <Armchair className="h-3.5 w-3.5" /> Seat now
              </button>
            </div>
            {next.customer && (
              <div className="mt-2">
                <GuestCard customer={next.customer} onEdit={() => onEditGuest(next.customer!)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
