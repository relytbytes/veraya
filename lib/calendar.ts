// US holiday detection — deterministic, no external API. Used as an exogenous
// signal in the demand forecast (holidays shift restaurant demand sharply, and a
// pure-history model misses them unless the same holiday happens to land on the
// same weekday in the lookback window).
//
// Returns the holiday name for a date, or null. Covers the federal holidays plus
// the food-service-relevant ones (Valentine's, Mother's/Father's Day, Halloween,
// Christmas/New Year's Eve) that most move covers.

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  // month 0-11, weekday 0=Sun..6=Sat, n=1..5 → day-of-month
  const first = new Date(year, month, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}
function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const last = new Date(year, month + 1, 0).getDate();
  const lastDow = new Date(year, month, last).getDay();
  return last - ((lastDow - weekday + 7) % 7);
}

export interface HolidayInfo {
  name: string;
  /** Rough demand tendency for a full-service restaurant; a starting prior the
   *  model can later refine from observed history. */
  tendency: "busy" | "slow" | "closed";
}

export function usHoliday(date: Date): HolidayInfo | null {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const md = (mm: number, dd: number) => m === mm && d === dd;

  if (md(0, 1)) return { name: "New Year's Day", tendency: "slow" };
  if (md(1, 14)) return { name: "Valentine's Day", tendency: "busy" };
  if (md(6, 4)) return { name: "Independence Day", tendency: "slow" };
  if (md(9, 31)) return { name: "Halloween", tendency: "busy" };
  if (md(11, 24)) return { name: "Christmas Eve", tendency: "busy" };
  if (md(11, 25)) return { name: "Christmas Day", tendency: "closed" };
  if (md(11, 31)) return { name: "New Year's Eve", tendency: "busy" };

  // Floating holidays
  if (m === 4 && d === lastWeekdayOfMonth(y, 4, 1)) return { name: "Memorial Day", tendency: "slow" };
  if (m === 8 && d === nthWeekdayOfMonth(y, 8, 1, 1)) return { name: "Labor Day", tendency: "slow" };
  if (m === 10 && d === nthWeekdayOfMonth(y, 10, 4, 4)) return { name: "Thanksgiving", tendency: "closed" };
  if (m === 4 && d === nthWeekdayOfMonth(y, 4, 0, 2)) return { name: "Mother's Day", tendency: "busy" };
  if (m === 5 && d === nthWeekdayOfMonth(y, 5, 0, 3)) return { name: "Father's Day", tendency: "busy" };

  return null;
}

/** Default multiplier prior for a holiday tendency (model can refine later). */
export function holidayMultiplier(info: HolidayInfo | null): number {
  if (!info) return 1;
  if (info.tendency === "busy") return 1.25;
  if (info.tendency === "slow") return 0.75;
  return 0.05; // "closed" — effectively no covers
}
