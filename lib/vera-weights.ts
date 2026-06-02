// ─────────────────────────────────────────────────────────────────────────────
// Vera learned weights (Level 3)
//
// Learns how much each health dimension should count toward the overall score
// FOR THIS restaurant, by correlating each dimension's daily score with the day's
// realized profit margin. Dimensions whose scores actually track profit get more
// weight; ones that don't, less. Blended with sensible priors so it's stable
// early and only drifts as evidence accumulates.
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from "./prisma";

const DIM_KEYS = ["profitability", "demand", "labor", "cost", "service"] as const;
const DEFAULT_WEIGHTS: Record<string, number> = { profitability: 0.35, demand: 0.25, labor: 0.20, cost: 0.15, service: 0.05 };
const LABELS: Record<string, string> = { profitability: "Profitability", demand: "Demand", labor: "Labor", cost: "Cost & Inventory", service: "Service" };
const MIN_DAYS = 14;   // "fully tuned" threshold for the UI
const PRIOR_K = 20;    // strength of the default prior (days-equivalent)
const TTL_MS = 30 * 60 * 1000;

export interface LearnedWeights {
  weights: Record<string, number>;
  daysObserved: number;
  minDays: number;
  learning: boolean;
  topDrivers: { key: string; label: string; weight: number; corr: number | null }[];
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  if (dx < 1e-9 || dy < 1e-9) return null;
  return num / Math.sqrt(dx * dy);
}

type Cache = { at: number; dayKey: string; data: LearnedWeights };
const g = globalThis as unknown as { __veraWeights?: Cache };

export async function getLearnedWeights(now: Date = new Date()): Promise<LearnedWeights> {
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const c = g.__veraWeights;
  if (c && c.dayKey === dayKey && Date.now() - c.at < TTL_MS) return c.data;
  const data = await compute();
  g.__veraWeights = { at: Date.now(), dayKey, data };
  return data;
}

async function compute(): Promise<LearnedWeights> {
  // Never let a learning-data hiccup (e.g. table not yet migrated on a stale
  // process) break the core diagnosis — fall back to default weights.
  let rows: { scores: string; actualMarginPct: number }[] = [];
  try {
    rows = await prisma.veraDaySnapshot.findMany({ orderBy: { date: "desc" }, take: 120 });
  } catch {
    rows = [];
  }
  const n = rows.length;

  const fallback: LearnedWeights = {
    weights: { ...DEFAULT_WEIGHTS }, daysObserved: n, minDays: MIN_DAYS, learning: true,
    topDrivers: DIM_KEYS.map((k) => ({ key: k, label: LABELS[k], weight: DEFAULT_WEIGHTS[k], corr: null })).sort((a, b) => b.weight - a.weight),
  };
  if (n < 3) return fallback;

  // Correlate each dimension's score with realized margin.
  const corr: Record<string, number | null> = {};
  for (const k of DIM_KEYS) {
    const xs: number[] = [], ys: number[] = [];
    for (const r of rows) {
      let s: Record<string, number>;
      try { s = JSON.parse(r.scores); } catch { continue; }
      const v = Number(s[k]);
      if (!isNaN(v)) { xs.push(v); ys.push(r.actualMarginPct); }
    }
    corr[k] = pearson(xs, ys);
  }

  // Weight ∝ positive correlation; if nothing correlates, keep the priors.
  const pos: Record<string, number> = {};
  let sumPos = 0;
  for (const k of DIM_KEYS) { const c = corr[k]; const p = c != null && c > 0 ? c : 0; pos[k] = p; sumPos += p; }
  const learnedNorm: Record<string, number> = {};
  for (const k of DIM_KEYS) learnedNorm[k] = sumPos > 0 ? pos[k] / sumPos : DEFAULT_WEIGHTS[k];

  // Blend learned with prior by how much evidence we have.
  const blend = n / (n + PRIOR_K);
  const weights: Record<string, number> = {};
  let sumW = 0;
  for (const k of DIM_KEYS) { weights[k] = blend * learnedNorm[k] + (1 - blend) * DEFAULT_WEIGHTS[k]; sumW += weights[k]; }
  for (const k of DIM_KEYS) weights[k] /= sumW;

  const topDrivers = DIM_KEYS
    .map((k) => ({ key: k, label: LABELS[k], weight: weights[k], corr: corr[k] }))
    .sort((a, b) => b.weight - a.weight);

  return { weights, daysObserved: n, minDays: MIN_DAYS, learning: n < MIN_DAYS, topDrivers };
}
