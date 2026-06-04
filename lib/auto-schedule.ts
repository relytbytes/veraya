// Auto-scheduling (#13): forecast staffing need per daypart from sales history,
// then assign real, active staff to fill the slots — balancing each person's
// hours across the week and never double-booking. Output is draft (unpublished)
// shifts a manager reviews and publishes.

export interface SchedulingConfig {
  guestsPerOrder: number;
  coversPerServer: number;
  coversPerCook: number;
  coversPerBusser: number;
  hostMinCovers: number;     // add a host once a daypart exceeds this
  bartenderMinCovers: number;
  minServers: number;
  minCooks: number;
}

export const DEFAULT_SCHEDULING: SchedulingConfig = {
  guestsPerOrder: 2,
  coversPerServer: 22,
  coversPerCook: 35,
  coversPerBusser: 55,
  hostMinCovers: 25,
  bartenderMinCovers: 30,
  minServers: 1,
  minCooks: 1,
};

export function parseSchedulingConfig(raw: string | null | undefined): SchedulingConfig {
  if (!raw) return DEFAULT_SCHEDULING;
  try {
    const p = JSON.parse(raw) as Partial<SchedulingConfig>;
    return { ...DEFAULT_SCHEDULING, ...p };
  } catch {
    return DEFAULT_SCHEDULING;
  }
}

export type DaypartKey = "breakfast" | "lunch" | "dinner";

export interface Daypart {
  key: DaypartKey;
  start: string; // HH:MM
  end: string;   // HH:MM
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Carve the service window into the served dayparts (standard boundaries). */
export function daypartsFor(open: string, close: string, served: Record<string, boolean>): Daypart[] {
  const o = toMin(open), c = toMin(close);
  const bounds: { key: DaypartKey; from: number; to: number }[] = [
    { key: "breakfast", from: o, to: Math.min(c, toMin("11:00")) },
    { key: "lunch", from: Math.max(o, toMin("11:00")), to: Math.min(c, toMin("16:00")) },
    { key: "dinner", from: Math.max(o, toMin("16:00")), to: c },
  ];
  return bounds
    .filter((b) => served[b.key] !== false && b.to - b.from >= 60) // at least an hour
    .map((b) => ({ key: b.key, start: fromMin(b.from), end: fromMin(b.to) }));
}

export interface RoleNeed { role: string; position: string; count: number }

/** Required headcount by role for an expected cover count in one daypart. */
export function staffingForCovers(covers: number, cfg: SchedulingConfig): RoleNeed[] {
  if (covers <= 0) return [];
  const needs: RoleNeed[] = [
    { role: "SERVER", position: "Server", count: Math.max(cfg.minServers, Math.ceil(covers / cfg.coversPerServer)) },
    { role: "KITCHEN", position: "Kitchen", count: Math.max(cfg.minCooks, Math.ceil(covers / cfg.coversPerCook)) },
  ];
  const bussers = Math.floor(covers / cfg.coversPerBusser);
  if (bussers > 0) needs.push({ role: "SERVER_ASSISTANT", position: "Busser", count: bussers });
  if (covers >= cfg.hostMinCovers) needs.push({ role: "HOST", position: "Host", count: 1 });
  if (covers >= cfg.bartenderMinCovers) needs.push({ role: "BARTENDER", position: "Bar", count: 1 });
  return needs;
}

/** Which user roles can fill a given need role. */
const ROLE_FILLERS: Record<string, string[]> = {
  SERVER: ["SERVER"],
  KITCHEN: ["KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP", "KITCHEN_DISH"],
  HOST: ["HOST"],
  BARTENDER: ["BARTENDER"],
  SERVER_ASSISTANT: ["SERVER_ASSISTANT", "BARBACK"],
};
export function canFill(needRole: string, userRole: string): boolean {
  return (ROLE_FILLERS[needRole] ?? [needRole]).includes(userRole);
}

export interface PlanStaff { id: string; name: string; role: string }
export interface PlannedShift { userId: string; name: string; date: string; startTime: string; endTime: string; position: string; daypart: DaypartKey }
export interface PlanShortfall { date: string; daypart: DaypartKey; position: string; missing: number }

/**
 * Plan one day: for each served daypart, compute the role needs from forecast
 * covers and assign the least-loaded eligible staff member, skipping anyone who
 * already has an overlapping shift that day. Mutates `loadMins` to keep the week
 * balanced across calls.
 */
export function planDay(
  date: string,
  dayparts: Daypart[],
  coversByDaypart: Record<DaypartKey, number>,
  staff: PlanStaff[],
  cfg: SchedulingConfig,
  loadMins: Map<string, number>,
  busyByUser: Map<string, { start: number; end: number }[]>,
): { shifts: PlannedShift[]; shortfalls: PlanShortfall[] } {
  const shifts: PlannedShift[] = [];
  const shortfalls: PlanShortfall[] = [];

  for (const dp of dayparts) {
    const needs = staffingForCovers(coversByDaypart[dp.key] ?? 0, cfg);
    const span = { start: toMin(dp.start), end: toMin(dp.end) };
    const durMin = span.end - span.start;

    for (const need of needs) {
      const eligible = staff.filter((s) => canFill(need.role, s.role));
      let filled = 0;
      for (let i = 0; i < need.count; i++) {
        // Least-loaded eligible person with no overlapping shift today.
        const candidate = eligible
          .filter((s) => !(busyByUser.get(s.id) ?? []).some((b) => b.start < span.end && b.end > span.start))
          .sort((a, b) => (loadMins.get(a.id) ?? 0) - (loadMins.get(b.id) ?? 0))[0];
        if (!candidate) break;
        shifts.push({ userId: candidate.id, name: candidate.name, date, startTime: dp.start, endTime: dp.end, position: need.position, daypart: dp.key });
        loadMins.set(candidate.id, (loadMins.get(candidate.id) ?? 0) + durMin);
        const busy = busyByUser.get(candidate.id) ?? [];
        busy.push(span);
        busyByUser.set(candidate.id, busy);
        filled++;
      }
      if (filled < need.count) shortfalls.push({ date, daypart: dp.key, position: need.position, missing: need.count - filled });
    }
  }
  return { shifts, shortfalls };
}
