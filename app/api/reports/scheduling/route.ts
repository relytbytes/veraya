import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

function shiftHours(startTime: string, endTime: string): number {
  return Math.max(0, parseHHMM(endTime) - parseHHMM(startTime));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const from = fromParam
    ? new Date(fromParam + "T00:00:00")
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  const to = toParam ? new Date(toParam + "T23:59:59") : new Date(now);
  to.setHours(23, 59, 59, 999);

  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  // 90 days back for DOW analysis
  const dowFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  dowFrom.setHours(0, 0, 0, 0);

  const [shifts, clockEntries, orders, dowOrders] = await Promise.all([
    prisma.shift.findMany({
      where: { date: { gte: fromStr, lte: toStr } },
      include: { user: { select: { id: true, name: true, role: true, hourlyRate: true } } },
    }),
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: from, lte: to } },
      include: { user: { select: { id: true, name: true, role: true, hourlyRate: true } } },
    }),
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to } },
      select: { createdAt: true, total: true },
    }),
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: dowFrom, lte: to } },
      select: { createdAt: true, total: true },
    }),
  ]);

  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

  // Build per-user scheduled and actual hours
  type UserHours = {
    userId: string;
    name: string;
    role: string;
    hourlyRate: number;
    scheduledHours: number;
    actualHours: number;
  };

  const userMap = new Map<string, UserHours>();

  for (const shift of shifts) {
    const uid = shift.user.id;
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        userId: uid,
        name: shift.user.name,
        role: shift.user.role,
        hourlyRate: shift.user.hourlyRate ? Number(shift.user.hourlyRate) : 0,
        scheduledHours: 0,
        actualHours: 0,
      });
    }
    userMap.get(uid)!.scheduledHours += shiftHours(shift.startTime, shift.endTime);
  }

  const nowMs = Date.now();
  for (const entry of clockEntries) {
    const uid = entry.user.id;
    if (!userMap.has(uid)) {
      userMap.set(uid, {
        userId: uid,
        name: entry.user.name,
        role: entry.user.role,
        hourlyRate: entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0,
        scheduledHours: 0,
        actualHours: 0,
      });
    }
    const endMs = entry.clockOut ? new Date(entry.clockOut).getTime() : nowMs;
    const hours = (endMs - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
    userMap.get(uid)!.actualHours += hours;
  }

  const users = Array.from(userMap.values());

  const totalScheduledHours = users.reduce((s, u) => s + u.scheduledHours, 0);
  const totalActualHours = users.reduce((s, u) => s + u.actualHours, 0);
  const scheduledLaborCost = users.reduce((s, u) => s + u.scheduledHours * u.hourlyRate, 0);
  const actualLaborCost = users.reduce((s, u) => s + u.actualHours * u.hourlyRate, 0);

  const laborPct = revenue > 0 ? (actualLaborCost / revenue) * 100 : 0;
  const salesPerLaborHour = totalActualHours > 0 ? revenue / totalActualHours : 0;

  // Daily analysis
  const dailyRevMap = new Map<string, number>();
  const dailySchedHrsMap = new Map<string, number>();
  const dailyActualHrsMap = new Map<string, number>();
  const dailySchedCostMap = new Map<string, number>();
  const dailyActualCostMap = new Map<string, number>();

  for (const order of orders) {
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    dailyRevMap.set(day, (dailyRevMap.get(day) ?? 0) + Number(order.total));
  }
  for (const shift of shifts) {
    const h = shiftHours(shift.startTime, shift.endTime);
    const rate = shift.user.hourlyRate ? Number(shift.user.hourlyRate) : 0;
    dailySchedHrsMap.set(shift.date, (dailySchedHrsMap.get(shift.date) ?? 0) + h);
    dailySchedCostMap.set(shift.date, (dailySchedCostMap.get(shift.date) ?? 0) + h * rate);
  }
  for (const entry of clockEntries) {
    const day = entry.clockIn.toISOString().slice(0, 10);
    const endMs2 = entry.clockOut ? new Date(entry.clockOut).getTime() : nowMs;
    const hours = (endMs2 - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    dailyActualHrsMap.set(day, (dailyActualHrsMap.get(day) ?? 0) + hours);
    dailyActualCostMap.set(day, (dailyActualCostMap.get(day) ?? 0) + hours * rate);
  }

  // Build date list
  const allDays = new Set<string>();
  for (const [d] of dailyRevMap) allDays.add(d);
  for (const [d] of dailySchedHrsMap) allDays.add(d);
  for (const [d] of dailyActualHrsMap) allDays.add(d);

  const dailyAnalysis = Array.from(allDays)
    .sort()
    .map((date) => {
      const rev = dailyRevMap.get(date) ?? 0;
      const scH = dailySchedHrsMap.get(date) ?? 0;
      const acH = dailyActualHrsMap.get(date) ?? 0;
      const scC = dailySchedCostMap.get(date) ?? 0;
      const acC = dailyActualCostMap.get(date) ?? 0;
      return {
        date,
        revenue: rev,
        scheduledHours: scH,
        actualHours: acH,
        scheduledLaborCost: scC,
        actualLaborCost: acC,
        laborPct: rev > 0 ? (acC / rev) * 100 : 0,
      };
    });

  // DOW analysis (last 90 days)
  const dowRevMap = new Map<number, number[]>(); // 0=Sun ... 6=Sat
  const dowLaborMap = new Map<number, number[]>();
  for (const order of dowOrders) {
    const dow = new Date(order.createdAt).getDay();
    if (!dowRevMap.has(dow)) dowRevMap.set(dow, []);
    // Group by date for averages
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    const existing = dowRevMap.get(dow)!;
    // We'll just accumulate and count days separately
    existing.push(Number(order.total));
  }

  // Better DOW: sum revenue per date, then average by dow
  const dowDailyMap = new Map<string, { dow: number; revenue: number }>();
  for (const order of dowOrders) {
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    const dow = new Date(order.createdAt).getDay();
    if (!dowDailyMap.has(day)) dowDailyMap.set(day, { dow, revenue: 0 });
    dowDailyMap.get(day)!.revenue += Number(order.total);
  }
  const dowBuckets = new Map<number, number[]>();
  for (const { dow, revenue: rev } of dowDailyMap.values()) {
    if (!dowBuckets.has(dow)) dowBuckets.set(dow, []);
    dowBuckets.get(dow)!.push(rev);
  }

  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowOptimal = Array.from({ length: 7 }, (_, i) => {
    const days = dowBuckets.get(i) ?? [];
    const avgRevenue = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    const avgLaborCost = avgRevenue * 0.28; // rough 28% labor benchmark
    const suggestedStaff = Math.max(1, Math.round(avgRevenue / 500));
    return {
      dow: DOW_NAMES[i],
      dowIndex: i,
      avgRevenue,
      avgLaborCost,
      avgLaborPct: avgRevenue > 0 ? (avgLaborCost / avgRevenue) * 100 : 0,
      suggestedStaff,
    };
  });

  // Overtime: users with >40h actual in the period
  const overtimeAlerts = users
    .filter((u) => u.actualHours > 40)
    .map((u) => ({
      userId: u.userId,
      name: u.name,
      role: u.role,
      weekHours: u.actualHours,
      overtimeHours: Math.max(0, u.actualHours - 40),
    }));

  // Role breakdown
  const roleMap = new Map<
    string,
    { headcount: number; scheduledHours: number; actualHours: number; laborCost: number }
  >();
  for (const u of users) {
    if (!roleMap.has(u.role)) {
      roleMap.set(u.role, { headcount: 0, scheduledHours: 0, actualHours: 0, laborCost: 0 });
    }
    const r = roleMap.get(u.role)!;
    r.headcount++;
    r.scheduledHours += u.scheduledHours;
    r.actualHours += u.actualHours;
    r.laborCost += u.actualHours * u.hourlyRate;
  }

  const roleBreakdown = Array.from(roleMap.entries()).map(([role, data]) => ({
    role,
    ...data,
    laborPct: revenue > 0 ? (data.laborCost / revenue) * 100 : 0,
  }));

  // Staff breakdown with overtime
  const staffBreakdown = users.map((u) => ({
    userId: u.userId,
    name: u.name,
    role: u.role,
    scheduledHours: u.scheduledHours,
    actualHours: u.actualHours,
    laborCost: u.actualHours * u.hourlyRate,
    overtimeHours: Math.max(0, u.actualHours - 40),
  }));

  return Response.json({
    summary: {
      scheduledHours: totalScheduledHours,
      actualHours: totalActualHours,
      scheduledLaborCost,
      actualLaborCost,
      revenue,
      laborPct,
      salesPerLaborHour,
    },
    dailyAnalysis,
    dowOptimal,
    overtimeAlerts,
    roleBreakdown,
    staffBreakdown,
  });
}
