import { prisma } from "@/lib/prisma";
import { buildDiagnosis } from "@/lib/vera-health";
import { getBaselines, expectedRevenueForDow, type Baselines } from "@/lib/vera-baselines";
import { startOfLocalDay, endOfLocalDay, localDow } from "@/lib/time";

// Shared end-of-day snapshot logic. Records each health dimension's score paired
// with the day's realized P&L so Vera can correlate them over time (lib/vera-weights)
// and learn which signals predict THIS restaurant's profit.
//
// Used by both the nightly cron (/api/cron/vera-snapshot) and the simulator
// (/api/simulate), which backfills a whole window at once so weight-learning has
// enough days to leave its "learning" phase.

const OPEN_HOUR = 11, CLOSE_HOUR = 22;
const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface SnapshotResult {
  date: string;
  overallScore: number;
  scores: string;
  actualRevenue: number;
  actualNet: number;
  actualMarginPct: number;
}

export interface SnapshotOpts {
  /** Reuse a preloaded baselines object to avoid recomputing per day during a backfill. */
  baselines?: Baselines;
  /** When the day has no real clock entries (e.g. simulated history), assume labor as a
   *  fraction of sales so the labor dimension and realized margin are believable. */
  assumeLaborPct?: number;
}

export async function snapshotDay(dateStr: string, tz: string, opts: SnapshotOpts = {}): Promise<SnapshotResult> {
  const dayStart = startOfLocalDay(dateStr, tz);
  const dayEnd = endOfLocalDay(dateStr, tz);
  const dow = localDow(dayStart, tz);

  const [sales, clock, flaggedItems, inv, e86] = await Promise.all([
    prisma.order.aggregate({ where: { status: "COMPLETED", createdAt: { gte: dayStart, lte: dayEnd } }, _sum: { total: true }, _count: true }),
    prisma.clockEntry.findMany({ where: { clockIn: { gte: dayStart, lte: dayEnd } }, include: { user: { select: { hourlyRate: true } } } }),
    // Void/comp dollars from the actually-flagged order items — the SAME source the
    // live /api/vera route uses (audit `amount` can be null on legacy rows and a
    // comped check zeroes the order total), so the learned weights train on the same
    // numbers the dashboard shows.
    prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: dayStart, lte: dayEnd } }, OR: [{ comped: true }, { voided: true }] },
      select: { unitPrice: true, quantity: true, comped: true, voided: true },
    }),
    prisma.inventoryItem.findMany({ take: 200 }),
    prisma.eightySixItem.count(),
  ]);

  const salesToday = Number(sales._sum.total ?? 0);
  let laborSoFar = 0;
  for (const c of clock) {
    const out = c.clockOut ? new Date(c.clockOut) : dayEnd;
    laborSoFar += Math.max(0, (out.getTime() - new Date(c.clockIn).getTime()) / 3.6e6) * Number(c.user.hourlyRate ?? 0);
  }
  // No real punches (simulated day) → assume labor as a share of sales so margin is realistic.
  if (laborSoFar === 0 && salesToday > 0 && opts.assumeLaborPct) {
    laborSoFar = salesToday * opts.assumeLaborPct;
  }

  const compTotal = flaggedItems.filter((i) => i.comped).reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const voidedOnly = flaggedItems.filter((i) => i.voided && !i.comped);
  const voidTotal = voidedOnly.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const low = inv.filter((i) => Number(i.quantity) <= Number(i.minThreshold) && Number(i.quantity) > 0).length;
  const oos = inv.filter((i) => Number(i.quantity) <= 0).length;

  const baselines = opts.baselines ?? (await getBaselines(dayStart, tz));
  const cfg = Object.fromEntries((await prisma.restaurantSettings.findMany({ where: { key: { in: ["fixedMonthlyCost", "targetFoodCostPct"] } } })).map((s) => [s.key, s.value]));
  const fixedMonthly = Number(cfg.fixedMonthlyCost);
  const foodPct = Number(cfg.targetFoodCostPct);

  // Diagnose the COMPLETED day (full service elapsed → final dimension scores).
  const diag = buildDiagnosis({
    nowHour: CLOSE_HOUR, openHour: OPEN_HOUR, closeHour: CLOSE_HOUR,
    salesToday, ordersToday: sales._count,
    expectedRevenue: expectedRevenueForDow(baselines, dow),
    expectedByNowFraction: 1,
    laborSoFar, scheduledLaborFullDay: laborSoFar > 0 ? laborSoFar : null,
    activeStaff: clock.length, confirmedCovers: 0, expectedCovers: null, openOrders: 0,
    outOfStockCount: oos, lowStockCount: low, active86Count: e86,
    voidTotal, voidCount: voidedOnly.length, compTotal, priceChangeCount: 0,
    fixedDailyOverride: fixedMonthly > 0 ? fixedMonthly / 30.4 : null,
    cogsTargetPct: foodPct > 0 ? foodPct / 100 : null,
    avgCheckToday: sales._count > 0 ? salesToday / sales._count : null,
    avgCheckMean: baselines.avgCheckMean, avgCheckStdev: baselines.avgCheckStdev,
    dowLabel: DOW_NAMES[dow],
  });

  const scores = Object.fromEntries(diag.dimensions.map((d) => [d.key, d.score]));
  const snap = {
    overallScore: diag.healthScore,
    scores: JSON.stringify(scores),
    actualRevenue: diag.projection.projectedRevenue,
    actualNet: diag.projection.projectedNet,
    actualMarginPct: diag.projection.projectedMarginPct,
  };
  await prisma.veraDaySnapshot.upsert({ where: { date: dateStr }, update: snap, create: { date: dateStr, ...snap } });
  return { date: dateStr, ...snap };
}
