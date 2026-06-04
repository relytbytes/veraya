// Time-based reservation upkeep (#2): auto-mark a booking NO_SHOW once it's run
// past its time by the grace window. Off by default — the manager opts in via
// Settings, because auto-removing a guest who's merely running late is a
// judgment call (a manager-set RUNNING_LATE status is always spared).
//
// Designed to be idempotent and cheap so it can run opportunistically on each
// reservations load as well as from the cron, regardless of cron cadence.

import { prisma } from "@/lib/prisma";
import { publish } from "@/lib/realtime";

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface SweepConfig {
  enabled: boolean;
  graceMinutes: number;
}

export async function getSweepConfig(): Promise<SweepConfig> {
  const rows = await prisma.restaurantSettings.findMany({
    where: { key: { in: ["autoNoShowEnabled", "autoNoShowMinutes"] } },
  });
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const grace = Number(m.autoNoShowMinutes);
  return {
    enabled: m.autoNoShowEnabled === "true",
    graceMinutes: Number.isFinite(grace) && grace > 0 ? grace : 15,
  };
}

/**
 * Mark today's overdue, un-arrived reservations as NO_SHOW. Only touches PENDING
 * and CONFIRMED bookings — ARRIVED / PARTIALLY_ARRIVED / RUNNING_LATE / SEATED are
 * left alone. Returns the number swept. No-op unless enabled in settings.
 *
 * @param nowMinutes  minutes-since-midnight in the venue's local time
 * @param todayStr    venue-local YYYY-MM-DD
 */
export async function sweepOverdueReservations(todayStr: string, nowMinutes: number): Promise<number> {
  const cfg = await getSweepConfig();
  if (!cfg.enabled) return 0;

  const candidates = await prisma.reservation.findMany({
    where: { date: todayStr, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { id: true, time: true },
  });
  const overdue = candidates.filter((r) => nowMinutes - toMinutes(r.time) >= cfg.graceMinutes);
  if (!overdue.length) return 0;

  await prisma.reservation.updateMany({
    where: { id: { in: overdue.map((r) => r.id) } },
    data: { status: "NO_SHOW", tableId: null },
  });
  publish({ scope: "floor", type: "reservation.updated", ids: overdue.map((r) => r.id) });
  return overdue.length;
}
