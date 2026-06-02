// Pure table-block helpers — no Prisma import, so this is safe to use from
// client components (the host stand) as well as server code. Block storage
// (read/write of the settings JSON) stays in lib/reservations.ts.

export interface TableBlock {
  id: string;
  tableIds: string[];
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
  allDay: boolean;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isTableBlockedAt(
  tableId: string,
  date: string,
  time: string,
  blocks: TableBlock[],
): boolean {
  const resMins = toMinutes(time);
  return blocks.some((block) => {
    if (!block.tableIds.includes(tableId)) return false;
    if (date < block.startDate || date > block.endDate) return false;
    if (block.allDay) return true;
    return resMins >= toMinutes(block.startTime) && resMins < toMinutes(block.endTime);
  });
}

/** IDs of tables blocked at a given date/time. */
export function blockedTableIds(date: string, time: string, blocks: TableBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const b of blocks) {
    for (const id of b.tableIds) {
      if (isTableBlockedAt(id, date, time, blocks)) ids.add(id);
    }
  }
  return ids;
}
