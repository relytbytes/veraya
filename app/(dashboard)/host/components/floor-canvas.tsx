"use client";

import { cn } from "@/lib/utils";
import {
  type TableRow, type Reservation, type FloorObject, type StaffMember,
  deriveTableState, stateStyle, seatedReservationForTable, nextReservationForTable,
  fmtBadgeTime, fmtElapsed, serverColor, initials, effectiveCapacity, linkedTablesOf,
} from "../host-utils";

/** A table can take a party now if it's free, not a combo member, and big
 *  enough (counting any linked tables). `tables` lets us include combined seats. */
export function isEligibleForSeating(table: TableRow, partySize: number, tables: TableRow[] = []): boolean {
  if (table.primaryTableId) return false; // it's a member of a combination
  if (table.status === "OCCUPIED" || table.status === "DIRTY") return false;
  const cap = tables.length ? effectiveCapacity(table, tables) : table.capacity;
  return cap >= partySize;
}

export function FloorCanvas({
  tables,
  floorObjects,
  reservations,
  staff,
  selectedTableId,
  seatMode,
  seatPartySize,
  moveMode,
  combinePrimaryId,
  combineSet,
  onTableClick,
  onDropOnTable,
}: {
  tables: TableRow[];
  floorObjects: FloorObject[];
  reservations: Reservation[];
  staff: StaffMember[];
  selectedTableId: string | null;
  seatMode: boolean;
  seatPartySize: number;
  moveMode: boolean;
  combinePrimaryId: string | null;
  combineSet: string[];
  onTableClick: (t: TableRow) => void;
  onDropOnTable: (payload: { kind: string; id?: string; fromId?: string; partySize?: number }, table: TableRow) => void;
}) {
  function dragProps(t: TableRow) {
    const occupied = t.status === "OCCUPIED";
    return {
      draggable: occupied,
      onDragStart: occupied ? (e: React.DragEvent) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ kind: "move", fromId: t.id }));
        e.dataTransfer.effectAllowed = "move";
      } : undefined,
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        try {
          const payload = JSON.parse(e.dataTransfer.getData("application/json"));
          if (payload?.kind) onDropOnTable(payload, t);
        } catch { /* ignore malformed drag */ }
      },
    };
  }
  const positioned = tables.filter((t) => t.floorX !== null);
  const unpositioned = tables.filter((t) => t.floorX === null);
  const hasMapped = positioned.length > 0;
  const combining = !!combinePrimaryId;
  const choosing = seatMode || moveMode || combining;

  function visualFor(t: TableRow) {
    const vis = deriveTableState(t);
    // Upgrade OPEN→UPCOMING styling when a reservation is assigned.
    if (vis.state === "OPEN" && t.status !== "OCCUPIED" && t.status !== "DIRTY"
        && nextReservationForTable(t.id, reservations)) {
      return stateStyle("UPCOMING");
    }
    return vis;
  }

  function serverBadge(t: TableRow) {
    if (!t.serverId) return null;
    const name = staff.find((s) => s.id === t.serverId)?.name ?? "?";
    return (
      <span
        className="absolute top-0.5 right-0.5 z-10 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[7px] font-bold text-white ring-1 ring-white/60"
        style={{ background: serverColor(t.serverId) }}
        title={`Server: ${name}`}
      >
        {initials(name)}
      </span>
    );
  }

  function renderTableInner(t: TableRow) {
    const seated = seatedReservationForTable(t.id, reservations);
    const next = t.status === "OCCUPIED" ? null : nextReservationForTable(t.id, reservations);
    const occupied = t.status === "OCCUPIED";
    const dirty = t.status === "DIRTY";
    const name = seated?.name ?? t.guestName;

    if (occupied) {
      return (
        <>
          <span className="absolute top-1 left-1.5 text-[8px] font-bold opacity-60 leading-none">T{t.number}</span>
          <span className="text-[11px] font-bold text-center truncate px-1 w-full leading-tight mt-1">
            {name ? name.split(" ")[0] : `T${t.number}`}
          </span>
          <div className="flex items-center gap-1 text-[8px] opacity-90 leading-none mt-0.5">
            <span>{t.partySize ?? seated?.partySize ?? ""}p</span>
            {t.seatedAt && <span>· {fmtElapsed(t.seatedAt)}</span>}
          </div>
        </>
      );
    }
    if (dirty) {
      return (
        <>
          <span className="text-sm font-bold leading-none">{t.number}</span>
          <span className="text-[8px] font-semibold opacity-90 mt-0.5">Bussing</span>
        </>
      );
    }
    if (next) {
      return (
        <>
          <span className="text-sm font-bold leading-none">{t.number}</span>
          <span className="text-[9px] font-bold leading-none mt-0.5">{fmtBadgeTime(next.time)}</span>
          <span className="text-[8px] opacity-70">{next.partySize}p</span>
        </>
      );
    }
    // Linked member of a combination
    if (t.primaryTableId) {
      const primaryNum = tables.find((p) => p.id === t.primaryTableId)?.number;
      return (
        <>
          <span className="text-sm font-bold leading-none">{t.number}</span>
          <span className="text-[8px] font-semibold opacity-80 mt-0.5">+ T{primaryNum}</span>
        </>
      );
    }
    const cap = effectiveCapacity(t, tables);
    const combined = linkedTablesOf(t.id, tables).length > 0;
    return (
      <>
        <span className="text-sm font-bold leading-none">{t.number}</span>
        <span className="text-[9px] opacity-60 mt-0.5">{cap}p{combined ? " ⛓" : ""}</span>
      </>
    );
  }

  function tableClasses(t: TableRow) {
    let eligible = false;
    let combineSelected = false;
    if (seatMode) eligible = isEligibleForSeating(t, seatPartySize, tables);
    else if (moveMode) eligible = isEligibleForSeating(t, 1, tables);
    else if (combining) {
      const isTarget = t.id !== combinePrimaryId && !t.primaryTableId
        && t.status !== "OCCUPIED" && t.status !== "DIRTY";
      eligible = isTarget;
      combineSelected = combineSet.includes(t.id);
    }
    const isPrimaryInCombine = combining && t.id === combinePrimaryId;
    const dimmed = choosing && !eligible && !isPrimaryInCombine && !combineSelected;
    const selected = !choosing && t.id === selectedTableId;
    return cn(
      "border-2 transition-all select-none flex flex-col items-center justify-center overflow-hidden shadow-sm",
      selected && "ring-2 ring-offset-2 ring-offset-[#0C1A1E] ring-[#21A090]",
      isPrimaryInCombine && "ring-2 ring-offset-2 ring-offset-[#0C1A1E] ring-[#21A090]",
      combineSelected && "ring-2 ring-[#1E7A45]",
      eligible && !combineSelected && "ring-2 ring-[#1E7A45] animate-pulse cursor-pointer",
      dimmed && "opacity-30",
      !choosing && "cursor-pointer hover:brightness-95",
    );
  }

  if (!hasMapped) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 p-4">
        {tables.map((t) => {
          const isRect = t.shape !== "round";
          return (
            <button key={t.id} onClick={() => onTableClick(t)} style={visualFor(t).style} {...dragProps(t)}
              className={cn(tableClasses(t), isRect ? "rounded-xl" : "rounded-full", "h-20 relative")}>
              {serverBadge(t)}{renderTableInner(t)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[420px] p-3">
      <div className="relative w-full h-full rounded-2xl border border-gray-800 bg-[#0C1A1E]">
        {/* Floor objects behind tables */}
        {floorObjects.map((o) => (
          <div
            key={o.id}
            style={{
              position: "absolute",
              left: `${o.x}%`, top: `${o.y}%`,
              width: `${o.width}%`, height: `${o.height}%`,
              transform: `translate(-50%, -50%) rotate(${o.rotation}deg)`,
              backgroundColor: o.color + "14",
              border: `1px solid ${o.color}44`,
              borderRadius: "8px",
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none", zIndex: 0,
            }}
          >
            <span className="text-[10px] font-semibold" style={{ color: o.color + "bb" }}>{o.label}</span>
          </div>
        ))}

        {positioned.map((t) => {
          const isRect = t.shape !== "round";
          return (
            <button
              key={t.id}
              onClick={() => onTableClick(t)}
              {...dragProps(t)}
              style={{
                ...visualFor(t).style,
                left: `${t.floorX}%`, top: `${t.floorY}%`,
                width: isRect ? "78px" : "66px", height: "66px",
                transform: `translate(-50%, -50%) rotate(${t.rotation}deg)`,
                zIndex: 1,
                position: "absolute",
              }}
              className={cn(tableClasses(t), isRect ? "rounded-xl" : "rounded-full")}
            >
              {serverBadge(t)}{renderTableInner(t)}
            </button>
          );
        })}

        {unpositioned.length > 0 && (
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1.5">
            {unpositioned.map((t) => (
              <button key={t.id} onClick={() => onTableClick(t)} style={visualFor(t).style} {...dragProps(t)}
                className={cn("px-2.5 py-1 text-xs rounded-lg font-semibold relative", tableClasses(t))}>
                T{t.number}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
