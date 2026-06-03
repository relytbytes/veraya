import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { dayWindow, startOfLocalDay, endOfLocalDay } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string })?.role ?? "";
  const MGMT_ROLES = new Set(["ADMIN", "MANAGER", "HOST", "BARTENDER"]);
  if (!MGMT_ROLES.has(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Support ?date=YYYY-MM-DD, default to today — boundaries in the venue's
  // timezone so "today" matches the local business day, not the UTC server day.
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const tz = await getRestaurantTz();
  const { start: today, end: endOfDay } = dateParam
    ? { start: startOfLocalDay(dateParam, tz), end: endOfLocalDay(dateParam, tz) }
    : dayWindow(new Date(), tz);

  const [todaySales, openOrders, inventoryItems, menuItemCount, recentOrders] =
    await Promise.all([
      // Sales: only COMPLETED orders created today
      prisma.order.aggregate({
        where: { createdAt: { gte: today, lte: endOfDay }, status: "COMPLETED" },
        _sum: { total: true },
        _count: true,
      }),

      // Open orders: OPEN or IN_PROGRESS created today (not all-time)
      prisma.order.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          createdAt: { gte: today, lte: endOfDay },
        },
      }),

      // Single inventory query — used for both low-stock count and alerts
      // Capped at 200 rows; enough for any realistic menu + prevents full-scan timeouts
      prisma.inventoryItem.findMany({
        include: { ingredient: true },
        orderBy: { quantity: "asc" },
        take: 200,
      }),

      // Active menu items
      prisma.menuItem.count({ where: { isActive: true } }),

      // Recent orders (last 8, any status, any day)
      prisma.order.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { table: true, items: { include: { menuItem: true } } },
      }),
    ]);

  const lowStockAll = inventoryItems.filter(
    (i) => Number(i.quantity) <= Number(i.minThreshold)
  );
  const lowStockAlerts = lowStockAll.slice(0, 5);

  return Response.json(
    {
      salesTotal: Number(todaySales._sum?.total ?? 0),
      salesCount: todaySales._count,
      openOrders,
      lowStockCount: lowStockAll.length,
      menuItemCount,
      recentOrders,
      lowStockAlerts,
    },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } },
  );
}
