// Manager bonus engine.
//
// Structure (chosen with the operator): a profit-share over budget, gated at a
// monthly Performance-Earnings target, with marginal accelerator tiers, a
// quality scorecard modifier, and a cap expressed as a % of management salary.
// Paid monthly.
//
// Performance Earnings already stops at store-level (controllable) profit — no
// rent, debt, or corporate G&A below it — so it's the fair basis for rewarding
// what a manager actually moves. The bonus is computed on Performance Earnings
// BEFORE the bonus itself, to avoid the circularity of a bonus that lowers the
// number it's based on.

export type BonusTier = {
  over: number;   // monthly overage threshold ($ above target) where this share starts
  pct: number;    // marginal share % applied to overage beyond `over`
};

export type BonusScorecard = {
  enabled: boolean;
  laborTargetPct: number;    // direct labor as % of net sales — at/under = full credit
  primeTargetPct: number;    // (COGS + direct labor) as % of net sales
  compVoidMaxPct: number;    // comps + voids as % of gross sales — at/under = full credit
  weights: { labor: number; prime: number; compVoid: number };
};

export type BonusConfig = {
  enabled: boolean;
  monthlyTarget: number;        // budgeted monthly Performance Earnings (before bonus)
  tiers: BonusTier[];           // sorted ascending by `over`; first `over` should be 0
  capPctOfSalary: number;       // monthly cap = this % of monthly management salary (0 = uncapped)
  scorecard: BonusScorecard;
};

export const DEFAULT_BONUS_CONFIG: BonusConfig = {
  enabled: false,
  monthlyTarget: 0,
  tiers: [
    { over: 0, pct: 15 },
    { over: 15000, pct: 20 },
    { over: 30000, pct: 25 },
  ],
  capPctOfSalary: 30,
  scorecard: {
    enabled: true,
    laborTargetPct: 30,
    primeTargetPct: 60,
    compVoidMaxPct: 3,
    weights: { labor: 40, prime: 40, compVoid: 20 },
  },
};

const DAYS_PER_MONTH = 30.4;

/** Parse a stored settings string into a config, falling back to defaults for any missing/invalid piece. */
export function parseBonusConfig(raw: string | null | undefined): BonusConfig {
  if (!raw) return DEFAULT_BONUS_CONFIG;
  try {
    const p = JSON.parse(raw) as Partial<BonusConfig>;
    const d = DEFAULT_BONUS_CONFIG;
    const tiers = Array.isArray(p.tiers) && p.tiers.length
      ? [...p.tiers].map((t) => ({ over: Number(t.over) || 0, pct: Number(t.pct) || 0 })).sort((a, b) => a.over - b.over)
      : d.tiers;
    return {
      enabled: Boolean(p.enabled),
      monthlyTarget: Number(p.monthlyTarget) || 0,
      tiers,
      capPctOfSalary: p.capPctOfSalary != null ? Number(p.capPctOfSalary) || 0 : d.capPctOfSalary,
      scorecard: {
        enabled: p.scorecard?.enabled ?? d.scorecard.enabled,
        laborTargetPct: Number(p.scorecard?.laborTargetPct) || d.scorecard.laborTargetPct,
        primeTargetPct: Number(p.scorecard?.primeTargetPct) || d.scorecard.primeTargetPct,
        compVoidMaxPct: p.scorecard?.compVoidMaxPct != null ? Number(p.scorecard.compVoidMaxPct) : d.scorecard.compVoidMaxPct,
        weights: {
          labor: Number(p.scorecard?.weights?.labor) || d.scorecard.weights.labor,
          prime: Number(p.scorecard?.weights?.prime) || d.scorecard.weights.prime,
          compVoid: Number(p.scorecard?.weights?.compVoid) || d.scorecard.weights.compVoid,
        },
      },
    };
  } catch {
    return DEFAULT_BONUS_CONFIG;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** "lower is better" deviation score in [-1, 1]: 0 exactly at target (neutral),
 *  +1 when 25%+ better (under) target, -1 when 25%+ worse (over). */
function lowerIsBetter(actual: number, target: number): number {
  if (target <= 0) return 0;
  const dev = (target - actual) / target; // >0 = beat target, <0 = missed
  return clamp(dev / 0.25, -1, 1);
}

export type ScorecardPart = { label: string; actual: number; target: number; score: number; weight: number };

export type BonusResult = {
  enabled: boolean;
  bonus: number;            // accrued bonus for the period (after modifier + cap)
  rawBonus: number;         // before the scorecard modifier + cap
  target: number;           // Performance-Earnings target, prorated to the period
  peBeforeBonus: number;
  overage: number;
  modifier: number;         // scorecard multiplier (0.8–1.2), or 1 when disabled
  cap: number;              // period cap (Infinity when uncapped)
  capped: boolean;
  scoreParts: ScorecardPart[];
};

export function computeBonus(input: {
  peBeforeBonus: number;
  periodDays: number;
  monthlySalaryTotal: number;
  metrics: { laborPct: number; primePct: number; compVoidPct: number };
  config: BonusConfig;
}): BonusResult {
  const { peBeforeBonus, periodDays, monthlySalaryTotal, metrics, config } = input;
  const periodFrac = Math.max(0, periodDays) / DAYS_PER_MONTH;

  const empty: BonusResult = {
    enabled: false, bonus: 0, rawBonus: 0, target: config.monthlyTarget * periodFrac,
    peBeforeBonus, overage: 0, modifier: 1, cap: Infinity, capped: false, scoreParts: [],
  };
  if (!config.enabled) return empty;

  const target = config.monthlyTarget * periodFrac;
  const overage = Math.max(0, peBeforeBonus - target);

  // Marginal tiered share of the overage. Tier thresholds are monthly figures,
  // prorated to the period so a partial-month statement behaves sensibly.
  const tiers = [...config.tiers].sort((a, b) => a.over - b.over);
  let rawBonus = 0;
  for (let i = 0; i < tiers.length; i++) {
    const lo = tiers[i].over * periodFrac;
    const hi = i + 1 < tiers.length ? tiers[i + 1].over * periodFrac : Infinity;
    if (overage <= lo) break;
    const band = Math.min(overage, hi) - lo;
    rawBonus += band * (tiers[i].pct / 100);
  }

  // Quality scorecard → modifier in [0.8, 1.2].
  let modifier = 1;
  const scoreParts: ScorecardPart[] = [];
  if (config.scorecard.enabled) {
    const sc = config.scorecard;
    const parts = [
      { label: "Labor %", actual: metrics.laborPct, target: sc.laborTargetPct, weight: sc.weights.labor },
      { label: "Prime cost %", actual: metrics.primePct, target: sc.primeTargetPct, weight: sc.weights.prime },
      { label: "Comps + voids %", actual: metrics.compVoidPct, target: sc.compVoidMaxPct, weight: sc.weights.compVoid },
    ];
    let wSum = 0, sSum = 0;
    for (const p of parts) {
      const score = lowerIsBetter(p.actual, p.target); // [-1, 1]
      scoreParts.push({ ...p, score });
      wSum += p.weight;
      sSum += p.weight * score;
    }
    const overall = wSum > 0 ? sSum / wSum : 0; // [-1, 1]; 0 = exactly on targets
    modifier = clamp(1 + 0.2 * overall, 0.8, 1.2); // neutral 1.0, ±20% swing
  }

  const adjusted = rawBonus * modifier;
  // Cap is a % of management salary. If no salary is known (0), don't let the cap
  // silently zero the bonus — treat it as uncapped instead.
  const cap = config.capPctOfSalary > 0 && monthlySalaryTotal > 0
    ? monthlySalaryTotal * (config.capPctOfSalary / 100) * periodFrac
    : Infinity;
  const bonus = Math.min(adjusted, cap);

  return {
    enabled: true,
    bonus: Math.round(bonus),
    rawBonus: Math.round(rawBonus),
    target, peBeforeBonus, overage,
    modifier, cap, capped: adjusted > cap,
    scoreParts,
  };
}
