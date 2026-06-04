// Wait-time quoting for the waitlist (#5). Floor-aware: an open table that fits
// means a near-zero wait; otherwise we estimate from how soon the occupied
// fitting tables will turn (shrinking as their dwell approaches the average).

import { prisma } from "@/lib/prisma";

export const AVG_TURN_MINS = 45;

/**
 * Estimate the wait, in minutes, for a party of `size` at queue `position`
 * (1-based, including themselves). Rounded to the nearest 5 minutes.
 */
export async function quoteWaitMinutes(size: number, position: number): Promise<number> {
  const tables = await prisma.table.findMany({
    where: { capacity: { gte: size } },
    select: { status: true, seatedAt: true },
  });
  if (tables.length === 0) return position * AVG_TURN_MINS;

  const open = tables.filter((t) => t.status === "AVAILABLE").length;
  // Enough open tables that fit → they'll be walked right over.
  if (open >= position) return 5;

  const occupied = tables.filter((t) => t.status === "OCCUPIED");
  if (occupied.length === 0) return Math.max(5, (position - open) * AVG_TURN_MINS);

  // Minutes until each occupied fitting table is expected to free, soonest first.
  const now = Date.now();
  const freesIn = occupied
    .map((t) => {
      const dwellMins = t.seatedAt ? (now - new Date(t.seatedAt).getTime()) / 60000 : 0;
      return Math.max(5, AVG_TURN_MINS - dwellMins);
    })
    .sort((a, b) => a - b);

  // Parties still needing a table once the open ones are filled.
  const need = position - open;
  let wait = 0;
  for (let i = 0; i < need; i++) {
    const idx = i % freesIn.length;
    const cycles = Math.floor(i / freesIn.length);
    wait = freesIn[idx] + cycles * AVG_TURN_MINS;
  }
  return Math.max(5, Math.round(wait / 5) * 5);
}
