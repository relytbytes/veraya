// ─────────────────────────────────────────────────────────────────────────────
// Vera learned baselines
//
// Turns the restaurant's own sales history into a sense of "normal": per
// day-of-week revenue (mean + spread), the intraday revenue curve (how the day
// fills in hour by hour), and an average-check distribution. This is what lets
// Vera say "you're behind a normal Friday by 7pm" instead of using a flat clock
// fraction, and flag what's unusual against THIS restaurant's variance.
//
// Recomputed at most every 30 minutes (cached on globalThis to survive HMR).
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "./prisma";
import { nowInTZ, localDateStr as tzDateStr, localDow, dayWindow } from "./time";

const WINDOW_DAYS = 84;        // ~12 weeks
const TTL_MS = 30 * 60 * 1000; // recompute at most every 30 min

export interface DowProfile {
  dow: number;
  sampleDays: number;
  meanRevenue: number;
  stdevRevenue: number;
  /** Fraction of the day's revenue completed by the END of each hour (len 24, → 1.0). */
  cumByEndOfHour: number[];
}

export interface Baselines {
  generatedAt: number;
  totalDays: number;          // total distinct days sampled
  byDow: Record<number, DowProfile>;
  avgCheckMean: number | null;
  avgCheckStdev: number | null;
}

const localDateStr = (d: Date, tz?: string) => tzDateStr(d, tz); // restaurant-local calendar day
function mean(xs: number[]) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function stdev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

type Cache = { at: number; dayKey: string; data: Baselines };
const g = globalThis as unknown as { __veraBaselines?: Cache };

export async function getBaselines(now: Date = new Date(), tz?: string): Promise<Baselines> {
  const dayKey = localDateStr(now, tz);
  const cached = g.__veraBaselines;
  if (cached && cached.dayKey === dayKey && Date.now() - cached.at < TTL_MS) return cached.data;

  const data = await computeBaselines(now, tz);
  g.__veraBaselines = { at: Date.now(), dayKey, data };
  return data;
}

async function computeBaselines(now: Date, tz?: string): Promise<Baselines> {
  const { start: todayStart } = dayWindow(now, tz); // local midnight today
  const { start } = dayWindow(new Date(now.getTime() - WINDOW_DAYS * 86400_000), tz);

  const orders = await prisma.order.findMany({
    where: { status: "COMPLETED", createdAt: { gte: start, lt: todayStart } },
    select: { createdAt: true, total: true },
    take: 20000,
  });

  // Bucket per local day: total revenue, order count, and revenue-by-hour.
  type Day = { dow: number; revenue: number; orders: number; byHour: number[] };
  const days = new Map<string, Day>();
  for (const o of orders) {
    const d = new Date(o.createdAt);
    const local = nowInTZ(d, tz); // read local wall-clock fields via getUTC*
    const key = localDateStr(d, tz);
    let day = days.get(key);
    if (!day) { day = { dow: localDow(d, tz), revenue: 0, orders: 0, byHour: new Array(24).fill(0) }; days.set(key, day); }
    const t = Number(o.total);
    day.revenue += t;
    day.orders += 1;
    day.byHour[local.getUTCHours()] += t;
  }

  const allDays = [...days.values()].filter((d) => d.revenue > 0);

  // Average check distribution (across all sampled days).
  const checks = allDays.filter((d) => d.orders > 0).map((d) => d.revenue / d.orders);
  const avgCheckMean = checks.length ? mean(checks) : null;
  const avgCheckStdev = checks.length >= 2 ? stdev(checks) : null;

  const byDow: Record<number, DowProfile> = {};
  for (let dow = 0; dow < 7; dow++) {
    const ds = allDays.filter((d) => d.dow === dow);
    if (ds.length === 0) continue;
    const revs = ds.map((d) => d.revenue);

    // Average each day's normalized cumulative-by-hour curve.
    const cumAccum = new Array(24).fill(0);
    for (const d of ds) {
      let run = 0;
      for (let h = 0; h < 24; h++) { run += d.byHour[h]; cumAccum[h] += d.revenue > 0 ? run / d.revenue : 0; }
    }
    const cumByEndOfHour = cumAccum.map((c) => c / ds.length);

    byDow[dow] = {
      dow,
      sampleDays: ds.length,
      meanRevenue: mean(revs),
      stdevRevenue: stdev(revs),
      cumByEndOfHour,
    };
  }

  return { generatedAt: Date.now(), totalDays: allDays.length, byDow, avgCheckMean, avgCheckStdev };
}

/** Expected full-day revenue for a day-of-week (null if no history). */
export function expectedRevenueForDow(b: Baselines, dow: number): number | null {
  return b.byDow[dow]?.meanRevenue ?? null;
}

/** Learned fraction of the day's revenue that should be in by `hourFloat` (e.g. 19.5). */
export function expectedFractionByNow(b: Baselines, dow: number, hourFloat: number): number | null {
  const p = b.byDow[dow];
  if (!p) return null;
  const h = Math.floor(hourFloat);
  if (h <= 0) return 0;
  if (h >= 23) return 1;
  const prev = p.cumByEndOfHour[h - 1] ?? 0;
  const cur = p.cumByEndOfHour[h] ?? prev;
  const frac = prev + (cur - prev) * (hourFloat - h);
  return Math.max(0, Math.min(1, frac));
}

/** z-score of a value against a learned mean/stdev (null if undefined). */
export function zScore(value: number, m: number | null, sd: number | null): number | null {
  if (m === null || sd === null || sd < 1e-6) return null;
  return (value - m) / sd;
}
