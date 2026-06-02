import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildDiagnosis } from "@/lib/vera-health";
import { getBaselines, expectedRevenueForDow } from "@/lib/vera-baselines";

// POST/GET /api/cron/vera-snapshot
//
// Records an end-of-day snapshot: each health dimension's score paired with the
// day's realized P&L. Vera correlates these over time (lib/vera-weights) to
// learn which signals predict THIS restaurant's profit. Run nightly after close.
//
// Auth: CRON_SECRET (?secret= / Bearer) OR a logged-in session (manual trigger).
// Idempotent — upserts by date. ?date=YYYY-MM-DD to backfill a specific day.

const OPEN_HOUR = 11, CLOSE_HOUR = 22;
function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorized = (secret && provided === secret) || !!(await auth());
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = url.searchParams.get("date");
  const target = dateParam ? new Date(dateParam + "T12:00:00") : new Date();
  const dateStr = localDateStr(target);
  const dayStart = new Date(target); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(target); dayEnd.setHours(23, 59, 59, 999);
  const dow = target.getDay();

  const [sales, clock, audit, inv, e86] = await Promise.all([
    prisma.order.aggregate({ where: { status: "COMPLETED", createdAt: { gte: dayStart, lte: dayEnd } }, _sum: { total: true }, _count: true }),
    prisma.clockEntry.findMany({ where: { clockIn: { gte: dayStart, lte: dayEnd } }, include: { user: { select: { hourlyRate: true } } } }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
    prisma.inventoryItem.findMany({ take: 200 }),
    prisma.eightySixItem.count(),
  ]);

  const salesToday = Number(sales._sum.total ?? 0);
  let laborSoFar = 0;
  for (const c of clock) {
    const out = c.clockOut ? new Date(c.clockOut) : dayEnd;
    laborSoFar += Math.max(0, (out.getTime() - new Date(c.clockIn).getTime()) / 3.6e6) * Number(c.user.hourlyRate ?? 0);
  }
  const voids = audit.filter((a) => a.action === "VOID");
  const voidTotal = voids.reduce((s, a) => s + Number(a.amount ?? 0), 0);
  const compTotal = audit.filter((a) => a.action === "COMP").reduce((s, a) => s + Number(a.amount ?? 0), 0);
  const low = inv.filter((i) => Number(i.quantity) <= Number(i.minThreshold) && Number(i.quantity) > 0).length;
  const oos = inv.filter((i) => Number(i.quantity) <= 0).length;

  const baselines = await getBaselines(target);
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
    voidTotal, voidCount: voids.length, compTotal, priceChangeCount: 0,
    fixedDailyOverride: fixedMonthly > 0 ? fixedMonthly / 30.4 : null,
    cogsTargetPct: foodPct > 0 ? foodPct / 100 : null,
    avgCheckToday: sales._count > 0 ? salesToday / sales._count : null,
    avgCheckMean: baselines.avgCheckMean, avgCheckStdev: baselines.avgCheckStdev,
    dowLabel: target.toLocaleDateString("en-US", { weekday: "long" }),
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

  return Response.json({ ok: true, date: dateStr, ...snap });
}

export const GET = handle;
export const POST = handle;
