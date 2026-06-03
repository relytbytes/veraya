import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rangeFromParams } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Venue-timezone day boundaries (default: today).
  const tz = await getRestaurantTz();
  const { start: from, end: to } = rangeFromParams(fromParam, toParam, tz);

  const clockEntries = await prisma.clockEntry.findMany({
    where: { clockIn: { gte: from, lte: to } },
    include: {
      user: { select: { id: true, name: true, role: true, hourlyRate: true } },
    },
  });

  const empMap = new Map<
    string,
    { name: string; role: string; hours: number; cost: number; active: boolean }
  >();

  let totalHours = 0;
  let totalLaborCost = 0;
  const nowMs = Date.now();

  for (const entry of clockEntries) {
    const endMs = entry.clockOut ? entry.clockOut.getTime() : nowMs;
    const hrs = (endMs - entry.clockIn.getTime()) / 3_600_000;
    const rate = Number(entry.user.hourlyRate ?? 0);
    const cost = hrs * rate;

    const ex = empMap.get(entry.user.id) ?? {
      name: entry.user.name,
      role: entry.user.role as string,
      hours: 0, cost: 0, active: false,
    };
    empMap.set(entry.user.id, {
      name: ex.name, role: ex.role,
      hours: ex.hours + hrs,
      cost: ex.cost + cost,
      active: ex.active || !entry.clockOut,
    });

    totalHours += hrs;
    totalLaborCost += cost;
  }

  const byEmployee = Array.from(empMap.entries())
    .map(([userId, v]) => ({
      userId,
      name: v.name,
      role: v.role,
      active: v.active,
      hours: Math.round(v.hours * 100) / 100,
      cost: Math.round(v.cost * 100) / 100,
    }))
    .sort((a, b) => b.hours - a.hours);

  return Response.json({
    totalHours: Math.round(totalHours * 100) / 100,
    totalLaborCost: Math.round(totalLaborCost * 100) / 100,
    byEmployee,
  });
}
