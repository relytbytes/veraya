import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // How many days of usage history to use for velocity
  const velocityDays = Math.min(90, Math.max(7, Number(searchParams.get("days") ?? 30)));
  // Lead time in days (how long until an order arrives)
  const leadDays = Math.max(1, Number(searchParams.get("lead") ?? 3));

  const since = new Date();
  since.setDate(since.getDate() - velocityDays);

  // ── Fetch in parallel ──────────────────────────────────────────────────────
  const [inventoryItems, usageTransactions, lastPOItems] = await Promise.all([
    // All inventory items with ingredient + supplier info
    prisma.inventoryItem.findMany({
      include: {
        ingredient: {
          include: {
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    }),

    // Recent USED + WASTED transactions for velocity calculation
    prisma.inventoryTransaction.findMany({
      where: {
        type: { in: ["USED", "WASTED"] },
        createdAt: { gte: since },
      },
      select: { ingredientId: true, quantity: true },
    }),

    // Most recent received PO item per ingredient (for last known unit cost)
    prisma.purchaseOrderItem.findMany({
      where: {
        purchaseOrder: { status: "RECEIVED" },
      },
      orderBy: { purchaseOrder: { receivedAt: "desc" } },
      select: {
        ingredientId: true,
        unitCost: true,
        purchaseOrder: { select: { supplierId: true, receivedAt: true } },
      },
    }),
  ]);

  // ── Build velocity map: ingredientId → daily usage rate ───────────────────
  const usageMap = new Map<string, number>(); // total usage in period
  for (const tx of usageTransactions) {
    const id = tx.ingredientId;
    usageMap.set(id, (usageMap.get(id) ?? 0) + Math.abs(Number(tx.quantity)));
  }

  // Daily usage = total / days
  const dailyUsage = new Map<string, number>();
  for (const [id, total] of usageMap) {
    dailyUsage.set(id, total / velocityDays);
  }

  // ── Build last-cost map: most recent unit cost per ingredient ──────────────
  const lastCostMap = new Map<string, { unitCost: number; supplierId: string }>();
  for (const item of lastPOItems) {
    if (!lastCostMap.has(item.ingredientId)) {
      lastCostMap.set(item.ingredientId, {
        unitCost: Number(item.unitCost),
        supplierId: item.purchaseOrder.supplierId,
      });
    }
  }

  // ── Build suggestions ──────────────────────────────────────────────────────
  const suggestions = [];

  for (const inv of inventoryItems) {
    const ing = inv.ingredient;
    if (!ing.isActive) continue;

    const currentQty = Number(inv.quantity);
    const minThreshold = Number(inv.minThreshold);
    const maxThreshold = inv.maxThreshold ? Number(inv.maxThreshold) : minThreshold * 3;
    const daily = dailyUsage.get(ing.id) ?? 0;

    // Days until we hit minimum threshold
    const daysUntilMin = daily > 0
      ? Math.max(0, (currentQty - minThreshold) / daily)
      : null;

    // Determine if reorder needed:
    // - Currently below minimum, OR
    // - Will hit minimum within lead time + 2 buffer days
    const belowMin = currentQty <= minThreshold;
    const willHitMin = daysUntilMin !== null && daysUntilMin <= leadDays + 2;
    const needsReorder = belowMin || willHitMin;

    if (!needsReorder) continue;

    // Order up to max (or 3× min if no max set)
    const orderQty = Math.max(1, maxThreshold - currentQty);

    // Urgency: how urgent is this order
    let urgency: "critical" | "high" | "medium" = "medium";
    if (currentQty <= 0 || (daysUntilMin !== null && daysUntilMin <= 1)) urgency = "critical";
    else if (currentQty <= minThreshold || (daysUntilMin !== null && daysUntilMin <= leadDays)) urgency = "high";

    // Cost: use last PO cost, fall back to ingredient.costPerUnit
    const lastCost = lastCostMap.get(ing.id);
    const unitCost = lastCost?.unitCost ?? Number(ing.costPerUnit);
    const supplierId = ing.supplierId ?? lastCost?.supplierId ?? null;
    const supplierName = ing.supplier?.name ?? null;

    suggestions.push({
      ingredientId: ing.id,
      name: ing.name,
      unit: ing.unit,
      currentQty,
      minThreshold,
      maxThreshold,
      orderQty,
      dailyUsage: daily,
      daysUntilMin,
      urgency,
      unitCost,
      estimatedCost: orderQty * unitCost,
      supplierId,
      supplierName,
      hasVelocityData: daily > 0,
    });
  }

  // Sort: critical first, then high, then medium; within each group by estimated cost desc
  const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  suggestions.sort((a, b) => {
    const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (uDiff !== 0) return uDiff;
    return b.estimatedCost - a.estimatedCost;
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  const criticalCount = suggestions.filter(s => s.urgency === "critical").length;
  const highCount = suggestions.filter(s => s.urgency === "high").length;
  const totalEstimatedCost = suggestions.reduce((s, r) => s + r.estimatedCost, 0);

  // Group by supplier for easy PO creation
  const bySupplier = new Map<string, { supplierId: string; supplierName: string; items: typeof suggestions; total: number }>();
  for (const s of suggestions) {
    if (!s.supplierId) continue;
    const key = s.supplierId;
    if (!bySupplier.has(key)) {
      bySupplier.set(key, { supplierId: key, supplierName: s.supplierName ?? "Unknown", items: [], total: 0 });
    }
    const group = bySupplier.get(key)!;
    group.items.push(s);
    group.total += s.estimatedCost;
  }

  const unassigned = suggestions.filter(s => !s.supplierId);

  return Response.json({
    velocityDays,
    leadDays,
    summary: {
      totalSuggestions: suggestions.length,
      criticalCount,
      highCount,
      totalEstimatedCost,
    },
    suggestions,
    bySupplier: Array.from(bySupplier.values()).sort((a, b) => b.total - a.total),
    unassigned,
  });
}
