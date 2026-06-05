// Payroll — pay-period math + a gross-pay register computation.
//
// Scope: this produces a GROSS-pay register (regular + overtime + prorated
// salary, with declared tips shown informationally and a manager adjustment
// column). It deliberately does NOT calculate tax withholding or net checks —
// the register exports to the restaurant's payroll provider / accountant.
//
// Hours come from ClockEntry; rates and salary from User. Overtime is federal
// FLSA by default: 1.5× for hours over 40 in a workweek (both configurable).
//
// Pay periods are anchored to a single fixed date and tiled forward in fixed
// blocks (7 days weekly, 14 biweekly). The default anchor is the fiscal-year
// start, which lands on the configured week-start day — so a biweekly period is
// exactly two whole workweeks and overtime never straddles a period boundary.

import {
  parseFiscalConfig,
  fiscalYearStart,
  toISODate,
  type FiscalConfig,
} from "./fiscal";

export type PayrollCadence = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY";

export interface PayrollConfig {
  cadence: PayrollCadence;
  anchor: string; // YYYY-MM-DD — a date that starts a known pay period
  weekStart: number; // 0=Sun … 6=Sat — workweek boundary for overtime
  otThresholdHours: number; // weekly hours before overtime (default 40)
  otMultiplier: number; // overtime pay multiplier (default 1.5)
}

export const PERIODS_PER_YEAR: Record<PayrollCadence, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  SEMIMONTHLY: 24,
};

const DAY_MS = 86_400_000;

function atNoon(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 12, 0, 0, 0); // noon avoids DST edge cases
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Parse a YYYY-MM-DD as a local noon Date. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return atNoon(y, (m || 1) - 1, d || 1);
}
function wholeDaysBetween(a: Date, b: Date): number {
  // Calendar-day difference, DST-safe (both anchored at local noon).
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** Build payroll config from a settings key/value map, falling back to fiscal defaults. */
export function getPayrollConfig(settings: Record<string, string | undefined>): PayrollConfig {
  const fiscal: FiscalConfig = parseFiscalConfig(settings["fiscalCalendar"]);
  const cadence = ((): PayrollCadence => {
    const c = settings["payrollCadence"];
    return c === "WEEKLY" || c === "SEMIMONTHLY" ? c : "BIWEEKLY";
  })();
  // Default anchor: the fiscal-year start of the current year (week-start aligned).
  const defaultAnchor = toISODate(fiscalYearStart(new Date().getFullYear(), fiscal));
  const anchorRaw = settings["payrollAnchor"];
  const anchor = anchorRaw && /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : defaultAnchor;
  const otThresholdHours = num(settings["overtimeThresholdHours"], 40);
  const otMultiplier = num(settings["overtimeMultiplier"], 1.5);
  return { cadence, anchor, weekStart: fiscal.weekStart, otThresholdHours, otMultiplier };
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface PayPeriod {
  index: number; // signed block index from the anchor (0 = the anchor period)
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  startDate: Date;
  endDate: Date;
  label: string; // e.g. "Mar 3 – Mar 16, 2025"
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function periodLabel(start: Date, end: Date): string {
  const y = end.getFullYear();
  return `${fmt(start)} – ${fmt(end)}, ${y}`;
}

/** Length of a fixed-block cadence in days (semimonthly is handled separately). */
function blockDays(cadence: PayrollCadence): number {
  return cadence === "WEEKLY" ? 7 : 14;
}

/** The pay period (by signed block index) for a fixed-block cadence. */
function fixedPeriodByIndex(cfg: PayrollConfig, index: number): PayPeriod {
  const len = blockDays(cfg.cadence);
  const anchor = parseISO(cfg.anchor);
  const start = addDays(anchor, index * len);
  const end = addDays(start, len - 1);
  return { index, start: toISODate(start), end: toISODate(end), startDate: start, endDate: end, label: periodLabel(start, end) };
}

/** Semimonthly: 1st–15th and 16th–end-of-month. Index = monthsSinceAnchorMonth*2 + half. */
function semimonthlyByIndex(cfg: PayrollConfig, index: number): PayPeriod {
  const anchor = parseISO(cfg.anchor);
  const baseMonthIdx = anchor.getFullYear() * 12 + anchor.getMonth();
  const monthIdx = baseMonthIdx + Math.floor(index / 2);
  const half = ((index % 2) + 2) % 2; // 0 = first half, 1 = second half
  const y = Math.floor(monthIdx / 12);
  const m = monthIdx % 12;
  if (half === 0) {
    const start = atNoon(y, m, 1);
    const end = atNoon(y, m, 15);
    return { index, start: toISODate(start), end: toISODate(end), startDate: start, endDate: end, label: periodLabel(start, end) };
  }
  const start = atNoon(y, m, 16);
  const end = atNoon(y, m + 1, 0); // day 0 of next month = last day of this month
  return { index, start: toISODate(start), end: toISODate(end), startDate: start, endDate: end, label: periodLabel(start, end) };
}

export function payPeriodByIndex(cfg: PayrollConfig, index: number): PayPeriod {
  return cfg.cadence === "SEMIMONTHLY" ? semimonthlyByIndex(cfg, index) : fixedPeriodByIndex(cfg, index);
}

/** The pay period containing a given date. */
export function payPeriodForDate(cfg: PayrollConfig, date: Date): PayPeriod {
  if (cfg.cadence === "SEMIMONTHLY") {
    const baseMonthIdx = parseISO(cfg.anchor).getFullYear() * 12 + parseISO(cfg.anchor).getMonth();
    const monthIdx = date.getFullYear() * 12 + date.getMonth();
    const half = date.getDate() <= 15 ? 0 : 1;
    return semimonthlyByIndex(cfg, (monthIdx - baseMonthIdx) * 2 + half);
  }
  const len = blockDays(cfg.cadence);
  const offset = wholeDaysBetween(parseISO(cfg.anchor), date);
  const index = Math.floor(offset / len);
  return fixedPeriodByIndex(cfg, index);
}

/** Step a pay period forward (+1) or back (−1). */
export function stepPayPeriod(cfg: PayrollConfig, period: PayPeriod, dir: number): PayPeriod {
  return payPeriodByIndex(cfg, period.index + Math.sign(dir));
}

// ── Register computation ────────────────────────────────────────────────────

export interface PayrollEmployee {
  id: string;
  name: string;
  role: string;
  employmentType: string; // HOURLY | SALARY
  hourlyRate: number | null;
  annualSalary: number | null;
}

export interface ClockSpan {
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
}

export interface PayrollLineComputed {
  userId: string;
  name: string;
  role: string;
  employmentType: string;
  hourlyRateCents: number;
  regularHours: number;
  otHours: number;
  totalHours: number;
  regularPayCents: number;
  otPayCents: number;
  salaryPayCents: number;
  tipsCents: number;
  grossPayCents: number; // regular + ot + salary (adjustment + tips applied elsewhere)
}

const cents = (dollars: number) => Math.round(dollars * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Which workweek (0-based from the configured week start) a date belongs to. */
function workweekKey(date: Date, weekStart: number): number {
  // Days since an arbitrary fixed Sunday epoch, shifted to the week-start day.
  const days = Math.floor(date.getTime() / DAY_MS);
  // getDay via the date itself keeps it local-correct:
  const back = (date.getDay() - weekStart + 7) % 7;
  return days - back;
}

/**
 * Compute the gross-pay register for one period.
 * Hours are attributed to the workweek of each punch's clock-in; overtime is the
 * sum over workweeks of hours above the threshold, paid at the OT multiplier.
 * Open punches (no clock-out) are counted up to `nowMs`.
 */
export function computePayrollLines(
  period: PayPeriod,
  cfg: PayrollConfig,
  employees: PayrollEmployee[],
  spans: ClockSpan[],
  tipsByUser: Map<string, number>,
  nowMs: number,
): PayrollLineComputed[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  // userId → workweekKey → hours
  const weekHours = new Map<string, Map<number, number>>();

  for (const s of spans) {
    if (!empById.has(s.userId)) continue;
    const endMs = s.clockOut ? s.clockOut.getTime() : nowMs;
    const hrs = Math.max(0, (endMs - s.clockIn.getTime()) / 3_600_000);
    if (hrs <= 0) continue;
    const wk = workweekKey(s.clockIn, cfg.weekStart);
    let m = weekHours.get(s.userId);
    if (!m) { m = new Map(); weekHours.set(s.userId, m); }
    m.set(wk, (m.get(wk) ?? 0) + hrs);
  }

  const periodsPerYear = PERIODS_PER_YEAR[cfg.cadence];
  const lines: PayrollLineComputed[] = [];

  for (const emp of employees) {
    const weeks = weekHours.get(emp.id);
    const isSalary = emp.employmentType === "SALARY";
    // Admin/managers and salaried staff are overtime-exempt (#6) — all their
    // hours are paid as regular, no 1.5× split.
    const otExempt = isSalary || ["ADMIN", "MANAGER"].includes(emp.role);
    let totalHours = 0;
    let otHours = 0;
    if (weeks) {
      for (const wkHrs of weeks.values()) {
        totalHours += wkHrs;
        if (!otExempt && wkHrs > cfg.otThresholdHours) otHours += wkHrs - cfg.otThresholdHours;
      }
    }
    totalHours = round2(totalHours);
    otHours = round2(otHours);
    const regularHours = round2(Math.max(0, totalHours - otHours));

    const rate = Number(emp.hourlyRate ?? 0);
    const rateCents = cents(rate);

    let regularPayCents = 0;
    let otPayCents = 0;
    let salaryPayCents = 0;
    if (isSalary) {
      salaryPayCents = cents(Number(emp.annualSalary ?? 0) / periodsPerYear);
    } else {
      regularPayCents = cents(regularHours * rate);
      otPayCents = cents(otHours * rate * cfg.otMultiplier);
    }

    const tipsCents = cents(tipsByUser.get(emp.id) ?? 0);
    const grossPayCents = regularPayCents + otPayCents + salaryPayCents;

    // Skip employees with nothing to report (no hours, no salary).
    if (totalHours === 0 && salaryPayCents === 0 && tipsCents === 0) continue;

    lines.push({
      userId: emp.id,
      name: emp.name,
      role: emp.role,
      employmentType: emp.employmentType,
      hourlyRateCents: rateCents,
      regularHours,
      otHours,
      totalHours,
      regularPayCents,
      otPayCents,
      salaryPayCents,
      tipsCents,
      grossPayCents,
    });
  }

  lines.sort((a, b) => b.grossPayCents - a.grossPayCents || a.name.localeCompare(b.name));
  return lines;
}
