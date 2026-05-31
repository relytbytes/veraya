import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");

  // Default to current Monday
  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam + "T00:00:00");
  } else {
    weekStart = new Date();
    const day = weekStart.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    weekStart.setDate(weekStart.getDate() + diff);
  }
  weekStart.setHours(0, 0, 0, 0);

  // Last 8 weeks of completed orders (before weekStart)
  const eightWeeksAgo = new Date(weekStart);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: eightWeeksAgo, lt: weekStart } },
    select: { createdAt: true, total: true },
  });

  // Bucket by day of week
  type Bucket = { total: number; weeks: Set<string> };
  const buckets: Bucket[] = Array.from({ length: 7 }, () => ({ total: 0, weeks: new Set<string>() }));

  for (const order of orders) {
    const d = new Date(order.createdAt);
    const dow = d.getDay();
    // week key = ISO date of the week's Monday
    const tmp = new Date(d);
    tmp.setHours(0, 0, 0, 0);
    const day = tmp.getDay();
    tmp.setDate(tmp.getDate() - (day === 0 ? 6 : day - 1)); // shift to Monday
    const wk = tmp.toISOString().slice(0, 10); // "YYYY-MM-DD" of that week's Monday
    buckets[dow].total += Number(order.total);
    buckets[dow].weeks.add(wk);
  }

  // Mon(1)..Sun(0) order
  const weekDayDows = [1, 2, 3, 4, 5, 6, 0];
  const forecast = weekDayDows.map((dow, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    const b = buckets[dow];
    const n = b.weeks.size;
    return {
      date: date.toISOString().slice(0, 10),
      dow: DOW_LABELS[dow],
      avgRevenue: n > 0 ? Math.round((b.total / n) * 100) / 100 : 0,
      weeksOfData: n,
    };
  });

  const projectedWeeklyTotal = Math.round(forecast.reduce((s, d) => s + d.avgRevenue, 0) * 100) / 100;
  const maxWeeks = forecast.reduce((m, d) => Math.max(m, d.weeksOfData), 0);
  const confidence: "none" | "low" | "medium" | "high" =
    maxWeeks === 0 ? "none" : maxWeeks < 2 ? "low" : maxWeeks < 4 ? "medium" : "high";

  return Response.json({ weekStart: weekStart.toISOString().slice(0, 10), projectedWeeklyTotal, forecast, weeksOfData: maxWeeks, confidence });
}
