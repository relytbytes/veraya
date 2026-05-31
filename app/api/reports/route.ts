import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const now = new Date();
  const from = fromParam ? new Date(fromParam + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  const to = toParam ? new Date(toParam + "T23:59:59") : new Date(now);
  to.setHours(23, 59, 59, 999);

  const [salesSummary, completedOrders, topItemGroups] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to } },
      _sum: { total: true, subtotal: true, tax: true },
      _count: true,
      _avg: { total: true },
    }),
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to } },
      select: { createdAt: true, total: true, type: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { order: { status: "COMPLETED", createdAt: { gte: from, lte: to } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    }),
  ]);

  // Daily
  const dayMap = new Map<string, { total: number; orders: number }>();
  // Hourly (0–23)
  const hourly: { total: number; orders: number }[] = Array.from({ length: 24 }, () => ({ total: 0, orders: 0 }));
  // Day-of-week (0=Sun..6=Sat): store by actual date to compute averages
  const dowDays: Map<string, number>[] = Array.from({ length: 7 }, () => new Map());

  for (const order of completedOrders) {
    const d = new Date(order.createdAt);
    const displayKey = d.toISOString().slice(0, 10);
    const amount = Number(order.total);

    const ex = dayMap.get(displayKey) ?? { total: 0, orders: 0 };
    dayMap.set(displayKey, { total: ex.total + amount, orders: ex.orders + 1 });

    hourly[d.getHours()].total += amount;
    hourly[d.getHours()].orders += 1;

    const dateStr = d.toISOString().slice(0, 10);
    const cur = dowDays[d.getDay()].get(dateStr) ?? 0;
    dowDays[d.getDay()].set(dateStr, cur + amount);
  }

  const dailySales = Array.from(dayMap.entries()).map(([date, v]) => ({
    date, total: Math.round(v.total * 100) / 100, orders: v.orders,
  }));

  const hourlySales = hourly.map((v, h) => ({
    hour: h,
    label: h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`,
    total: Math.round(v.total * 100) / 100,
    orders: v.orders,
  }));

  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowSales = dowDays.map((dateMap, i) => {
    const days = dateMap.size;
    const total = Array.from(dateMap.values()).reduce((s, v) => s + v, 0);
    return {
      dow: DOW_LABELS[i],
      avgTotal: days > 0 ? Math.round((total / days) * 100) / 100 : 0,
      total: Math.round(total * 100) / 100,
      orders: 0,
    };
  });

  // Top items
  const menuItemIds = topItemGroups.map(i => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { category: true },
  });
  const enrichedTopItems = topItemGroups.map(t => {
    const item = menuItems.find(m => m.id === t.menuItemId);
    return {
      menuItemId: t.menuItemId,
      name: item?.name ?? "Unknown",
      category: item?.category?.name ?? "—",
      units: t._sum.quantity ?? 0,
      revenue: Number(item?.price ?? 0) * (t._sum.quantity ?? 0),
    };
  });

  // Category rollup
  const catMap = new Map<string, { revenue: number; units: number }>();
  for (const item of enrichedTopItems) {
    const ex = catMap.get(item.category) ?? { revenue: 0, units: 0 };
    catMap.set(item.category, { revenue: ex.revenue + item.revenue, units: ex.units + item.units });
  }
  const categorySales = Array.from(catMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.revenue - a.revenue);

  // Labor — clock entries in the date window (include still-clocked-in, treat now as end)
  const clockEntries = await prisma.clockEntry.findMany({
    where: { clockIn: { gte: from, lte: to } },
    include: {
      user: { select: { id: true, name: true, hourlyRate: true, role: true } },
    },
  });

  const laborByEmployee = new Map<string, {
    name: string; role: string; hours: number; cost: number; entries: number;
  }>();

  let totalLaborCost = 0;
  let totalLaborHours = 0;
  const nowMs = Date.now();

  for (const entry of clockEntries) {
    const endMs = entry.clockOut ? entry.clockOut.getTime() : nowMs;
    const hrs = (endMs - entry.clockIn.getTime()) / 3_600_000;
    const rate = Number(entry.user.hourlyRate ?? 0);
    const existing = laborByEmployee.get(entry.user.id) ?? {
      name: entry.user.name, role: entry.user.role as string, hours: 0, cost: 0, entries: 0,
    };
    existing.hours += hrs;
    existing.cost += hrs * rate;
    existing.entries += 1;
    laborByEmployee.set(entry.user.id, existing);
    totalLaborCost += hrs * rate;
    totalLaborHours += hrs;
  }

  // Flag overtime (>40 cumulative hours in the period — simple approach)
  const laborBreakdown = Array.from(laborByEmployee.values())
    .map((e) => ({
      ...e,
      hours: Math.round(e.hours * 100) / 100,
      cost: Math.round(e.cost * 100) / 100,
      overtimeHours: Math.max(0, Math.round((e.hours - 40) * 100) / 100),
    }))
    .sort((a, b) => b.hours - a.hours);

  totalLaborCost = Math.round(totalLaborCost * 100) / 100;
  totalLaborHours = Math.round(totalLaborHours * 10) / 10;

  const totalRevenue = Number(salesSummary._sum?.total ?? 0);

  return Response.json({
    summary: {
      totalRevenue,
      totalOrders: salesSummary._count,
      avgCheck: Number(salesSummary._avg?.total ?? 0),
      taxCollected: Number(salesSummary._sum?.tax ?? 0),
      laborCost: totalLaborCost,
      laborPct: totalRevenue > 0 ? Math.round((totalLaborCost / totalRevenue) * 1000) / 10 : null,
      laborHours: totalLaborHours,
      salesPerLaborHour: totalLaborHours > 0 ? Math.round((totalRevenue / totalLaborHours) * 100) / 100 : null,
    },
    dailySales,
    hourlySales,
    dowSales,
    enrichedTopItems,
    categorySales,
    laborBreakdown,
  });
}
