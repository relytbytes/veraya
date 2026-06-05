// Vera demand forecasting — the model core, kept pure and tunable so the same
// code that serves /api/vera/forecast can be replayed by the backtest harness
// (/api/vera/forecast/backtest) to measure accuracy and tune parameters.
//
// Method (interpretable, not a black box):
//   1. Same-weekday seasonal samples, each weighted by exponential recency decay.
//   2. A damped trend term (recent same-weekdays vs older ones) nudges the level.
//   3. Demand signals: confirmed reservations and booked events add covers/sales
//      on top of the organic baseline.
//   4. Confidence reflects BOTH sample count and dispersion (coefficient of
//      variation), so a noisy history is reported as low-confidence honestly.
//
// Every magic number lives in ForecastParams so the backtest can sweep them.

export interface OrderLite {
  total: number;
  createdAt: Date;
  items?: { quantity: number; name: string }[];
}

export interface DowSample {
  dateStr: string;
  weeksAgo: number; // integer weeks before the target day
  sales: number;
  orders: number;
  items: Map<string, number>;
}

export interface ForecastParams {
  decayPerWeek: number;      // 0..1 exponential recency weight (1 = flat mean, no decay)
  maxSamples: number;        // cap on same-weekday samples used
  trendBlend: number;        // 0..1 how much the damped trend moves the level
  trendCap: number;          // clamp on the trend slope (e.g. 0.4 = ±40%)
  avgPartySize: number;      // covers per ticket, to reconcile reservations (people) with orders (tickets)
  bookingShare: number;      // fraction of covers that typically reserve ahead (scales bookings → total)
  serviceLevel: number;      // 0..1 newsvendor target: prep to this demand quantile (waste vs stockout balance)
}

export const DEFAULT_PARAMS: ForecastParams = {
  decayPerWeek: 0.82,
  maxSamples: 10,
  trendBlend: 0.25,
  trendCap: 0.4,
  avgPartySize: 2.3,
  bookingShare: 0.45,
  serviceLevel: 0.75,
};

// Inverse standard-normal CDF (Acklam's approximation) — maps a service level
// (e.g. 0.75) to the z-score used for newsvendor prep quantiles.
export function invNormCdf(p: number): number {
  if (p <= 0) return -3.5;
  if (p >= 1) return 3.5;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= 1 - pl) { const q = p - 0.5, r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

export interface PrepItem { name: string; suggestedQty: number; basis: string }

export interface ForecastResult {
  projectedSales: number;
  projectedCovers: number;
  baseSales: number;          // organic same-weekday projection before signals
  reservedCovers: number;
  eventCovers: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high";
  cv: number | null;          // coefficient of variation of the samples (dispersion)
  trendPct: number;           // signed trend applied (e.g. +0.08 = rising 8%)
  prep: PrepItem[];
  method: string;
}

const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Bucket completed orders into same-weekday daily samples relative to `asOf`,
 * keeping only days strictly before `asOf` (no leakage — critical for backtests).
 */
export function groupSameDowSamples(orders: OrderLite[], asOf: Date): DowSample[] {
  const targetDow = asOf.getDay();
  const asOfMidnight = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  const byDay = new Map<string, DowSample>();
  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (d.getDay() !== targetDow) continue;
    const dayMid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dayMid >= asOfMidnight) continue; // strictly before the target day
    const key = localDateStr(d);
    const weeksAgo = Math.round((asOfMidnight - dayMid) / (7 * 86400_000));
    const s = byDay.get(key) ?? { dateStr: key, weeksAgo, sales: 0, orders: 0, items: new Map() };
    s.sales += Number(o.total);
    s.orders += 1;
    for (const it of o.items ?? []) s.items.set(it.name, (s.items.get(it.name) ?? 0) + it.quantity);
    byDay.set(key, s);
  }
  // Most recent first.
  return [...byDay.values()].sort((a, b) => a.weeksAgo - b.weeksAgo);
}

function weightedMean(vals: number[], weights: number[]): number {
  let num = 0, den = 0;
  for (let i = 0; i < vals.length; i++) { num += vals[i] * weights[i]; den += weights[i]; }
  return den > 0 ? num / den : 0;
}

function coefficientOfVariation(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (m <= 0) return null;
  const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1);
  return Math.sqrt(variance) / m;
}

export interface DemandSignals {
  reservedCovers?: number; // confirmed covers for the target day
  eventCovers?: number;    // booked private-event guests for the target day
  avgCheck?: number;       // $/ticket, to convert covers ↔ sales (falls back to baseSales/baseOrders)
  adjustment?: number;     // exogenous multiplier (holiday/weather); 1 = neutral
}

/**
 * Core projection. Pure: given the seasonal samples + signals + params, returns
 * the forecast. The backtest calls this with `signals` empty to score the
 * organic model; the live route passes real reservations/events.
 */
export function forecastFromSamples(
  allSamples: DowSample[],
  signals: DemandSignals = {},
  params: ForecastParams = DEFAULT_PARAMS,
): ForecastResult {
  const samples = allSamples.slice(0, params.maxSamples);
  const sampleCount = samples.length;
  const dowName = "same weekday";

  if (sampleCount === 0) {
    const reservedCovers = signals.reservedCovers ?? 0;
    const eventCovers = signals.eventCovers ?? 0;
    return {
      projectedSales: 0, projectedCovers: reservedCovers + eventCovers, baseSales: 0,
      reservedCovers, eventCovers, sampleCount: 0, confidence: "low", cv: null,
      trendPct: 0, prep: [], method: "no-history",
    };
  }

  const weights = samples.map((s) => Math.pow(params.decayPerWeek, s.weeksAgo));
  const salesVals = samples.map((s) => s.sales);
  const orderVals = samples.map((s) => s.orders);

  const wSales = weightedMean(salesVals, weights);
  const wOrders = weightedMean(orderVals, weights);

  // Damped trend: weighted mean of the most-recent third vs the oldest third.
  let trendPct = 0;
  if (sampleCount >= 4) {
    const k = Math.max(1, Math.floor(sampleCount / 3));
    const recent = salesVals.slice(0, k);
    const older = salesVals.slice(-k);
    const mRecent = recent.reduce((s, v) => s + v, 0) / recent.length;
    const mOlder = older.reduce((s, v) => s + v, 0) / older.length;
    if (mOlder > 0) {
      const slope = (mRecent - mOlder) / mOlder;
      trendPct = Math.max(-params.trendCap, Math.min(params.trendCap, slope)) * params.trendBlend;
    }
  }

  const baseSales = wSales * (1 + trendPct);
  const baseOrders = wOrders * (1 + trendPct);
  const avgCheck = signals.avgCheck && signals.avgCheck > 0 ? signals.avgCheck : (baseOrders > 0 ? baseSales / baseOrders : 0);

  // ── Demand signals ──────────────────────────────────────────────────────
  const reservedCovers = signals.reservedCovers ?? 0;
  const eventCovers = signals.eventCovers ?? 0;

  // Reservations imply a floor on covers: if bookings already exceed what the
  // baseline + typical book-ahead rate predict, lift the projection to match.
  const baseCovers = baseOrders * params.avgPartySize;
  const impliedCoversFromBookings = params.bookingShare > 0 ? reservedCovers / params.bookingShare : reservedCovers;
  const organicCovers = Math.max(baseCovers, impliedCoversFromBookings);

  // Events stack additively; an exogenous multiplier (holiday/weather) scales the night.
  const adj = signals.adjustment && signals.adjustment > 0 ? signals.adjustment : 1;
  const projectedCovers = (organicCovers + eventCovers) * adj;

  // Sales scale with the cover uplift, plus event spend at the average check.
  const upliftRatio = baseCovers > 0 ? organicCovers / baseCovers : 1;
  const projectedSales = (baseSales * upliftRatio + eventCovers * avgCheck) * adj;

  // ── Prep: newsvendor quantile per item ──────────────────────────────────
  // For each item, build a per-day demand vector (0 on days it didn't sell) and
  // recommend prep at the service-level quantile: μ + z(serviceLevel)·σ. This
  // prepares to a chosen probability of NOT running out, trading waste against
  // stockouts — the right call for a kitchen, not a bare average.
  const totalUplift = baseSales > 0 ? projectedSales / baseSales : adj;
  const z = invNormCdf(params.serviceLevel);
  const itemNames = new Set<string>();
  for (const s of samples) for (const name of s.items.keys()) itemNames.add(name);
  const prep: PrepItem[] = [...itemNames]
    .map((name) => {
      const perDay = samples.map((s) => s.items.get(name) ?? 0);
      const mean = perDay.reduce((a, b) => a + b, 0) / perDay.length;
      const variance = perDay.length > 1 ? perDay.reduce((a, b) => a + (b - mean) ** 2, 0) / (perDay.length - 1) : 0;
      const sd = Math.sqrt(variance);
      const qty = (mean + z * sd) * totalUplift;
      return { name, mean: mean * totalUplift, qty };
    })
    .filter((x) => x.mean > 0.05)
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 8)
    .map((x) => ({
      name: x.name,
      suggestedQty: Math.max(1, Math.ceil(x.qty)),
      basis: `P${Math.round(params.serviceLevel * 100)} (avg ${x.mean.toFixed(1)})`,
    }));

  // ── Confidence: sample count AND dispersion ─────────────────────────────
  const cv = coefficientOfVariation(salesVals);
  let confidence: "low" | "medium" | "high" = "low";
  if (sampleCount >= 4 && cv !== null && cv < 0.22) confidence = "high";
  else if (sampleCount >= 3 && (cv === null || cv < 0.4)) confidence = "medium";
  else if (sampleCount >= 2) confidence = "medium";

  return {
    projectedSales: Math.round(projectedSales),
    projectedCovers: Math.round(projectedCovers),
    baseSales: Math.round(baseSales),
    reservedCovers, eventCovers,
    sampleCount, confidence, cv,
    trendPct, prep,
    method: "recency-weighted-seasonal+trend+signals",
  };
}

// ── Backtest ───────────────────────────────────────────────────────────────

export interface BacktestMetrics {
  n: number;          // number of evaluated days
  mape: number;       // mean absolute percentage error
  mae: number;        // mean absolute error ($)
  bias: number;       // mean signed percentage error (+ = over-forecast)
  rmse: number;       // root mean squared error ($)
}

export interface BacktestReport {
  model: BacktestMetrics;
  naive: BacktestMetrics;     // simple unweighted same-weekday mean — the baseline to beat
  improvementPct: number;     // MAPE reduction vs naive (positive = better)
  params: ForecastParams;
  evaluated: { dateStr: string; actual: number; predicted: number; naive: number }[];
}

function metricsFrom(rows: { actual: number; predicted: number }[]): BacktestMetrics {
  const valid = rows.filter((r) => r.actual > 0);
  const n = valid.length;
  if (n === 0) return { n: 0, mape: 0, mae: 0, bias: 0, rmse: 0 };
  let ape = 0, ae = 0, spe = 0, se = 0;
  for (const r of valid) {
    const err = r.predicted - r.actual;
    ape += Math.abs(err) / r.actual;
    ae += Math.abs(err);
    spe += err / r.actual;
    se += err * err;
  }
  return { n, mape: (ape / n) * 100, mae: ae / n, bias: (spe / n) * 100, rmse: Math.sqrt(se / n) };
}

/**
 * Walk-forward backtest: for each recent same-weekday day, forecast it using ONLY
 * the orders that preceded it, then compare to what actually happened. Scores the
 * tuned model against a naive same-weekday mean so improvement is measurable.
 *
 * `orders` should span well beyond `targetDays` so early predictions still have history.
 */
export function backtestSales(
  orders: OrderLite[],
  targetDays: Date[],
  params: ForecastParams = DEFAULT_PARAMS,
): BacktestReport {
  const evaluated: BacktestReport["evaluated"] = [];
  const modelRows: { actual: number; predicted: number }[] = [];
  const naiveRows: { actual: number; predicted: number }[] = [];

  for (const day of targetDays) {
    const dayMid = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const nextMid = dayMid + 86400_000;
    // Actual sales for the target day.
    const actual = orders
      .filter((o) => { const t = new Date(o.createdAt).getTime(); return t >= dayMid && t < nextMid; })
      .reduce((s, o) => s + Number(o.total), 0);
    if (actual <= 0) continue;

    const priorOrders = orders.filter((o) => new Date(o.createdAt).getTime() < dayMid);
    const samples = groupSameDowSamples(priorOrders, day);
    if (samples.length === 0) continue;

    const predicted = forecastFromSamples(samples, {}, params).projectedSales;
    const naive = samples.reduce((s, x) => s + x.sales, 0) / samples.length;

    evaluated.push({ dateStr: localDateStr(day), actual: Math.round(actual), predicted, naive: Math.round(naive) });
    modelRows.push({ actual, predicted });
    naiveRows.push({ actual, predicted: naive });
  }

  const model = metricsFrom(modelRows);
  const naive = metricsFrom(naiveRows);
  const improvementPct = naive.mape > 0 ? ((naive.mape - model.mape) / naive.mape) * 100 : 0;
  return { model, naive, improvementPct, params, evaluated };
}

// ── Daypart forecasting ──────────────────────────────────────────────────────

export const DAYPARTS = [
  { name: "Lunch", start: 11, end: 16 },
  { name: "Dinner", start: 16, end: 24 },
] as const;

export interface DaypartForecast {
  name: string;
  projectedSales: number;
  sampleCount: number;
  share: number; // fraction of the day's projected sales
}

/**
 * Forecast each daypart independently (same recency-weighted seasonal model on
 * orders restricted to that hour band), then report each part's share of the
 * day. Lets the kitchen and FOH staff to the curve, not a flat whole-day number.
 */
export function forecastDayparts(
  orders: OrderLite[],
  asOf: Date,
  params: ForecastParams = DEFAULT_PARAMS,
  adjustment = 1,
): DaypartForecast[] {
  const parts = DAYPARTS.map((dp) => {
    const filtered = orders.filter((o) => {
      const h = new Date(o.createdAt).getHours();
      return h >= dp.start && h < dp.end;
    });
    const samples = groupSameDowSamples(filtered, asOf);
    const f = forecastFromSamples(samples, { adjustment }, params);
    return { name: dp.name, projectedSales: f.projectedSales, sampleCount: f.sampleCount };
  });
  const total = parts.reduce((s, r) => s + r.projectedSales, 0) || 1;
  return parts.map((r) => ({ ...r, share: r.projectedSales / total }));
}
