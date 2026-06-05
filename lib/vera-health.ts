// ─────────────────────────────────────────────────────────────────────────────
// Vera health engine
//
// Grounds the dashboard's health read in economics, not a vibe. Two stages:
//   1) project today's P&L (revenue / labor / COGS / fixed overhead → net + break-even)
//   2) score five operational dimensions and roll them into one honest number,
//      with hard overrides for "projected to lose money" and "empty during service".
//
// Pure + deterministic: the route gathers signals, this turns them into a diagnosis.
// ─────────────────────────────────────────────────────────────────────────────

// Tunable assumptions (estimates until configured per-restaurant).
const COGS_TARGET = 0.30;       // food/bev cost as a share of revenue
const OTHER_OPEX_PCT = 0.12;    // other variable opex (supplies, marketing, fees, breakage)
const OCCUPANCY_PCT = 0.09;     // rent + utilities + insurance as a share of a NORMAL day
const DEFAULT_FIXED_DAILY = 250; // fallback daily fixed overhead when there's no history
const TARGET_MARGIN = 0.10;     // healthy net margin
const LABOR_TARGET_PCT = 20;    // labor as a share of revenue (NC fine-dining target ceiling)

export type Status = "excellent" | "good" | "fair" | "strained" | "critical";

export interface HealthMetric { label: string; value: string; target?: string; status: Status }
export interface HealthIssue {
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  impact?: string;   // e.g. "−$380 projected today"
  action?: string;   // concrete next step
  link?: string;
}
export interface Dimension {
  key: string;
  label: string;
  score: number;
  status: Status;
  confidence: number; // 0..1 — how much real data backs this
  summary: string;
  metrics: HealthMetric[];
  wins: string[];
  issues: HealthIssue[];
}
export interface Projection {
  expectedRevenue: number | null; // a normal same-DOW day
  projectedRevenue: number;       // where today is heading
  salesToday: number;
  projectedCOGS: number;
  projectedLabor: number;
  fixedDaily: number;
  projectedNet: number;
  projectedMarginPct: number;
  breakEvenRevenue: number;
  breakEvenProgressPct: number | null;
  serviceElapsedPct: number;
  inService: boolean;
}
export interface Indicator { tone: "positive" | "concern" | "neutral"; text: string; key: string }

export interface Diagnosis {
  healthScore: number;
  status: Status;
  headline: string;
  confidence: number;
  projection: Projection;
  dimensions: Dimension[];
  indicators: Indicator[];
}

export interface HealthInput {
  nowHour: number;             // 0..23 (local)
  openHour: number;            // operating window
  closeHour: number;
  salesToday: number;
  ordersToday: number;
  expectedRevenue: number | null; // 8-week same-DOW average full-day revenue
  forecastRevenue?: number | null; // the Vera Forecast's projected sales (reservations/events/weather folded in)
  laborSoFar: number;          // $ spent on clocked-in staff so far today
  scheduledLaborFullDay: number | null; // planned labor $ for the whole day (from shifts)
  activeStaff: number;
  confirmedCovers: number;     // covers booked today (active reservations)
  expectedCovers: number | null;
  forecastCovers?: number | null; // the Vera Forecast's projected covers (history + bookings)
  openOrders: number;
  outOfStockCount: number;
  lowStockCount: number;
  active86Count: number;
  outOfStockNames?: string[]; // specific items, so Vera can name them not just count them
  lowStockNames?: string[];
  active86Names?: string[];
  voidTotal: number;
  voidCount: number;
  compTotal: number;
  /** The actual manager-entered reasons behind today's comps/voids, most common
   *  first (e.g. "wrong order (3)"). Lets Vera cite real reasons, not guess. */
  compVoidReasons?: string[];
  /** Same data, structured — drives the per-reason breakdown on the Service card. */
  compVoidReasonCounts?: { reason: string; count: number }[];
  priceChangeCount: number;
  // Prep yield/waste learning (lib/prep-waste). Chronic over-prep is real money
  // out the back door — Vera surfaces it once enough days are logged.
  overPrepCount?: number;        // ingredients flagged as chronic over-prep
  recentWastedCost?: number;     // $ of prepped product wasted over the lookback
  wasteDaysLogged?: number;      // how many days have yield logs (signal strength)
  fixedDailyOverride?: number | null; // configured daily fixed cost (else estimated)
  cogsTargetPct?: number | null;      // configured food-cost target as a fraction (else 0.30)
  expectedByNowFraction?: number | null; // learned cumulative-revenue fraction by now
  avgCheckToday?: number | null;
  avgCheckMean?: number | null;       // learned average-check mean
  avgCheckStdev?: number | null;
  dowLabel?: string;                  // e.g. "Friday"
  feedback?: Record<string, { dismissed: number; helpful: number }>; // learned per-indicator
  weights?: Record<string, number>;  // learned dimension weights (else defaults)
}

// ── helpers ───────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
// Standard accounting format: negatives in parentheses, e.g. ($505).
const money = (n: number) => {
  const v = `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
  return n < 0 ? `(${v})` : v;
};
const pct = (n: number) => `${Math.round(n)}%`;

function statusFromScore(s: number): Status {
  if (s >= 90) return "excellent";
  if (s >= 75) return "good";
  if (s >= 60) return "fair";
  if (s >= 45) return "strained";
  return "critical";
}

// ── projection ──────────────────────────────────────────────────────────────

function project(i: HealthInput): Projection {
  const span = Math.max(1, i.closeHour - i.openHour);
  const serviceElapsed = clamp((i.nowHour - i.openHour) / span, 0, 1);
  const inService = i.nowHour >= i.openHour && i.nowHour < i.closeHour;

  // Revenue: extrapolate today's pace against the expected curve. With no
  // baseline, extrapolate by elapsed service time but conservatively — a tiny
  // early sample shouldn't blow up into a huge projected day.
  // Pre-service projection: prefer the Vera Forecast's projected sales — the SAME
  // number the forecast card shows, with reservations, events, holiday, and weather
  // already folded in. Fall back to a reservation-lifted baseline if no forecast was
  // supplied, so a well-booked night still projects above the flat average.
  const AVG_PARTY = 2.3, BOOKING_SHARE = 0.5;
  let bookedExpected = i.expectedRevenue ?? 0;
  if (i.expectedRevenue && i.expectedRevenue > 0 && i.confirmedCovers > 0 && i.avgCheckMean && i.avgCheckMean > 0) {
    const perCover = i.avgCheckMean / AVG_PARTY;
    const bookingImpliedRevenue = (i.confirmedCovers * perCover) / BOOKING_SHARE;
    bookedExpected = Math.min(i.expectedRevenue * 2.5, Math.max(i.expectedRevenue, bookingImpliedRevenue));
  }
  const preServiceProjection = i.forecastRevenue && i.forecastRevenue > 0 ? i.forecastRevenue : bookedExpected;

  // Projection = actual sales so far + the rest of the day at the forecast rate.
  // `observed` is the share of the day's revenue normally in by now (learned
  // intraday curve), so the remaining slice is forecast × (1 − observed). This
  // can't collapse to ~$0 during a quiet afternoon (the booked dinner still
  // counts), and it scales above the forecast when sales run ahead of pace.
  const baseFloor = i.forecastRevenue && i.forecastRevenue > 0
    ? i.forecastRevenue
    : (i.expectedRevenue && i.expectedRevenue > 0 ? bookedExpected : 0);

  let projectedRevenue: number;
  if (baseFloor > 0) {
    const elapsedFrac = i.expectedByNowFraction != null ? i.expectedByNowFraction : serviceElapsed;
    const observed = clamp(elapsedFrac, 0, 1);
    projectedRevenue = i.salesToday + baseFloor * (1 - observed);
  } else {
    projectedRevenue = i.salesToday / clamp(serviceElapsed, 0.35, 1);
  }

  // Labor: prefer the scheduled plan; else extrapolate the current burn once
  // there's enough of it; else assume a target labor load (don't pretend $0).
  const projectedLabor = i.scheduledLaborFullDay && i.scheduledLaborFullDay > 0
    ? Math.max(i.scheduledLaborFullDay, i.laborSoFar)
    : serviceElapsed > 0.25
      ? i.laborSoFar / serviceElapsed
      : Math.max(i.laborSoFar, projectedRevenue * (LABOR_TARGET_PCT / 100));

  const cogsRate = i.cogsTargetPct && i.cogsTargetPct > 0 ? i.cogsTargetPct : COGS_TARGET;
  const projectedCOGS = projectedRevenue * cogsRate;
  const otherOpex = projectedRevenue * OTHER_OPEX_PCT;
  // Fixed overhead: configured daily figure if set, else anchored to a NORMAL
  // day's revenue (so it doesn't vanish on a dead one), else a flat fallback.
  const fixedDaily = i.fixedDailyOverride && i.fixedDailyOverride > 0
    ? i.fixedDailyOverride
    : (i.expectedRevenue && i.expectedRevenue > 0 ? i.expectedRevenue * OCCUPANCY_PCT : DEFAULT_FIXED_DAILY);

  const projectedNet = projectedRevenue - projectedCOGS - otherOpex - projectedLabor - fixedDaily;
  const projectedMarginPct = projectedRevenue > 0 ? (projectedNet / projectedRevenue) * 100 : (projectedNet < 0 ? -100 : 0);
  const breakEvenRevenue = (projectedLabor + fixedDaily) / (1 - cogsRate - OTHER_OPEX_PCT);
  const breakEvenProgressPct = breakEvenRevenue > 0 ? (projectedRevenue / breakEvenRevenue) * 100 : null;

  return {
    expectedRevenue: i.expectedRevenue,
    projectedRevenue, salesToday: i.salesToday,
    projectedCOGS, projectedLabor, fixedDaily,
    projectedNet, projectedMarginPct,
    breakEvenRevenue, breakEvenProgressPct,
    serviceElapsedPct: serviceElapsed * 100, inService,
  };
}

// ── dimensions ────────────────────────────────────────────────────────────────

function profitability(i: HealthInput, p: Projection): Dimension {
  const issues: HealthIssue[] = [];
  const wins: string[] = [];
  const hasForecast = i.expectedRevenue !== null;

  // Without a comparable day, the revenue projection is too rough to call a
  // profit or loss — present it as unknown rather than fabricating a verdict.
  if (!hasForecast) {
    const score = 62;
    return {
      key: "profitability", label: "Profitability", score, status: statusFromScore(score),
      confidence: 0.35,
      summary: "Limited history — profit can't be projected confidently yet.",
      metrics: [
        { label: "Sales so far", value: money(i.salesToday), status: "good" },
        { label: "Est. break-even", value: money(p.breakEvenRevenue), status: "good" },
      ],
      wins: [],
      issues: [{ severity: "LOW", message: "Not enough comparable days to project profit", action: "This sharpens after a few weeks of sales history", link: "/reports" }],
    };
  }

  // Before service really starts, the projection is just "a normal day" — present
  // it as a projection, not a graded result.
  if (p.serviceElapsedPct < 8) {
    return {
      key: "profitability", label: "Profitability", score: 68, status: "fair",
      confidence: 0.3,
      summary: `Projecting ${money(p.projectedNet)} net on a normal day — grades live as sales come in.`,
      metrics: [
        { label: "Break-even", value: money(p.breakEvenRevenue), status: "good" },
        { label: "Expected net", value: money(p.projectedNet), status: "good" },
      ],
      wins: [], issues: [],
    };
  }

  // Score off projected margin: ~break-even = 50, target margin = ~80, loss → 0.
  const score = clamp(Math.round(50 + p.projectedMarginPct * 2.5), 0, 100);

  const metrics: HealthMetric[] = [
    { label: "Projected net", value: money(p.projectedNet), target: `${pct(TARGET_MARGIN * 100)} margin`, status: statusFromScore(score) },
    { label: "Break-even", value: money(p.breakEvenRevenue), status: "good" },
    { label: "On track for", value: money(p.projectedRevenue), status: p.breakEvenProgressPct != null && p.breakEvenProgressPct >= 100 ? "good" : "strained" },
  ];

  if (p.projectedNet < 0) {
    issues.push({
      severity: "HIGH",
      message: `Projected to lose ${money(Math.abs(p.projectedNet))} today`,
      impact: `Break-even needs ${money(p.breakEvenRevenue)}; on pace for ${money(p.projectedRevenue)}`,
      action: i.activeStaff > 0 && p.projectedRevenue < p.breakEvenRevenue * 0.6
        ? "Cut labor toward break-even staffing — you're well under"
        : "You're under break-even — tighten labor and watch spend",
      link: "/reports",
    });
  } else if (p.projectedMarginPct < TARGET_MARGIN * 100) {
    issues.push({
      severity: "MEDIUM",
      message: `Thin margin — projected ${pct(p.projectedMarginPct)} net`,
      impact: `${money(p.projectedNet)} on ${money(p.projectedRevenue)}`,
      action: "Watch labor and comps — a few more covers clears it",
      link: "/reports",
    });
  } else {
    wins.push(`Projected ${pct(p.projectedMarginPct)} net margin (${money(p.projectedNet)})`);
  }

  return {
    key: "profitability", label: "Profitability", score, status: statusFromScore(score),
    confidence: hasForecast ? 0.85 : 0.5,
    summary: p.projectedNet < 0
      ? `On pace to lose money today.`
      : `On pace for ${money(p.projectedNet)} net (${pct(p.projectedMarginPct)}).`,
    metrics: metrics.filter(m => m.value),
    wins, issues,
  };
}

function demand(i: HealthInput, p: Projection): Dimension {
  const issues: HealthIssue[] = [];
  const wins: string[] = [];
  const hasForecast = i.expectedRevenue !== null;

  // Pre-service: the "pace" is circular (projection == expectation), so don't
  // grade it — frame the expected day instead.
  if (p.serviceElapsedPct < 8) {
    return {
      key: "demand", label: "Demand", score: 70, status: "fair",
      confidence: 0.3,
      summary: hasForecast ? `Service hasn't started — expecting a normal day (${money(i.expectedRevenue!)}).` : "Service hasn't started yet.",
      metrics: [
        { label: "Expected today", value: hasForecast ? money(i.expectedRevenue!) : "—", status: "good" },
        ...(i.forecastCovers != null ? [{ label: "Projected covers", value: String(i.forecastCovers), status: "good" as const }] : []),
        { label: "Covers booked", value: String(i.confirmedCovers), status: i.confirmedCovers > 0 ? "good" as const : "fair" as const },
      ],
      wins: [],
      issues: i.confirmedCovers === 0 ? [{ severity: "LOW", message: "No reservations booked yet — walk-ins only so far", action: "Projected covers come from your same-weekday history", link: "/reservations" }] : [],
    };
  }

  const paceRatio = hasForecast && i.expectedRevenue! > 0 ? p.projectedRevenue / i.expectedRevenue! : null;

  let score: number;
  if (paceRatio !== null) score = clamp(Math.round(paceRatio * 100), 0, 100);
  else score = i.salesToday > 0 ? 65 : 40; // no baseline → neutral-ish, can't grade

  const metrics: HealthMetric[] = [
    { label: "Sales so far", value: money(i.salesToday), target: hasForecast ? `${money(i.expectedRevenue!)} normal` : undefined, status: statusFromScore(score) },
    { label: "Pace vs normal", value: paceRatio !== null ? pct(paceRatio * 100) : "—", status: statusFromScore(score) },
    ...(i.forecastCovers != null ? [{ label: "Projected covers", value: String(i.forecastCovers), status: "good" as const }] : []),
    { label: "Covers booked", value: String(i.confirmedCovers), status: i.confirmedCovers > 0 ? "good" as const : "strained" as const },
  ];

  // Empty-room detection during service is the loudest demand signal.
  const emptyRoom = p.inService && i.openOrders === 0 && i.salesToday < (i.expectedRevenue ?? 200) * 0.05;
  if (emptyRoom) {
    issues.push({
      severity: "HIGH",
      message: "Dining room is empty during service",
      impact: hasForecast ? `Normally ${money(i.expectedRevenue! * p.serviceElapsedPct / 100)} by now` : "No orders open",
      action: "Drive demand — promo blast, walk-in push, or trim the floor",
      link: "/host",
    });
  } else if (paceRatio !== null && paceRatio < 0.8) {
    issues.push({
      severity: paceRatio < 0.6 ? "HIGH" : "MEDIUM",
      message: `Sales pacing ${pct(paceRatio * 100)} of a normal ${dayLabel(i)}`,
      impact: hasForecast ? `Trending ${money(p.projectedRevenue - i.expectedRevenue!)} vs normal` : undefined,
      action: "Check covers and reservations, then consider a demand push",
      link: "/reports",
    });
  } else if (paceRatio !== null && paceRatio >= 1.0) {
    wins.push(`Pacing ${pct(paceRatio * 100)} of normal — strong demand`);
  }
  if (i.confirmedCovers === 0 && p.inService) {
    issues.push({ severity: "MEDIUM", message: "No reservations on the books", action: "Walk-ins only tonight — staff for variance", link: "/reservations" });
  } else if (i.confirmedCovers > 0) {
    wins.push(`${i.confirmedCovers} covers booked`);
  }

  return {
    key: "demand", label: "Demand", score, status: statusFromScore(score),
    confidence: hasForecast ? 0.8 : 0.35,
    summary: paceRatio !== null ? `Pacing ${pct(paceRatio * 100)} of a normal ${dayLabel(i)}.` : `No comparable day yet — pace can't be graded.`,
    metrics, wins, issues,
  };
}

function labor(i: HealthInput, p: Projection): Dimension {
  const issues: HealthIssue[] = [];
  const wins: string[] = [];
  const laborPct = p.projectedRevenue > 0 ? (p.projectedLabor / p.projectedRevenue) * 100 : (p.projectedLabor > 0 ? 999 : 0);
  const assessable = p.projectedRevenue > 0 || i.activeStaff > 0;

  // Staff on with no sales: a real problem DURING service, but completely normal
  // before doors (prep + opening side work). Vera shouldn't read a prep crew as
  // a crisis — that's the "doesn't understand the business" failure.
  const staffedNoSales = laborPct >= 999;
  const prepCrew = staffedNoSales && !p.inService;

  // Score off labor % vs a 20% target. ≤20%→100, 25%→80, 30%→60, 40%→20.
  let score: number;
  if (!assessable || prepCrew) score = 72;          // pre-service prep is not graded as bad labor
  else if (staffedNoSales) score = 5;               // in service with staff and no sales = real bleed
  else score = clamp(Math.round(100 - Math.max(0, laborPct - LABOR_TARGET_PCT) * 4), 0, 100);

  const metrics: HealthMetric[] = [
    { label: "Labor %", value: staffedNoSales ? "—" : pct(laborPct), target: `${LABOR_TARGET_PCT}%`, status: statusFromScore(score) },
    { label: "Staff on", value: String(i.activeStaff), status: "good" },
    { label: "Projected labor", value: money(p.projectedLabor), status: statusFromScore(score) },
  ];

  if (prepCrew) {
    issues.push({ severity: "LOW", message: `${i.activeStaff} clocked in before service`, impact: `${money(p.projectedLabor)} in labor so far — normal for prep & opening`, action: "Trim anyone not needed until doors open", link: "/timeclock" });
  } else if (staffedNoSales) {
    issues.push({ severity: "HIGH", message: `${i.activeStaff} on the clock with almost no sales`, impact: `${money(p.projectedLabor)} in labor with little coming in`, action: "Make cuts if staffing levels allow", link: "/timeclock" });
  } else if (laborPct > LABOR_TARGET_PCT + 8) {
    issues.push({ severity: laborPct > LABOR_TARGET_PCT + 18 ? "HIGH" : "MEDIUM", message: `Labor projected at ${pct(laborPct)} of sales`, impact: `Target is ${LABOR_TARGET_PCT}%`, action: "Trim a position if staffing levels allow", link: "/staff" });
  } else if (assessable && laborPct <= LABOR_TARGET_PCT) {
    wins.push(`Labor on target at ${pct(laborPct)}`);
  }

  return {
    key: "labor", label: "Labor", score, status: statusFromScore(score),
    confidence: prepCrew ? 0.4 : assessable ? 0.75 : 0.4,
    summary: prepCrew ? "Prep crew on before service — normal." : staffedNoSales ? "Staffed with no sales to cover it." : assessable ? `Labor tracking ${pct(laborPct)} of sales.` : "Not enough data to grade labor.",
    metrics, wins, issues,
  };
}

// Name the specific items (up to 3) instead of a bare count; null if no names available.
function namedItems(names: string[] | undefined, count: number): string | null {
  if (!names || names.length === 0) return null;
  const shown = names.slice(0, 3).join(", ");
  const extra = count - Math.min(3, names.length);
  return extra > 0 ? `${shown} +${extra} more` : shown;
}

function costInventory(i: HealthInput): Dimension {
  const issues: HealthIssue[] = [];
  const wins: string[] = [];
  let penalty = 0;
  if (i.outOfStockCount > 0) {
    penalty += Math.min(40, i.outOfStockCount * 14);
    const named = namedItems(i.outOfStockNames, i.outOfStockCount);
    issues.push({ severity: "HIGH", message: named ? `Out of stock: ${named}` : `${i.outOfStockCount} item${i.outOfStockCount > 1 ? "s" : ""} out of stock`, action: "Reorder or 86 affected dishes", link: "/inventory" });
  }
  if (i.active86Count > 0) {
    penalty += Math.min(20, i.active86Count * 5);
    const named = namedItems(i.active86Names, i.active86Count);
    issues.push({ severity: "MEDIUM", message: named ? `86'd: ${named}` : `${i.active86Count} item${i.active86Count > 1 ? "s" : ""} 86'd`, action: "Confirm the floor knows", link: "/kitchen" });
  }
  if (i.lowStockCount > 0) {
    penalty += Math.min(15, i.lowStockCount * 3);
    const named = namedItems(i.lowStockNames, i.lowStockCount);
    issues.push({ severity: "LOW", message: named ? `Low on stock: ${named}` : `${i.lowStockCount} item${i.lowStockCount > 1 ? "s" : ""} below par`, action: "Add to the next order", link: "/purchasing/reorder" });
  }
  if (i.priceChangeCount > 0) { penalty += Math.min(12, i.priceChangeCount * 3); issues.push({ severity: "LOW", message: `${i.priceChangeCount} vendor price swing${i.priceChangeCount > 1 ? "s" : ""}`, action: "Review costs / re-bid", link: "/purchasing" }); }

  // Chronic prep over-prep — only acted on once there's a real signal (days logged).
  const overPrep = i.overPrepCount ?? 0;
  const wastedCost = i.recentWastedCost ?? 0;
  const wasteSignal = (i.wasteDaysLogged ?? 0) >= 3;
  if (wasteSignal && overPrep > 0) {
    penalty += Math.min(18, overPrep * 5);
    issues.push({
      severity: wastedCost >= 100 ? "MEDIUM" : "LOW",
      message: `${overPrep} prep item${overPrep > 1 ? "s" : ""} over-prepped`,
      impact: wastedCost > 0 ? `${money(wastedCost)} wasted recently` : undefined,
      action: "Trim batch sizes — the prep list already lowered the recommendation",
      link: "/prep-list",
    });
  }
  if (penalty === 0) wins.push("No stock-outs, 86s, or price spikes");
  else if (wasteSignal && overPrep === 0 && (i.wasteDaysLogged ?? 0) > 0) wins.push("Prep yield on target — little waste");

  const score = clamp(100 - penalty, 0, 100);
  return {
    key: "cost", label: "Cost & Inventory", score, status: statusFromScore(score),
    confidence: 0.8,
    summary: penalty === 0 ? "Inventory clean." : `${issues.length} cost/inventory issue${issues.length > 1 ? "s" : ""} to clear.`,
    metrics: [
      { label: "Out of stock", value: String(i.outOfStockCount), status: i.outOfStockCount ? "critical" : "good" },
      { label: "86'd", value: String(i.active86Count), status: i.active86Count ? "fair" : "good" },
      { label: "Below par", value: String(i.lowStockCount), status: i.lowStockCount ? "fair" : "good" },
      ...(wasteSignal ? [{ label: "Over-prepped", value: String(overPrep), status: (overPrep ? "fair" : "good") as Status }] : []),
    ],
    wins, issues,
  };
}

function service(i: HealthInput): Dimension {
  const issues: HealthIssue[] = [];
  const wins: string[] = [];
  const lossRate = i.salesToday > 0 ? ((i.voidTotal + i.compTotal) / i.salesToday) * 100 : 0;
  const score = i.salesToday > 0 ? clamp(Math.round(100 - lossRate * 6), 30, 100) : 75;
  if (lossRate > 4) {
    const reasons = i.compVoidReasons?.length
      ? `Most common — ${i.compVoidReasons.slice(0, 3).join(", ")}.`
      : "Each was logged with a manager reason — review them.";
    issues.push({ severity: lossRate > 8 ? "HIGH" : "MEDIUM", message: `Voids + comps at ${pct(lossRate)} of sales`, impact: money(i.voidTotal + i.compTotal), action: reasons, link: "/reports" });
  }
  else if (i.salesToday > 0) wins.push(`Voids/comps low at ${pct(lossRate)}`);

  return {
    key: "service", label: "Service", score, status: statusFromScore(score),
    confidence: i.salesToday > 0 ? 0.6 : 0.3,
    summary: i.salesToday > 0 ? `Voids + comps ${pct(lossRate)} of sales.` : "No service data yet.",
    metrics: [
      { label: "Voids", value: `${money(i.voidTotal)} (${i.voidCount})`, status: i.voidTotal ? "fair" : "good" },
      { label: "Comps", value: money(i.compTotal), status: i.compTotal ? "fair" : "good" },
      // Per-reason breakdown (top 4) so expanding Service shows *why* — wrong
      // order ×3, training ×2 — not just the dollar totals.
      ...(i.compVoidReasonCounts ?? []).slice(0, 4).map((r) => ({
        label: r.reason.charAt(0).toUpperCase() + r.reason.slice(1),
        value: `${r.count}×`,
        status: "fair" as const,
      })),
    ],
    wins, issues,
  };
}

function dayLabel(_i: HealthInput) { return "day"; }

// ── roll-up ───────────────────────────────────────────────────────────────────

const WEIGHTS: Record<string, number> = { profitability: 0.35, demand: 0.25, labor: 0.20, cost: 0.15, service: 0.05 };

export function buildDiagnosis(input: HealthInput): Diagnosis {
  const p = project(input);
  const dims = [profitability(input, p), demand(input, p), labor(input, p), costInventory(input), service(input)];

  // Confidence-weighted roll-up, using learned weights when provided.
  const W = input.weights ?? WEIGHTS;
  let wSum = 0, scoreSum = 0, confSum = 0;
  for (const d of dims) {
    const w = (W[d.key] ?? 0) * (0.4 + 0.6 * d.confidence); // low-confidence dims pull less weight
    wSum += w; scoreSum += d.score * w; confSum += d.confidence * (W[d.key] ?? 0);
  }
  let score = wSum > 0 ? Math.round(scoreSum / wSum) : 70;

  const hasHighIssue = dims.some(d => d.issues.some(x => x.severity === "HIGH"));
  const noBaseline = input.expectedRevenue === null;
  const preService = p.serviceElapsedPct < 8;

  // How much of today we've actually observed. Early in service the projection is
  // mostly assumption, so pull the score toward a neutral 70 — Vera is uncertain
  // early and grows decisive as real covers come in. (Hard problems below still
  // override this.)
  const observed = clamp(p.serviceElapsedPct / 100, 0, 1);
  let dataConf = clamp(0.25 + observed * 0.8, 0.25, 0.95);
  if (noBaseline) dataConf *= 0.6;
  score = Math.round(70 + (score - 70) * dataConf);

  // Hard overrides — economics and honesty trump the weighted average.
  // Loss override only fires when we have a baseline to trust the projection.
  const lossOverride = !noBaseline && p.projectedNet < 0 && (p.inService || input.salesToday > 0);
  // Empty-room is a real-time fact regardless of history.
  const emptyOverride = p.inService && input.openOrders === 0 && input.salesToday < (input.expectedRevenue ?? 200) * 0.05;
  if (lossOverride) score = Math.min(score, 32);
  if (emptyOverride) score = Math.min(score, 22);
  // A live HIGH issue can't sit under a top-tier score.
  if (hasHighIssue) score = Math.min(score, 78);
  // No comparable day yet → we can't grade demand/profit with confidence, so we
  // don't claim an "excellent" day off an extrapolation.
  if (noBaseline) score = Math.min(score, 70);

  const status = statusFromScore(score);

  // Headline: lead with the economic reality.
  let headline: string;
  if (emptyOverride) headline = `Empty dining room during service — burning ${money(p.projectedLabor + p.fixedDaily)}/day in fixed cost with no covers.`;
  else if (lossOverride) headline = `On pace to lose ${money(Math.abs(p.projectedNet))} today. Break-even ${money(p.breakEvenRevenue)}, trending ${money(p.projectedRevenue)}.`;
  else if (preService) headline = noBaseline
    ? `Service hasn't started yet — not enough history to project today.`
    : `Service hasn't started — projecting a normal day around ${money(p.projectedRevenue)}. Vera grades the day live as covers build.`;
  else if (noBaseline) headline = `Limited sales history — pace and profit can't be graded yet. A few comparable days unlocks the full read. Live issues are still flagged below.`;
  else if (status === "excellent") headline = `Strong day — projected ${money(p.projectedNet)} net at ${pct(p.projectedMarginPct)} margin.`;
  else if (status === "good") headline = `Solid — on pace for ${money(p.projectedNet)} net. ${topIssue(dims) ?? "Nothing urgent."}`;
  else headline = topIssue(dims) ?? (p.projectedNet >= 0 ? `Tracking toward ${money(p.projectedNet)} net.` : `On track for a ${money(Math.abs(p.projectedNet))} loss.`);

  // Confidence shown to the user reflects how much of the day Vera has actually
  // observed (time) tempered by per-dimension data coverage.
  const confidence = clamp(Math.min(dataConf, confSum + 0.25), 0.2, 0.97);
  const indicators = buildIndicators(input, p, dims, preService);
  return { healthScore: score, status, headline, confidence, projection: p, dimensions: dims, indicators };
}

// The digestible "what stands out" — the few things a manager should actually
// notice, framed against THIS restaurant's learned normal.
// Indicators that should never be silenced by feedback — they're economic facts,
// not opinions a manager can wave away.
const PROTECTED_KEYS = new Set(["below_breakeven"]);

function buildIndicators(i: HealthInput, p: Projection, dims: Dimension[], preService: boolean): Indicator[] {
  const out: Indicator[] = [];
  const day = i.dowLabel ?? "day";

  // Pace vs the learned normal for this day-of-week.
  if (!preService && i.expectedRevenue && i.expectedRevenue > 0) {
    const pace = p.projectedRevenue / i.expectedRevenue;
    if (pace >= 1.08) out.push({ key: "pace_ahead", tone: "positive", text: `Running ${pct((pace - 1) * 100)} ahead of a normal ${day} — on pace for ${money(p.projectedRevenue)}.` });
    else if (pace <= 0.85) out.push({ key: "pace_behind", tone: "concern", text: `Pacing ${pct(pace * 100)} of a normal ${day} (${money(p.projectedRevenue - i.expectedRevenue)} vs typical).` });
  }

  // Average check vs the learned distribution (z-score).
  if (i.avgCheckToday != null && i.avgCheckMean != null && i.avgCheckStdev && i.avgCheckStdev > 1e-6) {
    const z = (i.avgCheckToday - i.avgCheckMean) / i.avgCheckStdev;
    const diff = i.avgCheckToday - i.avgCheckMean;
    if (z >= 1) out.push({ key: "avgcheck_high", tone: "positive", text: `Avg check ${money(i.avgCheckToday)} — ${money(diff)} above your normal. Upsells are landing.` });
    else if (z <= -1) out.push({ key: "avgcheck_low", tone: "concern", text: `Avg check ${money(i.avgCheckToday)} — ${money(Math.abs(diff))} below your normal. Check attach/upsell.` });
  }

  // Profitability. Only flag below-break-even once service is underway — before
  // doors it's just a projection for a normal day, not an actionable concern.
  if (!preService && p.projectedNet < 0) out.push({ key: "below_breakeven", tone: "concern", text: `Below break-even — projected ${money(p.projectedNet)} (need ${money(p.breakEvenRevenue)}).` });
  else if (!preService && p.projectedMarginPct >= 12) out.push({ key: "margin_healthy", tone: "positive", text: `Healthy margin — projected ${pct(p.projectedMarginPct)} net (${money(p.projectedNet)}).` });

  // Prep over-prep — only once enough days are logged to trust the rate.
  if ((i.wasteDaysLogged ?? 0) >= 3 && (i.overPrepCount ?? 0) > 0) {
    const wc = i.recentWastedCost ?? 0;
    out.push({
      key: "prep_overprep",
      tone: "concern",
      text: wc > 0
        ? `${i.overPrepCount} prep item${i.overPrepCount! > 1 ? "s" : ""} consistently over-prepped — about ${money(wc)} wasted recently. Trim batch sizes.`
        : `${i.overPrepCount} prep item${i.overPrepCount! > 1 ? "s" : ""} consistently over-prepped — trim batch sizes.`,
    });
  } else if ((i.wasteDaysLogged ?? 0) >= 5 && (i.overPrepCount ?? 0) === 0) {
    out.push({ key: "prep_yield_good", tone: "positive", text: "Prep yield is dialed in — almost nothing going to waste." });
  }

  // Pull in any HIGH issues the manager must see.
  for (const d of dims) {
    for (const iss of d.issues) {
      if (iss.severity === "HIGH" && out.length < 8) out.push({ key: `issue_${d.key}`, tone: "concern", text: iss.action ? `${iss.message} — ${iss.action}` : iss.message });
    }
  }

  // Make sure at least one positive shows when something's genuinely going well.
  if (!out.some((x) => x.tone === "positive")) {
    const wd = dims.find((d) => d.wins.length > 0);
    if (wd) out.push({ key: `win_${wd.key}`, tone: "positive", text: wd.wins[0] });
  }

  // ── Learn from feedback ──────────────────────────────────────────────────────
  // Drop indicator types the manager has repeatedly dismissed (unless protected),
  // and float consistently-helpful ones to the top.
  const fb = i.feedback ?? {};
  const score = (k: string) => { const f = fb[k]; return f ? f.helpful - f.dismissed : 0; };
  const suppressed = (k: string) => {
    if (PROTECTED_KEYS.has(k)) return false;
    const f = fb[k];
    return !!f && f.dismissed >= 4 && f.dismissed >= f.helpful + 3;
  };

  const seen = new Set<string>();
  return out
    .filter((x) => !suppressed(x.key))
    .filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)))
    .sort((a, b) => score(b.key) - score(a.key)) // helpful-rated first
    .slice(0, 6);
}

function topIssue(dims: Dimension[]): string | null {
  const all = dims.flatMap(d => d.issues);
  const high = all.find(x => x.severity === "HIGH") ?? all.find(x => x.severity === "MEDIUM") ?? all[0];
  return high?.message ?? null;
}

// Flatten dimension issues into the legacy alert shape the rest of the UI uses.
export function issuesToAlerts(dims: Dimension[]): { severity: string; category: string; message: string; link: string }[] {
  const catFor: Record<string, string> = { profitability: "COSTS", demand: "SALES", labor: "LABOR", cost: "INVENTORY", service: "OPERATIONS" };
  return dims.flatMap(d => d.issues.map(x => ({
    severity: x.severity,
    category: catFor[d.key] ?? "OPERATIONS",
    message: x.action ? `${x.message} — ${x.action}` : x.message,
    link: x.link ?? "/",
  }))).sort((a, b) => {
    const o = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
    return (o[a.severity] ?? 3) - (o[b.severity] ?? 3);
  });
}
