import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDayAvailability, getTableBlocks } from "@/lib/reservations";

// ─── GET /api/public/availability?date=YYYY-MM-DD&partySize=N ─────────────────
//
// Returns per-slot availability plus the table blocks active for the date.
// Shares all availability logic with the booking endpoint via lib/reservations
// so the two can never disagree.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const partySizeParam = searchParams.get("partySize");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date parameter is required (YYYY-MM-DD)" }, { status: 400 });
  }

  const partySize = partySizeParam ? Math.max(1, Number(partySizeParam)) : 1;

  const [{ dayEnabled, maxPartySize, slots }, blocks, allTables] = await Promise.all([
    getDayAvailability(date, partySize),
    getTableBlocks(),
    prisma.table.findMany({ select: { id: true, number: true }, orderBy: { number: "asc" } }),
  ]);

  const tableNumberById = new Map(allTables.map((t) => [t.id, t.number]));

  const blockedTables = blocks
    .filter((b) => date >= b.startDate && date <= b.endDate)
    .flatMap((block) =>
      block.tableIds.map((tableId) => ({
        tableId,
        tableNumber: tableNumberById.get(tableId) ?? null,
        reason: block.reason,
        startDate: block.startDate,
        endDate: block.endDate,
        startTime: block.allDay ? "00:00" : block.startTime,
        endTime: block.allDay ? "23:59" : block.endTime,
        allDay: block.allDay,
      })),
    );

  return Response.json({
    date,
    dayEnabled,
    config: { maxPartySize },
    slots,
    blockedTables,
  });
}
