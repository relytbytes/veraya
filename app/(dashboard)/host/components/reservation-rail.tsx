"use client";

import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, CalendarDays, Search, Users, Clock,
  Plus, UserPlus, StickyNote, Armchair, Bell,
} from "lucide-react";
import {
  type Reservation, type WaitlistEntry, type TableRow, type PeriodLabel,
  SERVICE_PERIODS, BRAND, fmtTime, fmtDateLabel, fmtElapsed, elapsedMin, estimateWait,
  isArrivingSoon, inPeriod,
} from "../host-utils";
import { WaitlistQR } from "./waitlist-qr";

const STATUS_DOT: Record<string, string> = {
  PENDING: BRAND.smoke, CONFIRMED: BRAND.sky, SEATED: BRAND.jade,
  CANCELLED: BRAND.coral, NO_SHOW: BRAND.smoke,
};

export function ReservationRail({
  serviceLabel,
  date, onShiftDate, onToday,
  period, onPeriod,
  search, onSearch,
  reservations, waitlist, tables,
  selectedReservationId,
  onSelectReservation, onSeatReservation, onSelectWaitlist, onNotifyWaitlist,
  onAddReservation, onSeatWalkIn,
}: {
  serviceLabel?: string;
  date: string;
  onShiftDate: (days: number) => void;
  onToday: () => void;
  period: PeriodLabel;
  onPeriod: (p: PeriodLabel) => void;
  search: string;
  onSearch: (v: string) => void;
  reservations: Reservation[];
  waitlist: WaitlistEntry[];
  tables: TableRow[];
  selectedReservationId: string | null;
  onSelectReservation: (r: Reservation) => void;
  onSeatReservation: (r: Reservation) => void;
  onSelectWaitlist: (e: WaitlistEntry) => void;
  onNotifyWaitlist: (e: WaitlistEntry) => void;
  onAddReservation: () => void;
  onSeatWalkIn: () => void;
}) {
  const q = search.trim().toLowerCase();
  const matchSearch = (name: string, phone: string | null) =>
    !q || name.toLowerCase().includes(q) || (phone ?? "").includes(q);

  const visible = reservations.filter((r) => inPeriod(r.time, period) && matchSearch(r.name, r.phone));
  const booked = visible.filter((r) => r.status === "PENDING" || r.status === "CONFIRMED");
  const seated = visible.filter((r) => r.status === "SEATED");
  const arriving = booked.filter((r) => isArrivingSoon(r.time)).sort((a, b) => a.time.localeCompare(b.time));
  const later = booked.filter((r) => !isArrivingSoon(r.time)).sort((a, b) => a.time.localeCompare(b.time));
  const waiting = waitlist.filter((e) => e.status === "WAITING" && matchSearch(e.name, e.phone));

  const allActive = [...booked, ...seated];
  const parties = allActive.length;
  const covers = allActive.reduce((s, r) => s + r.partySize, 0);

  return (
    <div className="w-80 shrink-0 flex flex-col border-r border-gray-800 bg-gray-900 overflow-hidden">
      {/* Date nav */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-800">
        <button onClick={() => onShiftDate(-1)} className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={onToday} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold text-white hover:text-amber-400">
          <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
          {fmtDateLabel(date)}
        </button>
        <button onClick={() => onShiftDate(1)} className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Service window + active dayparts (#24) */}
      {serviceLabel && (
        <div className={cn(
          "px-4 py-1.5 text-[11px] font-medium text-center border-b border-gray-800",
          serviceLabel.startsWith("Closed") ? "bg-red-950/40 text-red-300" : "text-gray-400"
        )}>
          {serviceLabel}
        </div>
      )}

      {/* Cover counts */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-gray-800 bg-white/5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-white tabular-nums">{parties}</span>
          <span className="text-xs text-gray-400">parties</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-white tabular-nums">{covers}</span>
          <span className="text-xs text-gray-400">guests</span>
        </div>
        <div className="flex items-baseline gap-1.5 ml-auto">
          <span className="text-sm font-bold tabular-nums" style={{ color: BRAND.jade }}>{seated.length}</span>
          <span className="text-xs text-gray-400">seated</span>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-800">
        {SERVICE_PERIODS.map((p) => (
          <button
            key={p.label}
            onClick={() => onPeriod(p.label)}
            className={cn(
              "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
              period === p.label ? "bg-amber-600 text-white" : "text-gray-400 hover:bg-white/5",
            )}
          >
            {p.label === "All Day" ? "All" : p.label}
          </button>
        ))}
      </div>

      {/* Search + actions */}
      <div className="px-3 py-2 border-b border-gray-800 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search name or phone"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onAddReservation} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/10 text-gray-200 py-1.5 rounded-lg">
            <Plus className="h-3.5 w-3.5" /> Reservation
          </button>
          <button onClick={onSeatWalkIn} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-white py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500">
            <UserPlus className="h-3.5 w-3.5" /> Walk-in
          </button>
          <WaitlistQR />
        </div>
      </div>

      {/* Lists */}
      <div className="flex-1 overflow-y-auto py-2 space-y-3">
        <RailSection title="Arriving soon" count={arriving.length} accent={BRAND.gold}>
          {arriving.map((r) => (
            <ResRow key={r.id} r={r} tables={tables} selected={r.id === selectedReservationId}
              onSelect={() => onSelectReservation(r)} onSeat={() => onSeatReservation(r)} />
          ))}
        </RailSection>

        <RailSection title="Upcoming" count={later.length}>
          {later.map((r) => (
            <ResRow key={r.id} r={r} tables={tables} selected={r.id === selectedReservationId}
              onSelect={() => onSelectReservation(r)} onSeat={() => onSeatReservation(r)} />
          ))}
        </RailSection>

        <RailSection title="Seated" count={seated.length} accent={BRAND.jade}>
          {seated.sort((a, b) => a.time.localeCompare(b.time)).map((r) => (
            <ResRow key={r.id} r={r} tables={tables} selected={false}
              onSelect={() => onSelectReservation(r)} />
          ))}
        </RailSection>

        <RailSection title="Waitlist" count={waiting.length} accent={BRAND.sky}>
          {waiting.map((e, i) => (
            <WaitRow key={e.id} e={e} position={i + 1} tables={tables}
              onSelect={() => onSelectWaitlist(e)} onNotify={() => onNotifyWaitlist(e)} />
          ))}
        </RailSection>
      </div>
    </div>
  );
}

function RailSection({ title, count, accent, children }: {
  title: string; count: number; accent?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 mb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={accent ? { color: accent } : undefined}>
          <span className={accent ? "" : "text-gray-500"}>{title}</span>
        </span>
        <span className="text-[11px] text-gray-500">{count}</span>
      </div>
      {count === 0
        ? <p className="text-xs text-gray-500 px-4 py-1">None</p>
        : <div className="space-y-0.5 px-2">{children}</div>}
    </div>
  );
}

function ResRow({ r, tables, selected, onSelect, onSeat }: {
  r: Reservation; tables: TableRow[]; selected: boolean;
  onSelect: () => void; onSeat?: () => void;
}) {
  const tableNum = r.table?.number ?? (r.tableId ? tables.find((t) => t.id === r.tableId)?.number : null);
  const isSeated = r.status === "SEATED";
  const draggable = !isSeated && !!onSeat;
  return (
    <div
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData("application/json", JSON.stringify({ kind: "reservation", id: r.id, partySize: r.partySize }));
        e.dataTransfer.effectAllowed = "move";
      } : undefined}
      className={cn(
        "w-full rounded-lg flex items-start gap-2.5 px-2.5 py-2 group cursor-pointer border transition-colors",
        draggable && "cursor-grab active:cursor-grabbing",
        selected ? "bg-[#1E7A45]/10"
          : isSeated ? "bg-[#1E7A45]/[0.06] hover:bg-[#1E7A45]/10 border-transparent"
          : "border-transparent hover:bg-white/5",
      )}
      style={selected ? { borderColor: BRAND.jade } : undefined}
      onClick={onSelect}
    >
      <div className="mt-1 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STATUS_DOT[r.status] ?? BRAND.smoke }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-gray-400 tabular-nums">{fmtTime(r.time)}</span>
          {r.customer && r.customer.visitCount > 3 && (
            <span className="text-[9px] font-bold text-white px-1 rounded" style={{ background: BRAND.gold }}>VIP</span>
          )}
        </div>
        <p className="font-semibold leading-tight truncate text-white" style={isSeated ? { color: BRAND.jade } : undefined}>{r.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-gray-400"><Users className="h-3 w-3" />{r.partySize}</span>
          {tableNum && <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.5 rounded font-medium">T{tableNum}</span>}
          {r.notes && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-500 truncate max-w-[90px]">
              <StickyNote className="h-3 w-3 shrink-0" /><span className="truncate">{r.notes}</span>
            </span>
          )}
        </div>
      </div>
      {!isSeated && onSeat && (
        <button
          onClick={(e) => { e.stopPropagation(); onSeat(); }}
          title="Seat now"
          className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: BRAND.jade }}
        >
          <Armchair className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function WaitRow({ e, position, tables, onSelect, onNotify }: {
  e: WaitlistEntry; position: number; tables: TableRow[]; onSelect: () => void; onNotify: () => void;
}) {
  const waited = elapsedMin(e.addedAt);
  const remaining = Math.max(0, estimateWait(e, position, tables) - waited);
  const waitColor = waited < 15 ? BRAND.jade : waited < 30 ? BRAND.ember : BRAND.coral;
  return (
    <div onClick={onSelect} className="w-full text-left rounded-lg flex items-start gap-2.5 px-2.5 py-2 hover:bg-white/5 border border-transparent group cursor-pointer">
      <div className="mt-1 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: BRAND.sky }} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white leading-tight truncate">{e.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-gray-400"><Users className="h-3 w-3" />{e.partySize}</span>
          <span className="text-xs font-medium" style={{ color: waitColor }}>
            <Clock className="h-3 w-3 inline mr-0.5" />{fmtElapsed(e.addedAt)}
          </span>
          <span className="text-[10px] text-gray-500">~{remaining === 0 ? "ready" : `${remaining}m`}</span>
        </div>
      </div>
      {e.phone && (
        <button
          onClick={(ev) => { ev.stopPropagation(); onNotify(); }}
          title="Text guest: table ready"
          className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: BRAND.sky }}
        >
          <Bell className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
