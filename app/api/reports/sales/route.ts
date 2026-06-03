import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rangeFromParams, localDateStr, nowInTZ } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  // Venue-timezone day boundaries + day/hour bucketing.
  const tz = await getRestaurantTz();
  const { start: from, end: to } = rangeFromParams(fromParam, toParam, tz);

  // Pull all completed orders with items + payments in range
  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: from, lte: to } },
    include: {
      items: {
        where: { voided: false },
        include: { menuItem: { include: { category: true } } },
      },
      payments: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // ── Totals ────────────────────────────────────────────────────────────────────
  let totalRevenue = 0;
  let totalTips = 0;

  for (const order of orders) {
    totalRevenue += Number(order.total);
    for (const p of order.payments) totalTips += Number(p.tip);
  }

  const totalOrders = orders.length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // ── Revenue by day ─────────────────────────────────────────────────────────
  const dayMap = new Map<string, { revenue: number; orders: number }>();
  for (const order of orders) {
    const key = localDateStr(new Date(order.createdAt), tz);
    const ex = dayMap.get(key) ?? { revenue: 0, orders: 0 };
    dayMap.set(key, { revenue: ex.revenue + Number(order.total), orders: ex.orders + 1 });
  }
  const revenueByDay = Array.from(dayMap.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
  }));

  // ── Revenue by hour ────────────────────────────────────────────────────────
  const hourArr: { revenue: number; orders: number }[] = Array.from({ length: 24 }, () => ({
    revenue: 0,
    orders: 0,
  }));
  for (const order of orders) {
    const h = nowInTZ(new Date(order.createdAt), tz).getUTCHours();
    hourArr[h].revenue += Number(order.total);
    hourArr[h].orders += 1;
  }
  const revenueByHour = hourArr.map((v, hour) => ({
    hour,
    revenue: Math.round(v.revenue * 100) / 100,
    orders: v.orders,
  }));

  // ── Revenue by category + top items ───────────────────────────────────────
  const catMap = new Map<string, { name: string; revenue: number; count: number }>();
  const itemMap = new Map<string, { name: string; revenue: number; count: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const lineRev = Number(item.unitPrice) * item.quantity;

      // Category rollup
      const cat = item.menuItem.category;
      const catEx = catMap.get(cat.id) ?? { name: cat.name, revenue: 0, count: 0 };
      catMap.set(cat.id, { name: catEx.name, revenue: catEx.revenue + lineRev, count: catEx.count + item.quantity });

      // Item rollup
      const itemEx = itemMap.get(item.menuItemId) ?? { name: item.menuItem.name, revenue: 0, count: 0 };
      itemMap.set(item.menuItemId, {
        name: itemEx.name,
        revenue: itemEx.revenue + lineRev,
        count: itemEx.count + item.quantity,
      });
    }
  }

  const revenueByCategory = Array.from(catMap.entries())
    .map(([categoryId, v]) => ({
      categoryId,
      name: v.name,
      revenue: Math.round(v.revenue * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topItems = Array.from(itemMap.entries())
    .map(([menuItemId, v]) => ({
      menuItemId,
      name: v.name,
      revenue: Math.round(v.revenue * 100) / 100,
      count: v.count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return Response.json({
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    totalTips: Math.round(totalTips * 100) / 100,
    revenueByDay,
    revenueByCategory,
    revenueByHour,
    topItems,
  });
}
