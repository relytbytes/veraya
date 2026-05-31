"use client";

import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import {
  type TableRow, type Reservation, BRAND,
  toMinutes, fmtBadgeTime, recognition,
} from "../host-utils";

const ROW_H = 40;       // px per table row
const HEADER_H = 28;    // px time-axis header
const LABEL_W = 64;     // px left table-label column
const PX_PER_MIN = 3;   // horizontal scale
const SLOT_MIN = 90;    // assumed dining duration per reservation

const STATUS_COLOR: Record<string, string> = {
  PENDING: BRAND.smoke,
  CONFIRMED: BRAND.sky,
  SEATED: BRAND.jade,
  CANCELLED: BRAND.coral,
  NO_SHOW: BRAND.smoke,
};

/** Tables × time grid for the day. Blocks are positioned by reservation time. */
export function TimelineGrid({
  tables, reservations, openMin, closeMin, onReservationClick,
}: {
  tables: TableRow[];
  reservations: Reservation[];
  openMin: number;
  closeMin: number;
  onReservationClick: (r: Reservation) => void;
}) {
  const totalMin = Math.max(60, closeMin - openMin);
  const gridW = totalMin * PX_PER_MIN;

  // Hour ticks across the axis.
  const hours: number[] = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hours.push(m);

  const active = reservations.filter((r) => r.status !== "CANCELLED" && r.status !== "NO_SHOW");
  const assigned = (tableId: string) => active.filter((r) => r.tableId === tableId);
  const unassigned = active.filter((r) => !r.tableId);

  // "Now" line (only if within the window and it's today is decided by caller via openMin/closeMin).
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nowX = nowMinutes >= openMin && nowMinutes <= closeMin ? (nowMinutes - openMin) * PX_PER_MIN : null;

  function block(r: Reservation, key: string) {
    const start = toMinutes(r.time);
    const left = Math.max(0, (start - openMin) * PX_PER_MIN);
    const width = SLOT_MIN * PX_PER_MIN;
    const color = STATUS_COLOR[r.status] ?? BRAND.smoke;
    const rec = recognition(r.customer);
    return (
      <button
        key={key}
        onClick={() => onReservationClick(r)}
        title={`${r.name} · ${r.partySize} · ${fmtBadgeTime(r.time)}${rec.label ? ` · ${rec.label}` : ""}`}
        className="absolute top-1 bottom-1 rounded-md px-1.5 text-left overflow-hidden text-white hover:brightness-110 transition-all"
        style={{ left, width, background: color, minWidth: 44 }}
      >
        <div className="flex items-center gap-1 text-[10px] font-semibold leading-tight truncate">
          {r.name.split(" ")[0]}
          {rec.tone === "vip" && <span className="text-[8px]">★</span>}
        </div>
        <div className="flex items-center gap-0.5 text-[8px] opacity-90 leading-none">
          <Users className="h-2 w-2" />{r.partySize} · {fmtBadgeTime(r.time)}
        </div>
      </button>
    );
  }

  return (
    <div className="h-full overflow-auto p-3">
      <div className="inline-block min-w-full">
        {/* Time axis */}
        <div className="flex sticky top-0 z-10 bg-white/5" style={{ height: HEADER_H }}>
          <div className="shrink-0 border-b border-gray-800" style={{ width: LABEL_W }} />
          <div className="relative border-b border-gray-800" style={{ width: gridW }}>
            {hours.map((m) => (
              <span key={m} className="absolute top-1 text-[10px] font-medium text-gray-500"
                style={{ left: (m - openMin) * PX_PER_MIN }}>
                {fmtBadgeTime(`${String(Math.floor(m / 60)).padStart(2, "0")}:00`)}
              </span>
            ))}
          </div>
        </div>

        {/* Unassigned row */}
        {unassigned.length > 0 && (
          <Row label="—" sublabel="unassigned" gridW={gridW} hours={hours} openMin={openMin} nowX={nowX} highlight>
            {unassigned.map((r, i) => block(r, `u-${r.id}-${i}`))}
          </Row>
        )}

        {/* Table rows */}
        {tables.map((t) => (
          <Row key={t.id} label={`T${t.number}`} sublabel={`${t.capacity}p`} gridW={gridW} hours={hours} openMin={openMin} nowX={nowX}>
            {assigned(t.id).map((r, i) => block(r, `${t.id}-${r.id}-${i}`))}
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({
  label, sublabel, gridW, hours, openMin, nowX, highlight, children,
}: {
  label: string; sublabel: string; gridW: number; hours: number[]; openMin: number;
  nowX: number | null; highlight?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex" style={{ height: ROW_H }}>
      <div className={cn("shrink-0 flex flex-col justify-center px-2 border-b border-gray-800", highlight && "bg-amber-500/10")}
        style={{ width: LABEL_W }}>
        <span className="text-xs font-bold text-gray-200 leading-none">{label}</span>
        <span className="text-[9px] text-gray-500 leading-none mt-0.5">{sublabel}</span>
      </div>
      <div className={cn("relative border-b border-gray-800", highlight && "bg-amber-500/[0.06]")} style={{ width: gridW }}>
        {/* hour gridlines */}
        {hours.map((m) => (
          <div key={m} className="absolute top-0 bottom-0 border-l border-gray-800"
            style={{ left: (m - openMin) * 3 }} />
        ))}
        {/* now line */}
        {nowX !== null && (
          <div className="absolute top-0 bottom-0 w-px z-20" style={{ left: nowX, background: BRAND.coral }} />
        )}
        {children}
      </div>
    </div>
  );
}
