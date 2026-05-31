import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lookback = Math.min(365, Math.max(30, Number(searchParams.get("days") ?? 180)));

  const since = new Date();
  since.setDate(since.getDate() - lookback);

  // All received PO items in the window, with ingredient + supplier info
  const poItems = await prisma.purchaseOrderItem.findMany({
    where: {
      purchaseOrder: {
        status: "RECEIVED",
        receivedAt: { gte: since },
      },
    },
    include: {
      ingredient: {
        select: { id: true, name: true, unit: true, costPerUnit: true },
      },
      purchaseOrder: {
        select: {
          id: true,
          receivedAt: true,
          supplierId: true,
          vendor: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { purchaseOrder: { receivedAt: "asc" } },
  });

  // Group by ingredient
  const ingredientMap = new Map<string, {
    ingredientId: string;
    name: string;
    unit: string;
    currentCostPerUnit: number;
    history: {
      date: string;
      unitCost: number;
      supplierId: string;
      supplierName: string;
      poId: string;
      qty: number;
    }[];
  }>();

  for (const item of poItems) {
    const id = item.ingredientId;
    if (!ingredientMap.has(id)) {
      ingredientMap.set(id, {
        ingredientId: id,
        name: item.ingredient.name,
        unit: item.ingredient.unit,
        currentCostPerUnit: Number(item.ingredient.costPerUnit),
        history: [],
      });
    }
    const entry = ingredientMap.get(id)!;
    entry.history.push({
      date: item.purchaseOrder.receivedAt!.toISOString().slice(0, 10),
      unitCost: Number(item.unitCost),
      supplierId: item.purchaseOrder.supplierId,
      supplierName: item.purchaseOrder.vendor.name,
      poId: item.purchaseOrder.id,
      qty: Number(item.quantity),
    });
  }

  // Build summary rows per ingredient
  const rows = Array.from(ingredientMap.values()).map((ing) => {
    const h = ing.history;
    const costs = h.map(x => x.unitCost).filter(c => c > 0);
    if (costs.length === 0) return null;

    const firstCost = costs[0];
    const lastCost = costs[costs.length - 1];
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    const avgCost = costs.reduce((s, c) => s + c, 0) / costs.length;
    const changePct = firstCost > 0 ? ((lastCost - firstCost) / firstCost) * 100 : 0;

    // Trend: compare last 2 prices
    let trend: "up" | "down" | "stable" = "stable";
    if (costs.length >= 2) {
      const last2Change = ((costs[costs.length - 1] - costs[costs.length - 2]) / costs[costs.length - 2]) * 100;
      if (last2Change > 2) trend = "up";
      else if (last2Change < -2) trend = "down";
    }

    // Supplier breakdown — best price per supplier
    const bySupplier = new Map<string, { name: string; lastCost: number; ordersCount: number; totalQty: number }>();
    for (const p of h) {
      if (!bySupplier.has(p.supplierId)) {
        bySupplier.set(p.supplierId, { name: p.supplierName, lastCost: p.unitCost, ordersCount: 0, totalQty: 0 });
      }
      const s = bySupplier.get(p.supplierId)!;
      s.lastCost = p.unitCost; // last known price from this supplier
      s.ordersCount++;
      s.totalQty += p.qty;
    }
    const suppliers = Array.from(bySupplier.entries()).map(([id, s]) => ({ supplierId: id, ...s }));
    const bestSupplier = suppliers.reduce((a, b) => b.lastCost < a.lastCost ? b : a, suppliers[0]);

    return {
      ingredientId: ing.ingredientId,
      name: ing.name,
      unit: ing.unit,
      currentCostPerUnit: ing.currentCostPerUnit,
      firstCost,
      lastCost,
      minCost,
      maxCost,
      avgCost,
      changePct,
      trend,
      totalOrders: h.length,
      suppliers,
      bestSupplierId: bestSupplier?.supplierId ?? null,
      bestSupplierName: bestSupplier?.name ?? null,
      bestSupplierPrice: bestSupplier?.lastCost ?? null,
      savingsVsBest: lastCost > (bestSupplier?.lastCost ?? lastCost)
        ? lastCost - (bestSupplier?.lastCost ?? lastCost)
        : 0,
      // Keep history compact — only unique price points
      pricePoints: h.map(p => ({ date: p.date, cost: p.unitCost, supplier: p.supplierName })),
    };
  }).filter(Boolean);

  // Sort: biggest absolute change % first (most volatile)
  rows.sort((a, b) => Math.abs(b!.changePct) - Math.abs(a!.changePct));

  const totalIngredients = rows.length;
  const risingCount = rows.filter(r => r!.trend === "up").length;
  const fallingCount = rows.filter(r => r!.trend === "down").length;
  const alertCount = rows.filter(r => Math.abs(r!.changePct) > 10).length;

  return Response.json({
    lookbackDays: lookback,
    summary: { totalIngredients, risingCount, fallingCount, alertCount },
    rows,
  });
}
