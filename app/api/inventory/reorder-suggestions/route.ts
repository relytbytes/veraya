import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all inventory items with ingredient + supplier
  const inventoryItems = await prisma.inventoryItem.findMany({
    include: {
      ingredient: { include: { supplier: true } },
    },
  });

  const twentyOneDaysAgo = new Date();
  twentyOneDaysAgo.setDate(twentyOneDaysAgo.getDate() - 21);

  // Fetch USED transactions for all ingredients in last 21 days
  const usedTransactions = await prisma.inventoryTransaction.findMany({
    where: {
      type: "USED",
      createdAt: { gte: twentyOneDaysAgo },
    },
    select: { ingredientId: true, quantity: true },
  });

  // Group total used by ingredientId (quantities stored as negative deltas for USED)
  const usedMap = new Map<string, number>();
  for (const t of usedTransactions) {
    const prev = usedMap.get(t.ingredientId) ?? 0;
    // quantity is stored as negative (USED deducts), so we take abs
    usedMap.set(t.ingredientId, prev + Math.abs(Number(t.quantity)));
  }

  // Fetch most recent purchase order items for last cost
  const recentPOItems = await prisma.purchaseOrderItem.findMany({
    orderBy: { purchaseOrder: { createdAt: "desc" } },
    include: { purchaseOrder: { select: { createdAt: true } } },
  });

  // Build last cost map: ingredientId -> unitCost of most recent PO
  const lastCostMap = new Map<string, number>();
  for (const item of recentPOItems) {
    if (!lastCostMap.has(item.ingredientId)) {
      lastCostMap.set(item.ingredientId, Number(item.unitCost));
    }
  }

  const suggestions = [];

  for (const inv of inventoryItems) {
    const currentQty = Number(inv.quantity);
    const minThreshold = Number(inv.minThreshold);
    const maxThreshold = inv.maxThreshold != null ? Number(inv.maxThreshold) : null;

    // Determine urgency threshold (min * 1.25)
    const watchThreshold = minThreshold * 1.25;

    const isCritical = currentQty <= 0;
    const isLow = currentQty > 0 && currentQty <= minThreshold;
    const isWatch = !isCritical && !isLow && currentQty < watchThreshold;

    if (!isCritical && !isLow && !isWatch) continue;

    const totalUsed = usedMap.get(inv.ingredientId) ?? 0;
    const dailyBurnRate = totalUsed / 21;

    let suggestedQty: number;
    if (maxThreshold != null) {
      // Suggest enough to reach max threshold
      suggestedQty = Math.max(0, maxThreshold - currentQty);
    } else {
      // Suggest enough for 21 days burn above min
      suggestedQty = Math.max(0, dailyBurnRate * 21 - (currentQty - minThreshold));
    }
    suggestedQty = Math.ceil(suggestedQty);

    const urgency = isCritical ? "critical" : isLow ? "low" : "watch";
    const lastCost = lastCostMap.get(inv.ingredientId) ?? Number(inv.ingredient.costPerUnit);

    suggestions.push({
      ingredientId: inv.ingredientId,
      inventoryItemId: inv.id,
      ingredientName: inv.ingredient.name,
      unit: inv.ingredient.unit,
      supplierId: inv.ingredient.supplierId ?? null,
      supplierName: inv.ingredient.supplier?.name ?? null,
      currentQty,
      minThreshold,
      maxThreshold,
      dailyBurnRate: Math.round(dailyBurnRate * 1000) / 1000,
      suggestedQty,
      lastCost,
      urgency,
    });
  }

  // Sort: critical first, then low, then watch; within each by name
  const urgencyOrder: Record<string, number> = { critical: 0, low: 1, watch: 2 };
  suggestions.sort((a, b) => {
    const uo = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uo !== 0) return uo;
    return a.ingredientName.localeCompare(b.ingredientName);
  });

  return Response.json(suggestions);
}
