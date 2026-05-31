import { prisma } from "@/lib/prisma";

// No auth — kitchen/POS need this; read-only signal data

export async function GET() {
  const now = new Date();

  // ── Today's boundaries ────────────────────────────────────────────────────
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const hoursElapsed = now.getHours() + now.getMinutes() / 60;
  // Service typically ends around 22:00; estimate hours remaining in service
  const serviceEndHour = 22;
  const hoursRemaining = Math.max(0, serviceEndHour - now.getHours() - now.getMinutes() / 60);

  // ── Fetch in parallel ─────────────────────────────────────────────────────
  const [todayOrders, currentInventory, active86s] = await Promise.all([
    // Today's completed + active orders with recipe data
    prisma.order.findMany({
      where: {
        status: { in: ["COMPLETED", "OPEN", "IN_PROGRESS", "READY"] },
        createdAt: { gte: todayStart },
      },
      select: {
        items: {
          where: { voided: false },
          select: {
            quantity: true,
            menuItem: {
              select: {
                id: true,
                name: true,
                recipe: {
                  select: {
                    quantity: true,
                    ingredient: {
                      select: { id: true, name: true, unit: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),

    // Current on-hand inventory
    prisma.inventoryItem.findMany({
      where: { ingredient: { isActive: true } },
      select: {
        ingredientId: true,
        quantity: true,
        minThreshold: true,
        ingredient: { select: { id: true, name: true, unit: true } },
      },
    }),

    // Already 86'd items (to avoid double-reporting)
    prisma.eightySixItem.findMany({
      select: { menuItemId: true, menuItem: { select: { name: true } } },
    }),
  ]);

  // ── Compute how much of each ingredient was consumed today ───────────────
  const consumedToday = new Map<string, number>(); // ingredientId → qty used

  for (const order of todayOrders) {
    for (const oi of order.items) {
      for (const recipe of oi.menuItem.recipe) {
        const id = recipe.ingredient.id;
        const qty = Number(recipe.quantity) * oi.quantity;
        consumedToday.set(id, (consumedToday.get(id) ?? 0) + qty);
      }
    }
  }

  // Also factor in confirmed recipe → menu item → count sold
  // Build: menuItemId → units sold today
  const menuItemSoldToday = new Map<string, number>();
  for (const order of todayOrders) {
    for (const oi of order.items) {
      const id = oi.menuItem.id;
      menuItemSoldToday.set(id, (menuItemSoldToday.get(id) ?? 0) + oi.quantity);
    }
  }

  // ── Hourly depletion rate for each ingredient ────────────────────────────
  // Rate = consumed_today / hours_elapsed
  const depletionRatePerHour = new Map<string, number>();
  for (const [id, consumed] of consumedToday) {
    if (hoursElapsed > 0) {
      depletionRatePerHour.set(id, consumed / hoursElapsed);
    }
  }

  // ── Inventory map ─────────────────────────────────────────────────────────
  const inventoryMap = new Map<string, {
    ingredientId: string;
    name: string;
    unit: string;
    currentQty: number;
    minThreshold: number;
  }>();
  for (const inv of currentInventory) {
    inventoryMap.set(inv.ingredientId, {
      ingredientId: inv.ingredientId,
      name: inv.ingredient.name,
      unit: inv.ingredient.unit,
      currentQty: Number(inv.quantity),
      minThreshold: Number(inv.minThreshold),
    });
  }

  // ── Build predictions ─────────────────────────────────────────────────────
  const active86Set = new Set(active86s.map(x => x.menuItemId));

  // For each ingredient being depleted today, compute hours until it hits min
  const predictions: {
    ingredientId: string;
    name: string;
    unit: string;
    currentQty: number;
    depletionRatePerHour: number;
    hoursUntilMin: number | null;
    estimatedRunsOut: string | null; // ISO time string
    severity: "out" | "critical" | "warn" | "ok";
    affectedMenuItems: string[];
    consumedToday: number;
  }[] = [];

  for (const [id, rate] of depletionRatePerHour) {
    if (rate <= 0) continue;
    const inv = inventoryMap.get(id);
    if (!inv) continue;

    const usableQty = Math.max(0, inv.currentQty - inv.minThreshold);
    const hoursUntilMin = usableQty / rate;

    // Estimate actual time it runs out
    const runsOutAt = new Date(now.getTime() + hoursUntilMin * 3600 * 1000);
    const estimatedRunsOut = runsOutAt.toISOString();

    let severity: "out" | "critical" | "warn" | "ok" = "ok";
    if (inv.currentQty <= 0) severity = "out";
    else if (hoursUntilMin <= 1) severity = "critical";
    else if (hoursUntilMin <= hoursRemaining) severity = "warn";

    if (severity === "ok") continue; // Only report items at risk

    // Find which menu items use this ingredient
    const affectedMenuItems: string[] = [];
    for (const order of todayOrders) {
      for (const oi of order.items) {
        if (oi.menuItem.recipe.some(r => r.ingredient.id === id)) {
          const name = oi.menuItem.name;
          if (!affectedMenuItems.includes(name)) affectedMenuItems.push(name);
        }
      }
    }

    predictions.push({
      ingredientId: id,
      name: inv.name,
      unit: inv.unit,
      currentQty: inv.currentQty,
      depletionRatePerHour: rate,
      hoursUntilMin: Number(hoursUntilMin.toFixed(2)),
      estimatedRunsOut,
      severity,
      affectedMenuItems,
      consumedToday: consumedToday.get(id) ?? 0,
    });
  }

  // Sort: out first → critical → warn, then by hoursUntilMin ascending
  const sevOrder: Record<string, number> = { out: 0, critical: 1, warn: 2, ok: 3 };
  predictions.sort((a, b) => {
    const sd = sevOrder[a.severity] - sevOrder[b.severity];
    if (sd !== 0) return sd;
    return (a.hoursUntilMin ?? 999) - (b.hoursUntilMin ?? 999);
  });

  const criticalCount = predictions.filter(p => p.severity === "critical" || p.severity === "out").length;
  const warnCount = predictions.filter(p => p.severity === "warn").length;

  return Response.json({
    generatedAt: now.toISOString(),
    hoursElapsed: Number(hoursElapsed.toFixed(2)),
    hoursRemaining: Number(hoursRemaining.toFixed(2)),
    active86Count: active86s.length,
    predictions,
    summary: {
      criticalCount,
      warnCount,
      totalAtRisk: predictions.length,
    },
  });
}
