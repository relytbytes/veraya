import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getGuestInsightsBatch, type GuestInsights } from "@/lib/guest-insights";
import { localDateStr } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

// GET /api/reports/pre-shift?date=YYYY-MM-DD
// Vera's pre-shift brief: every booking on the books for the date, enriched with
// the guest's dining history + flags so management can spot PPX (VIP / high-value)
// tables and watch tables (allergies, low tippers, first-timers) before doors.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? localDateStr(new Date(), await getRestaurantTz());

  const reservations = await prisma.reservation.findMany({
    where: { date, status: { in: ["PENDING", "CONFIRMED", "SEATED"] } },
    select: {
      id: true, name: true, time: true, partySize: true, notes: true, status: true,
      customerId: true, tableId: true,
      table: { select: { number: true } },
      customer: { select: { id: true, name: true, tags: true, notes: true } },
    },
    orderBy: { time: "asc" },
  });

  const insights = await getGuestInsightsBatch(
    reservations.map((r) => r.customerId).filter((x): x is string => !!x),
  );

  const entries = reservations.map((r) => {
    const ins: GuestInsights | null = r.customerId ? insights.get(r.customerId) ?? null : null;
    return {
      id: r.id,
      time: r.time,
      name: r.name,
      partySize: r.partySize,
      tableNumber: r.table?.number ?? null,
      status: r.status,
      notes: r.notes,
      guestNotes: r.customer?.notes ?? null,
      insights: ins,
      flags: ins?.flags ?? [],
    };
  });

  const totalCovers = reservations.reduce((s, r) => s + r.partySize, 0);
  const vipCount = entries.filter((e) => e.flags.some((f) => f.label === "VIP")).length;
  const watchCount = entries.filter((e) => e.flags.some((f) => f.kind === "watch")).length;
  const ppxCount = entries.filter((e) => e.flags.some((f) => f.kind === "positive")).length;

  return Response.json({
    date,
    summary: { parties: reservations.length, covers: totalCovers, vip: vipCount, watch: watchCount, ppx: ppxCount },
    entries,
  });
}
