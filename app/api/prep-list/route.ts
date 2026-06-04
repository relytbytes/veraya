import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getWasteStats, recommendPrep } from "@/lib/prep-waste";

// ── Helpers ───────────────────────────────────────────────────────────────────

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Target date — default to tomorrow
  const today = new Date();
  const defaultTarget = localISO(addDays(today, 1));
  const targetDateStr = searchParams.get("date") ?? defaultTarget;

  const targetDate = new Date(targetDateStr + "T00:00:00");
  const targetDOW = targetDate.getDay(); // 0=Sun … 6=Sat

  // How many historical same-DOW weeks to average
  const histWeeks = 6;

  // Build array of historical date ranges for the same DOW
  const histDates: { from: Date; to: Date }[] = [];
  for (let w = 1; w <= histWeeks; w++) {
    const d = new Date(targetDate);
    d.setDate(d.getDate() - w * 7);
    const from = new Date(d); from.setHours(0, 0, 0, 0);
    const to   = new Date(d); to.setHours(23, 59, 59, 999);
    histDates.push({ from, to });
  }

  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [historicalOrders, targetReservations, targetEvents, currentInventory] = await Promise.all([
    // All completed orders on same-DOW days
    prisma.order.findMany({
      where: {
        status: "COMPLETED",
        createdAt: {
          gte: histDates[histDates.length - 1].from,
          lte: histDates[0].to,
        },
      },
      include: {
        items: {
          where: { voided: false },
          include: {
            menuItem: {
              include: {
                category: { select: { name: true } },
                recipe: {
                  include: {
                    ingredient: {
                      select: { id: true, name: true, unit: true, costPerUnit: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),

    // Reservations on target date
    prisma.reservation.findMany({
      where: {
        date: targetDateStr,
        status: { in: ["CONFIRMED", "PENDING", "SEATED"] },
      },
      select: { partySize: true, status: true },
    }),

    // Confirmed special events / private dining on the target date (#7) — their
    // covers add demand the sales history alone can't see.
    prisma.event.findMany({
      where: { date: targetDateStr, status: "CONFIRMED" },
      select: {
        guestCount: true,
        ticketOrders: {
          where: { status: { in: ["PAID", "CHECKED_IN"] } },
          select: { items: { select: { quantity: true } } },
        },
      },
    }),

    // Current inventory
    prisma.inventoryItem.findMany({
      select: {
        ingredientId: true,
        quantity: true,
        minThreshold: true,
      },
    }),
  ]);

  // ── Filter historical orders to only same-DOW ──────────────────────────────
  const sameDOWOrders = historicalOrders.filter((o) => {
    const d = new Date(o.createdAt);
    return d.getDay() === targetDOW;
  });

  // Group by week (using createdAt date → week key) to get per-week counts
  const weekMap = new Map<string, typeof sameDOWOrders[0]["items"]>();
  for (const order of sameDOWOrders) {
    const key = localISO(new Date(order.createdAt));
    const existing = weekMap.get(key) ?? [];
    for (const item of order.items) existing.push(item);
    weekMap.set(key, existing);
  }

  const weeksWithData = weekMap.size;

  // ── Build item-level forecast ──────────────────────────────────────────────
  // Count how many of each menu item was sold on same-DOW days total
  const itemSales = new Map<string, {
    menuItemId: string;
    name: string;
    category: string;
    totalQty: number; // across all historical same-DOW instances
    recipe: {
      ingredientId: string;
      ingredientName: string;
      unit: string;
      costPerUnit: number;
      qtyPerServing: number; // recipe quantity per 1 menu item
    }[];
  }>();

  for (const [, items] of weekMap) {
    for (const orderItem of items) {
      const mi = orderItem.menuItem;
      if (!itemSales.has(mi.id)) {
        itemSales.set(mi.id, {
          menuItemId: mi.id,
          name: mi.name,
          category: mi.category.name,
          totalQty: 0,
          recipe: mi.recipe.map((r: { quantity: { toString(): string }; ingredient: { id: string; name: string; unit: string; costPerUnit: { toString(): string } } }) => ({
            ingredientId: r.ingredient.id,
            ingredientName: r.ingredient.name,
            unit: r.ingredient.unit,
            costPerUnit: Number(r.ingredient.costPerUnit),
            qtyPerServing: Number(r.quantity),
          })),
        });
      }
      const entry = itemSales.get(mi.id)!;
      entry.totalQty += orderItem.quantity;
    }
  }

  // ── Reservation + event adjustment factor ─────────────────────────────────
  const reservationCovers = targetReservations.reduce((s, r) => s + r.partySize, 0);
  // Each event contributes the larger of its stated headcount or its sold tickets.
  const eventCovers = targetEvents.reduce((s, e) => {
    const tickets = e.ticketOrders.reduce((t, o) => t + o.items.reduce((q, i) => q + i.quantity, 0), 0);
    return s + Math.max(e.guestCount ?? 0, tickets);
  }, 0);
  const confirmedCovers = reservationCovers + eventCovers;

  // Historical average covers = avg covers per same-DOW (approx from order count)
  const avgOrdersPerWeek = weeksWithData > 0 ? sameDOWOrders.length / weeksWithData : 0;

  // Simple adjustment: if we have significantly more or fewer covers booked,
  // scale proportionally. We use a blended approach: 70% history, 30% reservation signal.
  // If no historical data, use a flat 1.0 factor.
  let coverFactor = 1.0;
  if (confirmedCovers > 0 && avgOrdersPerWeek > 0) {
    // Rough heuristic: ~1.8 guests per order on average
    const estimatedHistoricalCovers = avgOrdersPerWeek * 1.8;
    const rawFactor = confirmedCovers / estimatedHistoricalCovers;
    // Clamp between 0.5× and 2.0×, blend 30% toward reservation signal
    const clampedFactor = Math.max(0.5, Math.min(2.0, rawFactor));
    coverFactor = 0.7 + 0.3 * clampedFactor;
  }

  // ── Build ingredient prep requirements ────────────────────────────────────
  const inventoryMap = new Map<string, { qty: number; minThreshold: number }>();
  for (const inv of currentInventory) {
    inventoryMap.set(inv.ingredientId, {
      qty: Number(inv.quantity),
      minThreshold: Number(inv.minThreshold),
    });
  }

  // Aggregate ingredient totals across all forecast menu items
  const ingredientTotals = new Map<string, {
    ingredientId: string;
    name: string;
    unit: string;
    costPerUnit: number;
    forecastQty: number;  // total quantity needed
    currentOnHand: number;
    minThreshold: number;
    prepNeeded: number;   // max(0, forecastQty - onHand + minThreshold)
    menuItems: string[];  // which menu items use this
  }>();

  for (const [, item] of itemSales) {
    if (item.recipe.length === 0) continue;
    // Average qty sold per historical same-DOW, adjusted by cover factor
    const avgQty = weeksWithData > 0
      ? (item.totalQty / weeksWithData) * coverFactor
      : 0;

    for (const r of item.recipe) {
      const id = r.ingredientId;
      if (!ingredientTotals.has(id)) {
        const inv = inventoryMap.get(id);
        ingredientTotals.set(id, {
          ingredientId: id,
          name: r.ingredientName,
          unit: r.unit,
          costPerUnit: r.costPerUnit,
          forecastQty: 0,
          currentOnHand: inv?.qty ?? 0,
          minThreshold: inv?.minThreshold ?? 0,
          prepNeeded: 0,
          menuItems: [],
        });
      }
      const entry = ingredientTotals.get(id)!;
      const needed = avgQty * r.qtyPerServing;
      entry.forecastQty += needed;
      if (!entry.menuItems.includes(item.name)) entry.menuItems.push(item.name);
    }
  }

  // Compute prepNeeded = how much to have ready (forecast + keep min on hand)
  for (const entry of ingredientTotals.values()) {
    // Need: forecastQty for service + minThreshold as buffer
    const totalNeeded = entry.forecastQty + entry.minThreshold;
    entry.prepNeeded = Math.max(0, totalNeeded - entry.currentOnHand);
  }

  // ── Waste learning ──────────────────────────────────────────────────────────
  // Blend in the end-of-day yield log: a learned waste rate trims over-prep and
  // surfaces chronic waste. Falls back to the plain recommendation until enough
  // days are logged.
  const wasteStats = await getWasteStats(Array.from(ingredientTotals.keys()), targetDateStr);
  const wasteByIngredient = new Map<string, ReturnType<typeof recommendPrep> & { preppedAvg: number; wastedAvg: number; wastedCostRecent: number }>();
  for (const entry of ingredientTotals.values()) {
    const stat = wasteStats.get(entry.ingredientId);
    const rec = recommendPrep(entry.forecastQty, entry.currentOnHand, entry.minThreshold, stat);
    wasteByIngredient.set(entry.ingredientId, {
      ...rec,
      preppedAvg: stat?.preppedAvg ?? 0,
      wastedAvg: stat?.wastedAvg ?? 0,
      wastedCostRecent: (stat?.wastedTotal ?? 0) * entry.costPerUnit,
    });
  }

  // ── Menu-item level forecast (for the "items to expect" section) ───────────
  const forecastItems = Array.from(itemSales.values())
    .filter((i) => i.recipe.length > 0)
    .map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      category: i.category,
      avgQty: weeksWithData > 0 ? Number(((i.totalQty / weeksWithData) * coverFactor).toFixed(1)) : 0,
      historicalQty: i.totalQty,
      weeksTracked: weeksWithData,
    }))
    .filter((i) => i.avgQty > 0)
    .sort((a, b) => b.avgQty - a.avgQty);

  // ── Prep rows ──────────────────────────────────────────────────────────────
  const prepRows = Array.from(ingredientTotals.values())
    .filter((r) => r.forecastQty > 0)
    .map((r) => {
      const w = wasteByIngredient.get(r.ingredientId);
      return {
        ...r,
        // Waste-aware fields (see lib/prep-waste). recommendedPrep is the value
        // to trust once a few days are logged; prepNeeded stays as the raw number.
        recommendedPrep: w?.recommendedPrep ?? r.prepNeeded,
        wasteRate: w?.wasteRate ?? 0,
        wasteDaysLogged: w?.daysLogged ?? 0,
        overPrep: w?.overPrep ?? false,
        hasWasteSignal: w?.hasSignal ?? false,
        recentPreppedAvg: w?.preppedAvg ?? 0,
        recentWastedAvg: w?.wastedAvg ?? 0,
        recentWastedCost: w?.wastedCostRecent ?? 0,
      };
    })
    .sort((a, b) => {
      // Sort: items that need prep first, then by prep quantity desc
      if (a.prepNeeded > 0 && b.prepNeeded === 0) return -1;
      if (b.prepNeeded > 0 && a.prepNeeded === 0) return 1;
      return b.forecastQty - a.forecastQty;
    });

  const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return Response.json({
    targetDate: targetDateStr,
    targetDOW: DOW_NAMES[targetDOW],
    weeksAnalyzed: weeksWithData,
    coverFactor: Number(coverFactor.toFixed(2)),
    confirmedCovers,
    reservationCovers,
    eventCovers,
    avgHistoricalOrders: Number(avgOrdersPerWeek.toFixed(1)),
    forecastItems,
    prepRows,
    summary: {
      totalItemsToPrep: prepRows.filter((r) => r.prepNeeded > 0).length,
      totalForecastCost: prepRows.reduce((s, r) => s + r.forecastQty * r.costPerUnit, 0),
      totalIngredients: prepRows.length,
      reservationCount: targetReservations.length,
      eventCount: targetEvents.length,
      eventCovers,
      // Waste learning rollups
      overPrepCount: prepRows.filter((r) => r.overPrep).length,
      recentWastedCost: Number(prepRows.reduce((s, r) => s + r.recentWastedCost, 0).toFixed(2)),
      wasteDaysLogged: Math.max(0, ...prepRows.map((r) => r.wasteDaysLogged)),
    },
  });
}
