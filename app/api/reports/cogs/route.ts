import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function dateRange(from: Date, to: Date) {
  return { gte: from, lte: to };
}

async function fetchPeriodData(from: Date, to: Date) {
  const [orders, purchaseOrders, clockEntries, salariedStaff] = await Promise.all([
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: dateRange(from, to) },
      include: {
        items: {
          where: { voided: false },
          include: {
            menuItem: {
              include: {
                recipe: {
                  include: { ingredient: true },
                },
                category: true,
              },
            },
          },
        },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        status: "RECEIVED",
        receivedAt: dateRange(from, to),
      },
      include: { items: true },
    }),
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: from, lte: to } },
      include: { user: { select: { hourlyRate: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true, employmentType: "SALARY", annualSalary: { not: null } },
      select: { id: true, annualSalary: true },
    }),
  ]);

  // Revenue
  const revenue = orders.reduce((sum, o) => sum + Number(o.total), 0);

  // Theoretical COGS
  let theoreticalCOGS = 0;
  const categoryMap = new Map<string, { revenue: number; cogs: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const menuItem = item.menuItem;
      const catName = menuItem.category?.name ?? "Uncategorized";
      const itemRevenue = Number(item.unitPrice) * item.quantity;

      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, { revenue: 0, cogs: 0 });
      }
      categoryMap.get(catName)!.revenue += itemRevenue;

      let itemCOGS = 0;
      for (const ri of menuItem.recipe) {
        itemCOGS += Number(ri.quantity) * Number(ri.ingredient.costPerUnit) * item.quantity;
      }
      theoreticalCOGS += itemCOGS;
      categoryMap.get(catName)!.cogs += itemCOGS;
    }
  }

  // Actual ingredient spend (PO items received in range)
  const actualIngredientSpend = purchaseOrders.reduce((sum, po) => {
    return (
      sum +
      po.items.reduce((s, item) => s + Number(item.unitCost) * Number(item.quantity), 0)
    );
  }, 0);

  // Hourly labor only — used for labor mix %
  let laborCost = 0;
  const nowMs = Date.now();
  const periodDays = Math.max(1, (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  for (const entry of clockEntries) {
    const endMs = entry.clockOut ? new Date(entry.clockOut).getTime() : nowMs;
    const hours = (endMs - new Date(entry.clockIn).getTime()) / (1000 * 60 * 60);
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    laborCost += hours * rate;
  }
  // Management salary — prorated by weeks in period (P&L only, never in labor mix %)
  const periodWeeks = periodDays / 7;
  const salaryCost = salariedStaff.reduce(
    (sum, s) => sum + (Number(s.annualSalary) / 52) * periodWeeks,
    0
  );

  const cogsPercent = revenue > 0 ? (theoreticalCOGS / revenue) * 100 : 0;
  const laborPercent = revenue > 0 ? (laborCost / revenue) * 100 : 0;
  const grossProfit = revenue - theoreticalCOGS;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const operatingIncome = grossProfit - laborCost - salaryCost;
  const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;

  const categoryBreakdown = Array.from(categoryMap.entries()).map(
    ([category, { revenue: rev, cogs }]) => ({
      category,
      revenue: rev,
      cogs,
      cogsPercent: rev > 0 ? (cogs / rev) * 100 : 0,
    })
  );

  // Daily P&L
  const dailyMap = new Map<
    string,
    { revenue: number; cogs: number; laborCost: number }
  >();
  for (const order of orders) {
    const day = new Date(order.createdAt).toISOString().slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, { revenue: 0, cogs: 0, laborCost: 0 });
    const d = dailyMap.get(day)!;
    d.revenue += Number(order.total);
    for (const item of order.items) {
      for (const ri of item.menuItem.recipe) {
        d.cogs += Number(ri.quantity) * Number(ri.ingredient.costPerUnit) * item.quantity;
      }
    }
  }
  for (const entry of clockEntries) {
    if (!entry.clockOut) continue;
    const day = new Date(entry.clockOut).toISOString().slice(0, 10);
    if (!dailyMap.has(day)) dailyMap.set(day, { revenue: 0, cogs: 0, laborCost: 0 });
    const hours =
      (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) /
      (1000 * 60 * 60);
    const rate = entry.user.hourlyRate ? Number(entry.user.hourlyRate) : 0;
    dailyMap.get(day)!.laborCost += hours * rate;
  }

  const dailyPL = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      revenue: d.revenue,
      cogs: d.cogs,
      laborCost: d.laborCost,
      grossProfit: d.revenue - d.cogs,
    }));

  return {
    revenue,
    theoreticalCOGS,
    cogsPercent,
    actualIngredientSpend,
    laborCost,
    laborPercent,
    salaryCost,
    grossProfit,
    grossMargin,
    operatingIncome,
    operatingMargin,
    categoryBreakdown,
    dailyPL,
  };
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

  const rangeDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - rangeDays * 24 * 60 * 60 * 1000);
  prevFrom.setHours(0, 0, 0, 0);
  prevTo.setHours(23, 59, 59, 999);

  const [current, prev] = await Promise.all([
    fetchPeriodData(from, to),
    fetchPeriodData(prevFrom, prevTo),
  ]);

  return Response.json({
    ...current,
    prevRevenue: prev.revenue,
    prevCOGS: prev.theoreticalCOGS,
    prevLaborCost: prev.laborCost,
    prevSalaryCost: prev.salaryCost,
    prevGrossProfit: prev.grossProfit,
    prevGrossMargin: prev.grossMargin,
    prevOperatingIncome: prev.operatingIncome,
    prevOperatingMargin: prev.operatingMargin,
  });
}
