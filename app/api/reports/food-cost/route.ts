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

  const [transactions, salesAgg] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: {
        type: { in: ["USED", "WASTED"] },
        createdAt: { gte: from, lte: to },
      },
      include: {
        ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } },
      },
    }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: from, lte: to } },
      _sum: { total: true },
    }),
  ]);

  const salesRevenue = Number(salesAgg._sum?.total ?? 0);

  type IngRow = {
    name: string;
    unit: string;
    usedQty: number;
    wastedQty: number;
    cost: number;
  };
  const ingMap = new Map<string, IngRow>();

  let totalFoodCost = 0;
  let wastedCost = 0;

  for (const tx of transactions) {
    const qty = Math.abs(Number(tx.quantity));
    const unitCost = Number(tx.ingredient.costPerUnit);
    const lineCost = qty * unitCost;

    const ex = ingMap.get(tx.ingredientId) ?? {
      name: tx.ingredient.name,
      unit: tx.ingredient.unit,
      usedQty: 0,
      wastedQty: 0,
      cost: 0,
    };

    if (tx.type === "USED") {
      ex.usedQty += qty;
    } else {
      ex.wastedQty += qty;
      wastedCost += lineCost;
    }
    ex.cost += lineCost;
    ingMap.set(tx.ingredientId, ex);
    totalFoodCost += lineCost;
  }

  const byIngredient = Array.from(ingMap.entries())
    .map(([ingredientId, v]) => ({
      ingredientId,
      name: v.name,
      unit: v.unit,
      usedQty: Math.round(v.usedQty * 1000) / 1000,
      wastedQty: Math.round(v.wastedQty * 1000) / 1000,
      cost: Math.round(v.cost * 100) / 100,
    }))
    .sort((a, b) => b.cost - a.cost);

  const foodCostPct =
    salesRevenue > 0 ? Math.round((totalFoodCost / salesRevenue) * 10000) / 100 : 0;

  return Response.json({
    totalFoodCost: Math.round(totalFoodCost * 100) / 100,
    wastedCost: Math.round(wastedCost * 100) / 100,
    foodCostPct,
    byIngredient,
  });
}
