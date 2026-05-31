import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/timeclock/history?userId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns completed ClockEntries (clockOut NOT NULL) for a user in date range.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = from ? new Date(from + "T00:00:00") : undefined;
  const toDate = to ? new Date(to + "T23:59:59.999") : undefined;

  const entries = await prisma.clockEntry.findMany({
    where: {
      NOT: { clockOut: null },
      ...(userId && { userId }),
      ...(fromDate || toDate
        ? {
            clockIn: {
              ...(fromDate && { gte: fromDate }),
              ...(toDate && { lte: toDate }),
            },
          }
        : {}),
    },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { clockIn: "desc" },
  });

  return Response.json(entries);
}
