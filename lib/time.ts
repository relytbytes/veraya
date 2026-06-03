// Timezone-aware "business day" helpers. Vercel runs in UTC, so a naive
// new Date().getDate() rolls over to tomorrow at ~7pm Central — which made Vera
// think dinner service "hadn't started." All day boundaries + the current hour
// for Vera/reports must be computed in the restaurant's local timezone.
//
// Set RESTAURANT_TZ (IANA, e.g. "America/Chicago") to match the venue.

export const RESTAURANT_TZ = process.env.RESTAURANT_TZ || "America/Chicago";

/** Resolve the venue timezone: the saved Settings value wins, then the env
 *  default, then US Central. Pass the `timezone` setting in from the caller. */
export function resolveTz(saved?: string | null): string {
  return (saved && saved.trim()) || RESTAURANT_TZ;
}

/** Milliseconds to add to a UTC instant to get wall-clock time in `tz`. */
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUTC - at.getTime();
}

/** A Date whose UTC fields equal the tz wall-clock fields (read with getUTC*). */
export function nowInTZ(at: Date = new Date(), tz: string = RESTAURANT_TZ): Date {
  return new Date(at.getTime() + tzOffsetMs(tz, at));
}

/** Local calendar date "YYYY-MM-DD" for the business day containing `at`. */
export function localDateStr(at: Date = new Date(), tz: string = RESTAURANT_TZ): string {
  const l = nowInTZ(at, tz);
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}-${String(l.getUTCDate()).padStart(2, "0")}`;
}

/** Start/end UTC instants of the tz-local day containing `at`. */
export function dayWindow(at: Date = new Date(), tz: string = RESTAURANT_TZ): { start: Date; end: Date } {
  const l = nowInTZ(at, tz);
  const y = l.getUTCFullYear(), m = l.getUTCMonth(), d = l.getUTCDate();
  const startGuess = Date.UTC(y, m, d, 0, 0, 0);
  const off = tzOffsetMs(tz, new Date(startGuess)); // re-derive at midnight for DST safety
  const start = new Date(startGuess - off);
  const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  return { start, end };
}

/** Current local hour as a float, e.g. 19.27 for 7:16pm. */
export function localHourFloat(at: Date = new Date(), tz: string = RESTAURANT_TZ): number {
  const l = nowInTZ(at, tz);
  return l.getUTCHours() + l.getUTCMinutes() / 60;
}

/** Day-of-week (0=Sun..6=Sat) for the local business day. */
export function localDow(at: Date = new Date(), tz: string = RESTAURANT_TZ): number {
  return nowInTZ(at, tz).getUTCDay();
}

/** UTC instant of local midnight beginning calendar date "YYYY-MM-DD" in `tz`. */
export function startOfLocalDay(dateStr: string, tz: string = RESTAURANT_TZ): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, (m || 1) - 1, d || 1, 0, 0, 0);
  const off = tzOffsetMs(tz, new Date(guess)); // re-derive at that date for DST safety
  return new Date(guess - off);
}

/** UTC instant ending the local calendar date "YYYY-MM-DD" (23:59:59.999). */
export function endOfLocalDay(dateStr: string, tz: string = RESTAURANT_TZ): Date {
  return new Date(startOfLocalDay(dateStr, tz).getTime() + 24 * 3600 * 1000 - 1);
}

/** Resolve a {from,to}=YYYY-MM-DD pair into the UTC window spanning those local
 *  days (inclusive). Either side may be null to fall back to `defaults` (else
 *  today). Also returns the normalized YYYY-MM-DD strings actually used. */
export function rangeFromParams(
  from: string | null | undefined,
  to: string | null | undefined,
  tz: string = RESTAURANT_TZ,
  defaults?: { from?: string; to?: string },
): { start: Date; end: Date; fromStr: string; toStr: string } {
  const fromStr = (from && from.trim()) || defaults?.from || localDateStr(new Date(), tz);
  const toStr = (to && to.trim()) || defaults?.to || fromStr;
  return { start: startOfLocalDay(fromStr, tz), end: endOfLocalDay(toStr, tz), fromStr, toStr };
}
