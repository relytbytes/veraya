// 5-4-4 fiscal calendar.
//
// Restaurant financial close runs on fiscal periods, not ragged calendar months.
// Each quarter is 13 weeks split 5 + 4 + 4, so the four quarters cover 52 weeks
// and the year breaks into 12 periods that always begin and end on a week
// boundary. Weeks start Monday; the fiscal year begins on the Monday of the week
// that contains January 1 (so it may start in the last days of December).
//
// A 53-week year (the calendar drifts ~1 day/year, +1 week every ~5–6 years) is
// absorbed into the final period — P12 simply runs long up to the next fiscal
// year's start, so periods are always contiguous and the whole year is covered.

export const WEEK_START = 1; // Monday (0 = Sunday)

// Weeks per period, repeating 5-4-4 across the four quarters.
const PATTERN = [5, 4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function atNoon(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 12, 0, 0, 0); // noon avoids DST edge cases on date math
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Local YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** "Jan 1" / "Feb 4". */
export function fmtShort(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** The Monday of the week that contains January 1 of `year`. */
export function fiscalYearStart(year: number): Date {
  const jan1 = atNoon(year, 0, 1);
  const offset = (jan1.getDay() - WEEK_START + 7) % 7; // days since the week-start day
  return addDays(jan1, -offset);
}

export interface FiscalPeriod {
  year: number;        // fiscal year (anchored to its January)
  n: number;           // period number 1..12
  quarter: number;     // 1..4
  label: string;       // "P1"
  weeks: number;       // 4, 5, or 6 (53-week years)
  from: string;        // inclusive start, YYYY-MM-DD
  to: string;          // inclusive end, YYYY-MM-DD
  fromDate: Date;
  toDate: Date;
}

/** All 12 fiscal periods for a fiscal year. */
export function getFiscalPeriods(year: number): FiscalPeriod[] {
  const start = fiscalYearStart(year);
  const nextStart = fiscalYearStart(year + 1);
  const periods: FiscalPeriod[] = [];
  let cursor = start;
  for (let i = 0; i < 12; i++) {
    // End-exclusive boundary; the last period absorbs any 53rd week.
    const endExclusive = i === 11 ? nextStart : addDays(cursor, PATTERN[i] * 7);
    const end = addDays(endExclusive, -1);
    const weeks = Math.round((endExclusive.getTime() - cursor.getTime()) / (7 * 86_400_000));
    periods.push({
      year, n: i + 1, quarter: Math.floor(i / 3) + 1, label: `P${i + 1}`, weeks,
      from: toISODate(cursor), to: toISODate(end), fromDate: cursor, toDate: end,
    });
    cursor = endExclusive;
  }
  return periods;
}

export interface FiscalQuarter {
  year: number; quarter: number; label: string;
  from: string; to: string; fromDate: Date; toDate: Date; periods: number[];
}

/** The four quarters for a fiscal year (each spans its three periods). */
export function getFiscalQuarters(year: number): FiscalQuarter[] {
  const periods = getFiscalPeriods(year);
  return [1, 2, 3, 4].map((q) => {
    const ps = periods.filter((p) => p.quarter === q);
    const first = ps[0], last = ps[ps.length - 1];
    return {
      year, quarter: q, label: `Q${q}`,
      from: first.from, to: last.to, fromDate: first.fromDate, toDate: last.toDate,
      periods: ps.map((p) => p.n),
    };
  });
}

/** Full fiscal year span. */
export function getFiscalYearRange(year: number): { from: string; to: string; fromDate: Date; toDate: Date } {
  const periods = getFiscalPeriods(year);
  const first = periods[0], last = periods[11];
  return { from: first.from, to: last.to, fromDate: first.fromDate, toDate: last.toDate };
}

/** Which fiscal period a given date falls in (checks neighbouring fiscal years). */
export function findFiscalPeriod(date: Date): FiscalPeriod | null {
  const cy = date.getFullYear();
  for (const y of [cy + 1, cy, cy - 1]) {
    const ps = getFiscalPeriods(y);
    if (date >= ps[0].fromDate && date <= ps[11].toDate) {
      return ps.find((p) => date >= p.fromDate && date <= p.toDate) ?? null;
    }
  }
  return null;
}
