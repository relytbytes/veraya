import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { localDateStr } from "@/lib/time";
import { getBaselines } from "@/lib/vera-baselines";
import { snapshotDay } from "@/lib/vera-snapshot";

// Seeding a long window touches thousands of rows + a per-day learning snapshot,
// so allow a long run (the platform caps this to the deployment's plan limit).
export const maxDuration = 300;

// Tax rate is loaded per-request from settings (fallback 8.75%)
async function getTaxRate(): Promise<number> {
  try {
    const s = await prisma.restaurantSettings.findUnique({ where: { key: "taxRate" } });
    return s ? Number(s.value) / 100 : 0.0875;
  } catch {
    return 0.0875;
  }
}

// Weighted random pick
function pick<T>(arr: T[], weights?: number[]): T {
  if (!weights) return arr[Math.floor(Math.random() * arr.length)];
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Realistic hourly traffic distribution (0–23)
const HOUR_WEIGHTS = [
  0, 0, 0, 0, 0, 0,   // 12a–5a  — closed
  0, 0, 0, 0, 0, 1,   // 6a–11a  — light
  4, 4, 2, 1, 2, 3,   // 12p–5p  — lunch + afternoon
  5, 5, 4, 3, 1, 0,   // 6p–11p  — dinner peak
];

function simulatedDate(baseDate: Date, hour?: number): Date {
  const d = new Date(baseDate);
  const h = hour ?? pick(Array.from({ length: 24 }, (_, i) => i), HOUR_WEIGHTS);
  d.setHours(h, randInt(0, 59), randInt(0, 59), 0);
  return d;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { days = 30, ordersPerDay = 25, clear = false, snapshots = true } = body as {
    days?: number;
    ordersPerDay?: number;
    clear?: boolean;
    snapshots?: boolean; // also backfill VeraDaySnapshot rows so weight-learning has history
  };

  // Safety caps
  const safeDays = Math.min(days, 90);
  const safeOrdersPerDay = Math.min(ordersPerDay, 100);
  const tz = await getRestaurantTz();

  if (clear) {
    // Delete simulated data — payments first (FK), then order items, then orders
    const simOrders = await prisma.order.findMany({
      where: { notes: { startsWith: "[SIM]" } },
      select: { id: true },
    });
    const ids = simOrders.map((o) => o.id);
    if (ids.length) {
      await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: ids } } });
    }
    // Snapshots in the simulated window were derived from those orders, so drop
    // them too — otherwise the learning history would reflect deleted revenue.
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = localDateStr(cutoff, tz);
    const snapDel = await prisma.veraDaySnapshot.deleteMany({ where: { date: { gte: cutoffStr } } });
    return Response.json({ cleared: ids.length, snapshotsCleared: snapDel.count });
  }

  // Load tax rate, menu items, and first user id
  const TAX_RATE = await getTaxRate();

  const [menuItems, user] = await Promise.all([
    prisma.menuItem.findMany({ where: { isActive: true }, select: { id: true, name: true, price: true } }),
    prisma.user.findFirst({ select: { id: true } }),
  ]);
  if (!menuItems.length) return Response.json({ error: "No menu items" }, { status: 400 });

  const userId = user?.id ?? null;

  // Item weight — mains ordered more than drinks/sides
  const itemWeights = menuItems.map((m) => {
    const p = Number(m.price);
    return p >= 20 ? 3 : p >= 10 ? 2 : 1;
  });

  const types: ("DINE_IN" | "TAKEOUT")[] = ["DINE_IN", "TAKEOUT"];
  const typeWeights = [0.65, 0.35];
  const payMethods: ("CREDIT" | "DEBIT" | "CASH")[] = ["CREDIT", "DEBIT", "CASH"];
  const payWeights = [0.55, 0.25, 0.20];

  let created = 0;

  // Build all order data upfront, then batch-insert per day (avoids N+1)
  for (let d = safeDays - 1; d >= 0; d--) {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - d);
    baseDate.setHours(0, 0, 0, 0);

    const dow = baseDate.getDay();
    const dayMultiplier = [0.9, 0.75, 0.85, 0.9, 1.0, 1.2, 1.15][dow];
    const count = Math.round(safeOrdersPerDay * dayMultiplier * (0.8 + Math.random() * 0.4));

    // Build order payloads for this day
    type OrderPayload = Parameters<typeof prisma.order.create>[0]["data"];
    const dayOrders: OrderPayload[] = [];

    for (let i = 0; i < count; i++) {
      const type = pick(types, typeWeights);
      const itemCount = randInt(1, 4);
      // Pick distinct items weighted by price so mains/entrees show up more often
      // than cheap sides — gives Vera's menu-mix insights a realistic distribution.
      const menuIdx = menuItems.map((_, idx) => idx);
      const selected = new Set<number>();
      let guard = 0;
      while (selected.size < Math.min(itemCount, menuItems.length) && guard++ < 50) {
        selected.add(pick(menuIdx, itemWeights));
      }

      const items = Array.from(selected).map((idx) => ({
        menuItemId: menuItems[idx].id,
        quantity: randInt(1, 3),
        unitPrice: Number(menuItems[idx].price),
      }));

      const subtotal = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
      const tax = subtotal * TAX_RATE;
      const total = subtotal + tax;
      const createdAt = simulatedDate(baseDate);
      const payMethod = pick(payMethods, payWeights);

      dayOrders.push({
        userId,
        type,
        status: "COMPLETED",
        notes: "[SIM] Simulated order",
        subtotal,
        tax,
        total,
        createdAt,
        updatedAt: createdAt,
        closedAt: createdAt,
        items: { create: items },
        payments: { create: { amount: total, method: payMethod, createdAt } },
      });
    }

    // Batch-create this day's orders concurrently (max 10 at a time)
    const BATCH = 10;
    for (let b = 0; b < dayOrders.length; b += BATCH) {
      await Promise.all(
        dayOrders.slice(b, b + BATCH).map((data) => prisma.order.create({ data }))
      );
    }
    created += dayOrders.length;
  }

  // Backfill a learning snapshot for each completed simulated day. This is what
  // lets Vera's weight model leave its "learning" phase (needs 14+ days) — each
  // snapshot pairs the day's dimension scores with its realized margin so the
  // engine can correlate which signals predict profit for THIS venue.
  let snapshotsCreated = 0;
  if (snapshots) {
    const baselines = await getBaselines(new Date(), tz); // compute once, reuse per day
    for (let d = safeDays - 1; d >= 1; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      const dateStr = localDateStr(day, tz);
      // Vary assumed labor 22–36% of sales so the labor dimension and margins move
      // day to day — flat inputs would give the correlation nothing to learn from.
      const assumeLaborPct = 0.22 + Math.random() * 0.14;
      try {
        await snapshotDay(dateStr, tz, { baselines, assumeLaborPct });
        snapshotsCreated++;
      } catch {
        /* skip a bad day rather than fail the whole seed */
      }
    }
  }

  return Response.json({ created, days: safeDays, ordersPerDay: safeOrdersPerDay, snapshotsCreated });
}
