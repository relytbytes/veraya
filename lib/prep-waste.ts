// Prep & waste learning — turns the end-of-day yield log (PrepWasteLog) into a
// per-ingredient waste rate so the prep forecast can self-calibrate.
//
// The forecast predicts demand from sales history. On its own it can't see that
// the kitchen consistently preps a double batch of demi-glace and bins half of
// it. Once cooks log what they actually prepped vs. wasted, we can:
//   • compute a recent waste rate (wasted ÷ prepped),
//   • net usable carryover (on-hand) out of the recommendation, and
//   • flag chronic over-prep so batch sizes get trimmed.
//
// It's "manual input for a few weeks" by design — the rate is only meaningful
// once a handful of days are logged; until then we fall back to the plain
// demand-minus-on-hand recommendation.

import { prisma } from "@/lib/prisma";

export interface WasteStat {
  ingredientId: string;
  preppedTotal: number;
  wastedTotal: number;
  wasteRate: number; // wastedTotal / preppedTotal, 0..1
  daysLogged: number;
  preppedAvg: number; // per logged day
  wastedAvg: number;
}

const LOOKBACK_DAYS = 42; // ~6 weeks of history
const MIN_DAYS_FOR_SIGNAL = 3; // below this, a waste rate isn't trustworthy
const OVERPREP_THRESHOLD = 0.12; // >12% wasted = chronic over-prep flag

function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Waste stats per ingredient over the lookback window ending the day before
 * `targetDateISO` (the target service day itself isn't logged yet).
 */
export async function getWasteStats(
  ingredientIds: string[],
  targetDateISO: string,
): Promise<Map<string, WasteStat>> {
  const out = new Map<string, WasteStat>();
  if (ingredientIds.length === 0) return out;

  const from = shiftISO(targetDateISO, -LOOKBACK_DAYS);
  const to = shiftISO(targetDateISO, -1);

  const logs = await prisma.prepWasteLog.findMany({
    where: { ingredientId: { in: ingredientIds }, date: { gte: from, lte: to } },
    select: { ingredientId: true, preppedQty: true, wastedQty: true },
  });

  const agg = new Map<string, { prepped: number; wasted: number; days: number }>();
  for (const l of logs) {
    const e = agg.get(l.ingredientId) ?? { prepped: 0, wasted: 0, days: 0 };
    e.prepped += Number(l.preppedQty);
    e.wasted += Number(l.wastedQty);
    e.days += 1;
    agg.set(l.ingredientId, e);
  }

  for (const [id, e] of agg) {
    const wasteRate = e.prepped > 0 ? Math.min(1, e.wasted / e.prepped) : 0;
    out.set(id, {
      ingredientId: id,
      preppedTotal: round2(e.prepped),
      wastedTotal: round2(e.wasted),
      wasteRate: Math.round(wasteRate * 1000) / 1000,
      daysLogged: e.days,
      preppedAvg: e.days ? round2(e.prepped / e.days) : 0,
      wastedAvg: e.days ? round2(e.wasted / e.days) : 0,
    });
  }
  return out;
}

export interface WasteRollup {
  overPrepCount: number;     // ingredients chronically over-prepped (trustworthy signal)
  recentWastedCost: number;  // $ of prepped product wasted over the lookback
  wasteDaysLogged: number;   // most days logged for any one ingredient (signal strength)
}

/**
 * Venue-wide waste rollup for Vera's Cost dimension — independent of any single
 * day's forecast. Aggregates the yield log over the lookback window and flags
 * ingredients whose waste rate is high enough, often enough, to act on.
 */
export async function getWasteRollup(targetDateISO: string): Promise<WasteRollup> {
  const from = shiftISO(targetDateISO, -LOOKBACK_DAYS);
  const to = shiftISO(targetDateISO, -1);

  const logs = await prisma.prepWasteLog.findMany({
    where: { date: { gte: from, lte: to } },
    select: { ingredientId: true, preppedQty: true, wastedQty: true, ingredient: { select: { costPerUnit: true } } },
  });

  const agg = new Map<string, { prepped: number; wasted: number; days: number; cost: number }>();
  for (const l of logs) {
    const e = agg.get(l.ingredientId) ?? { prepped: 0, wasted: 0, days: 0, cost: Number(l.ingredient.costPerUnit) };
    e.prepped += Number(l.preppedQty);
    e.wasted += Number(l.wastedQty);
    e.days += 1;
    agg.set(l.ingredientId, e);
  }

  let overPrepCount = 0;
  let recentWastedCost = 0;
  let wasteDaysLogged = 0;
  for (const e of agg.values()) {
    const rate = e.prepped > 0 ? e.wasted / e.prepped : 0;
    if (e.days >= MIN_DAYS_FOR_SIGNAL && rate >= OVERPREP_THRESHOLD) overPrepCount += 1;
    recentWastedCost += e.wasted * e.cost;
    wasteDaysLogged = Math.max(wasteDaysLogged, e.days);
  }
  return {
    overPrepCount,
    recentWastedCost: round2(recentWastedCost),
    wasteDaysLogged,
  };
}

export interface PrepRecommendation {
  recommendedPrep: number; // waste/carryover-aware target to prep for the day
  wasteRate: number; // 0..1 (0 if no signal yet)
  daysLogged: number;
  overPrep: boolean; // chronic over-prep flagged
  hasSignal: boolean; // enough logged days to trust the rate
}

/**
 * Blend the demand forecast with the learned waste rate and on-hand carryover
 * into a single "prep this much" number.
 *
 * Base need = demand + buffer − usable on-hand (carryover). When a trustworthy
 * waste rate exists we nudge the buffer: chronic over-prep shrinks it (stop
 * making what you bin), while a clean record keeps the standard safety margin.
 */
export function recommendPrep(
  forecastQty: number,
  currentOnHand: number,
  minThreshold: number,
  stat: WasteStat | undefined,
): PrepRecommendation {
  const hasSignal = !!stat && stat.daysLogged >= MIN_DAYS_FOR_SIGNAL;
  const wasteRate = stat?.wasteRate ?? 0;
  const overPrep = hasSignal && wasteRate >= OVERPREP_THRESHOLD;

  // Buffer scales from the configured min threshold; trim it when we know the
  // kitchen over-preps, but never below zero.
  const bufferFactor = overPrep ? Math.max(0, 1 - wasteRate) : 1;
  const buffer = minThreshold * bufferFactor;

  const recommendedPrep = Math.max(0, forecastQty + buffer - currentOnHand);
  return {
    recommendedPrep: round2(recommendedPrep),
    wasteRate,
    daysLogged: stat?.daysLogged ?? 0,
    overPrep,
    hasSignal,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
