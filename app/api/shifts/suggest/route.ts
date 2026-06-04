import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { localDateStr, localDow, localHourFloat } from "@/lib/time";
import {
  parseSchedulingConfig, daypartsFor, planDay,
  type DaypartKey, type PlannedShift, type PlanShortfall,
} from "@/lib/auto-schedule";

function mgmt(role?: string) { return !!role && ["ADMIN", "MANAGER"].includes(role); }

function daypartOfHour(h: number): DaypartKey {
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  return "dinner";
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// POST /api/shifts/suggest  body: { weekStart: "YYYY-MM-DD" }
// Generates draft (unpublished) shifts for any day in the week that has none yet,
// forecasting staffing need per daypart from sales history and assigning active
// staff. Idempotent: days that already have shifts are left untouched.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { weekStart } = (await req.json()) as { weekStart?: string };
  if (!weekStart || isNaN(new Date(weekStart + "T00:00:00").getTime())) {
    return Response.json({ error: "weekStart (YYYY-MM-DD) is required" }, { status: 400 });
  }

  const tz = await getRestaurantTz();
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  // Settings: service window, served dayparts, staffing config.
  const settingRows = await prisma.restaurantSettings.findMany({
    where: { key: { in: ["serviceOpen", "serviceClose", "servedDayparts", "schedulingConfig"] } },
  });
  const sm = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const open = sm.serviceOpen || "11:00";
  const close = sm.serviceClose || "22:00";
  let served: Record<string, boolean> = { breakfast: true, lunch: true, dinner: true };
  try { if (sm.servedDayparts) served = { ...served, ...JSON.parse(sm.servedDayparts) }; } catch { /* defaults */ }
  const cfg = parseSchedulingConfig(sm.schedulingConfig);
  const dayparts = daypartsFor(open, close, served);

  // Active, schedulable staff (managers/admins excluded from auto-fill).
  const staff = (await prisma.user.findMany({
    where: { isActive: true, role: { notIn: ["ADMIN", "MANAGER", "CASHIER"] } },
    select: { id: true, name: true, role: true },
  })).map((s) => ({ id: s.id, name: s.name, role: s.role as string }));

  // Existing shifts in the week → skip already-scheduled days, seed busy map.
  const existing = await prisma.shift.findMany({
    where: { date: { gte: weekStart, lte: weekDates[6] } },
    select: { date: true },
  });
  const daysWithShifts = new Set(existing.map((s) => s.date));

  // Historical covers by (DOW → daypart): avg orders/daypart over ~6 weeks × guests-per-order.
  const since = new Date(Date.now() - 49 * 86_400_000);
  const history = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: since } },
    select: { createdAt: true },
  });
  // dow → daypart → { total, dates:Set }
  const agg = new Map<number, Map<DaypartKey, { count: number; dates: Set<string> }>>();
  for (const o of history) {
    const dow = localDow(o.createdAt, tz);
    const dp = daypartOfHour(Math.floor(localHourFloat(o.createdAt, tz)));
    const ds = localDateStr(o.createdAt, tz);
    if (!agg.has(dow)) agg.set(dow, new Map());
    const m = agg.get(dow)!;
    const e = m.get(dp) ?? { count: 0, dates: new Set<string>() };
    e.count += 1; e.dates.add(ds); m.set(dp, e);
  }
  function coversFor(dow: number, dp: DaypartKey): number {
    const e = agg.get(dow)?.get(dp);
    if (!e || e.dates.size === 0) return 0;
    return (e.count / e.dates.size) * cfg.guestsPerOrder;
  }

  // Plan each empty day.
  const loadMins = new Map<string, number>();
  const busyByUser = new Map<string, { start: number; end: number }[]>();
  const allPlanned: PlannedShift[] = [];
  const allShortfalls: PlanShortfall[] = [];
  let skippedDays = 0;

  for (const date of weekDates) {
    if (daysWithShifts.has(date)) { skippedDays++; continue; }
    const dow = new Date(date + "T12:00:00").getDay();
    const coversByDaypart = { breakfast: 0, lunch: 0, dinner: 0 } as Record<DaypartKey, number>;
    for (const dp of dayparts) coversByDaypart[dp.key] = Math.max(coversFor(dow, dp.key), 1); // served day → at least a skeleton crew
    const { shifts, shortfalls } = planDay(date, dayparts, coversByDaypart, staff, cfg, loadMins, busyByUser);
    allPlanned.push(...shifts);
    allShortfalls.push(...shortfalls);
  }

  if (allPlanned.length > 0) {
    await prisma.shift.createMany({
      data: allPlanned.map((s) => ({ userId: s.userId, date: s.date, startTime: s.startTime, endTime: s.endTime, position: s.position, isPublished: false })),
    });
  }

  return Response.json({
    created: allPlanned.length,
    skippedDays,
    shortfalls: allShortfalls,
    hasHistory: history.length > 0,
  });
}
