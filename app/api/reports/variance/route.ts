import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { rangeFromParams } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

export async function GET(req: NextRequest) {
  { const s = await auth(); const r = (s?.user as { role?: string })?.role ?? ""; if (!s || !["ADMIN", "MANAGER"].includes(r)) return Response.json({ error: "Forbidden" }, { status: 403 }); }
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!from || !to) {
    return Response.json({ error: "from and to date params required" }, { status: 400 });
  }

  const tz = await getRestaurantTz();
  const { start: fromDate, end: toDate } = rangeFromParams(from, to, tz);

  // ── Fetch all data in parallel ─────────────────────────────────────────────

  const [completedOrders, inventoryTransactions, currentInventory, purchaseOrderItems] = await Promise.all([
    // All completed orders in range with items + recipe data
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: fromDate, lte: toDate } },
      include: {
        items: {
          where: { voided: false },
          include: {
            menuItem: {
              include: {
                recipe: {
                  include: { ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
                },
              },
            },
          },
        },
      },
    }),

    // Inventory transactions in range (USED, WASTED, ADJUSTED, RECEIVED)
    prisma.inventoryTransaction.findMany({
      where: { createdAt: { gte: fromDate, lte: toDate } },
      include: { ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
    }),

    // Current inventory levels
    prisma.inventoryItem.findMany({
      include: { ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
    }),

    // Purchase order items received in period (for received qty)
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { status: "RECEIVED", receivedAt: { gte: fromDate, lte: toDate } } },
      include: { ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } } },
    }),
  ]);

  // ── Compute theoretical usage ──────────────────────────────────────────────

  // Map: ingredientId → { name, unit, costPerUnit, theoreticalQty }
  const theoretical = new Map<string, {
    ingredientId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    theoreticalQty: number;
    menuItemCount: number; // how many distinct menu items use this ingredient
  }>();

  for (const order of completedOrders) {
    for (const orderItem of order.items) {
      for (const recipe of orderItem.menuItem.recipe) {
        const key = recipe.ingredientId;
        const used = Number(recipe.quantity) * orderItem.quantity;
        if (!theoretical.has(key)) {
          theoretical.set(key, {
            ingredientId: key,
            name: recipe.ingredient.name,
            unit: recipe.ingredient.unit,
            costPerUnit: Number(recipe.ingredient.costPerUnit),
            theoreticalQty: 0,
            menuItemCount: 0,
          });
        }
        theoretical.get(key)!.theoreticalQty += used;
        theoretical.get(key)!.menuItemCount++;
      }
    }
  }

  // ── Compute actual usage from transactions ─────────────────────────────────

  // USED and WASTED = depletion. RECEIVED and ADJUSTED are not "usage".
  const actualUsed = new Map<string, number>();
  const receivedQty = new Map<string, number>();

  for (const tx of inventoryTransactions) {
    const id = tx.ingredientId;
    const qty = Number(tx.quantity);

    if (tx.type === "USED" || tx.type === "WASTED") {
      actualUsed.set(id, (actualUsed.get(id) ?? 0) + Math.abs(qty));
    }
    if (tx.type === "RECEIVED") {
      receivedQty.set(id, (receivedQty.get(id) ?? 0) + Math.abs(qty));
    }
  }

  // Also count PO received items (in case they weren't logged as transactions)
  const poReceived = new Map<string, number>();
  for (const item of purchaseOrderItems) {
    const id = item.ingredientId;
    poReceived.set(id, (poReceived.get(id) ?? 0) + Number(item.quantity));
  }

  // Current on-hand map
  const onHandMap = new Map<string, { qty: number; minThreshold: number }>();
  for (const inv of currentInventory) {
    onHandMap.set(inv.ingredientId, {
      qty: Number(inv.quantity),
      minThreshold: Number(inv.minThreshold),
    });
  }

  // ── Build variance rows ────────────────────────────────────────────────────

  // We include any ingredient that either:
  //   a) Has theoretical usage > 0 (from POS sales + recipes)
  //   b) Has actual USED/WASTED transactions in the period

  const allIngredientIds = new Set([
    ...theoretical.keys(),
    ...actualUsed.keys(),
  ]);

  interface VarianceRow {
    ingredientId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    theoreticalQty: number;
    actualUsedQty: number;      // from explicit USED/WASTED transactions
    poReceivedQty: number;      // received in period via POs
    currentOnHand: number;
    minThreshold: number;
    hasActualData: boolean;     // true = we have explicit transaction data
    // When we have actual data:
    variance: number;           // actual - theoretical (positive = over-consumed vs sales)
    variancePct: number;
    varianceCost: number;
    severity: "ok" | "warn" | "alert"; // based on variancePct
  }

  const rows: VarianceRow[] = [];

  for (const id of allIngredientIds) {
    const th = theoretical.get(id);
    const actual = actualUsed.get(id) ?? 0;
    const received = poReceived.get(id) ?? 0;
    const inv = onHandMap.get(id);
    const costPerUnit = th?.costPerUnit ?? 0;
    const theoreticalQty = th?.theoreticalQty ?? 0;
    const name = th?.name ?? "Unknown";
    const unit = th?.unit ?? "";
    const hasActualData = (actualUsed.get(id) ?? 0) > 0;

    // Variance = actual_depleted - theoretical_depleted
    // Positive variance = more was consumed than sales explain (shrinkage, waste, over-pours)
    // Only meaningful when we have actual USED/WASTED transaction data
    const variance = hasActualData ? actual - theoreticalQty : 0;
    const variancePct = theoreticalQty > 0 ? (variance / theoreticalQty) * 100 : 0;
    const varianceCost = Math.abs(variance) * costPerUnit;

    let severity: "ok" | "warn" | "alert" = "ok";
    if (hasActualData) {
      if (Math.abs(variancePct) > 20) severity = "alert";
      else if (Math.abs(variancePct) > 10) severity = "warn";
    }

    rows.push({
      ingredientId: id,
      name,
      unit,
      costPerUnit,
      theoreticalQty,
      actualUsedQty: actual,
      poReceivedQty: received,
      currentOnHand: inv?.qty ?? 0,
      minThreshold: inv?.minThreshold ?? 0,
      hasActualData,
      variance,
      variancePct,
      varianceCost,
      severity,
    });
  }

  // Sort: alerts first, then by variance cost descending, then alphabetical
  rows.sort((a, b) => {
    const sevOrder = { alert: 0, warn: 1, ok: 2 };
    if (a.severity !== b.severity) return sevOrder[a.severity] - sevOrder[b.severity];
    if (Math.abs(b.varianceCost) !== Math.abs(a.varianceCost)) return Math.abs(b.varianceCost) - Math.abs(a.varianceCost);
    return a.name.localeCompare(b.name);
  });

  // ── Summary ────────────────────────────────────────────────────────────────

  const rowsWithActual = rows.filter(r => r.hasActualData);
  const totalTheoreticalCost = rows.reduce((s, r) => s + r.theoreticalQty * r.costPerUnit, 0);
  const totalVarianceCost = rowsWithActual.reduce((s, r) => s + r.varianceCost, 0);
  const alertCount = rows.filter(r => r.severity === "alert").length;
  const warnCount  = rows.filter(r => r.severity === "warn").length;
  const hasAnyActualData = rowsWithActual.length > 0;

  return Response.json({
    period: { from, to },
    summary: {
      totalTheoreticalCost,
      totalVarianceCost,
      alertCount,
      warnCount,
      hasAnyActualData,
      ingredientsTracked: rows.length,
      ordersAnalyzed: completedOrders.length,
    },
    rows,
  });
}
