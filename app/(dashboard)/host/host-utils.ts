// Shared types, helpers, and the table-state derivation for the host stand.

export interface TableRow {
  id: string;
  number: number;
  capacity: number;
  status: string; // AVAILABLE | OCCUPIED | RESERVED | DIRTY
  serviceStage: string | null;
  stageUpdatedAt?: string | null;
  seatedAt: string | null;
  guestName: string | null;
  partySize: number | null;
  serverId: string | null;
  primaryTableId: string | null;
  floorX: number | null;
  floorY: number | null;
  rotation: number;
  shape: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
}

/** Roles that can be assigned to a floor section. */
export const SERVER_ROLES = ["SERVER", "BARTENDER", "HOST", "MANAGER", "ADMIN", "SERVER_ASSISTANT"];

/** Deterministic color for a server id, drawn from a brand-aligned palette. */
export function serverColor(id: string): string {
  const palette = ["#1E7A45", "#2E6EB0", "#D07020", "#A8401C", "#D44030", "#7A5AC2", "#2E9B9B", "#B0532E"];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
}

// ── Combine / merge tables ──────────────────────────────────────────────────

/** Tables linked into a primary (excluding the primary itself). */
export function linkedTablesOf(primaryId: string, tables: TableRow[]): TableRow[] {
  return tables.filter((t) => t.primaryTableId === primaryId);
}

/** Capacity of a table including any linked members. */
export function effectiveCapacity(table: TableRow, tables: TableRow[]): number {
  return table.capacity + linkedTablesOf(table.id, tables).reduce((s, t) => s + t.capacity, 0);
}

export function isCombinedPrimary(table: TableRow, tables: TableRow[]): boolean {
  return linkedTablesOf(table.id, tables).length > 0;
}

// ── Guest CRM helpers ───────────────────────────────────────────────────────

/** Split the comma-separated tags field into trimmed entries. */
export function parseTags(tags: string | null | undefined): string[] {
  return (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

/** Allergy entries follow the convention "Allergy:Nuts" in the tags field. */
export function parseAllergies(tags: string | null | undefined): string[] {
  return parseTags(tags)
    .filter((t) => /^allergy:/i.test(t))
    .map((t) => t.replace(/^allergy:/i, "").trim())
    .filter(Boolean);
}

/** Non-allergy tags (VIP, Regular, Window seat, …) for display as chips. */
export function displayTags(tags: string | null | undefined): string[] {
  return parseTags(tags).filter((t) => !/^allergy:/i.test(t));
}

export interface Recognition { label: string; tone: "vip" | "regular" | "new" | "none" }

/** Derive a recognition badge from explicit tags + visit count. */
export function recognition(c: { tags: string | null; visitCount: number } | null): Recognition {
  if (!c) return { label: "", tone: "none" };
  const tags = parseTags(c.tags).map((t) => t.toLowerCase());
  if (tags.includes("vip")) return { label: "VIP", tone: "vip" };
  if (c.visitCount === 0) return { label: "First-timer", tone: "new" };
  if (c.visitCount >= 5 || tags.includes("regular")) return { label: "Regular", tone: "regular" };
  return { label: `${c.visitCount} visits`, tone: "none" };
}

export function fmtLastVisit(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** Days until an "MM-DD" birthday (this year or next); null if absent/invalid. */
function daysUntilBirthday(bday: string | null): number | null {
  if (!bday) return null;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(bday.trim());
  if (!m) return null;
  const now = new Date();
  const mm = Number(m[1]) - 1, dd = Number(m[2]);
  let next = new Date(now.getFullYear(), mm, dd);
  let diff = Math.ceil((next.getTime() - now.getTime()) / 86400000);
  if (diff < 0) { next = new Date(now.getFullYear() + 1, mm, dd); diff = Math.ceil((next.getTime() - now.getTime()) / 86400000); }
  return diff;
}

/**
 * Vera's one-line read on a guest — synthesized client-side so the host gets
 * instant context (no API call, always available). Warm GM voice.
 */
export function veraGuestBrief(c: CustomerProfile): string | null {
  const tags = parseTags(c.tags).map((t) => t.toLowerCase());
  const allergies = parseAllergies(c.tags);
  const vip = tags.includes("vip");

  const lead: string[] = [];
  if (vip) lead.push("VIP");
  else if (c.visitCount === 0) lead.push("First time in");
  else if (c.visitCount >= 5 || tags.includes("regular")) lead.push(`Regular, ${c.visitCount} visits`);
  else lead.push(`${c.visitCount} visit${c.visitCount === 1 ? "" : "s"}`);

  if (c.visitCount > 0) {
    const lv = fmtLastVisit(c.lastVisitAt);
    if (lv) lead.push(`last here ${lv}`);
  }
  const bd = daysUntilBirthday(c.birthday);
  if (bd !== null && bd <= 7) lead.push(bd === 0 ? "birthday today" : `birthday in ${bd} days`);

  let s = lead.join(", ") + ".";
  if (allergies.length) s += ` Flag the kitchen on ${allergies.join(" and ")}.`;
  else if (vip) s += " Make the welcome obvious.";
  else if (c.visitCount === 0) s += " First impression counts.";
  return s;
}

export interface Reservation {
  id: string;
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone: string | null;
  email: string | null;
  tableId: string | null;
  notes: string | null;
  status: string; // PENDING | CONFIRMED | SEATED | CANCELLED | NO_SHOW
  requiresCard: boolean;
  cardHoldAmount: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  stripePaymentIntentId: string | null;
  table: { id: string; number: number } | null;
  customer: CustomerProfile | null;
}

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  notes: string | null;
  tags: string | null;
  visitCount: number;
  lastVisitAt: string | null;
  loyaltyPoints: number;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  partySize: number;
  phone: string | null;
  notes: string | null;
  status: string;
  addedAt: string;
  tableId: string | null;
}

export interface FloorObject {
  id: string; type: string; label: string;
  x: number; y: number; width: number; height: number;
  rotation: number; color: string;
}

export interface CardPolicy {
  enabled: boolean; holdAmountCents: number; chargeOnNoShow: boolean;
  refundOnCancel: boolean; cancelHours: number;
}

// ── Service periods ─────────────────────────────────────────────────────────

export const SERVICE_PERIODS = [
  { label: "All Day", start: "00:00", end: "23:59" },
  { label: "Breakfast", start: "05:00", end: "11:29" },
  { label: "Lunch", start: "11:30", end: "15:59" },
  { label: "Dinner", start: "16:00", end: "23:59" },
] as const;

export type PeriodLabel = (typeof SERVICE_PERIODS)[number]["label"];

// ── Service stages ──────────────────────────────────────────────────────────

export const SERVICE_STAGES = [
  "SEATED", "APPS", "ENTREES", "DESSERT", "CHECK_DROPPED", "CHECK_PAID", "BUSSING",
] as const;
export type ServiceStage = (typeof SERVICE_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  SEATED: "Seated", APPS: "Apps", ENTREES: "Entrees", DESSERT: "Dessert",
  CHECK_DROPPED: "Check Dropped", CHECK_PAID: "Check Paid", BUSSING: "Bussing",
};

// ── Time helpers ────────────────────────────────────────────────────────────

export function toISO(d: Date): string {
  // Local calendar date so late night doesn't roll to the next day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "HH:MM" → minutes since midnight. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Short time badge for a floor table, e.g. "7:30". */
export function fmtBadgeTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")}`;
}

export function fmtDateLabel(d: string): string {
  const dt = new Date(d + "T12:00:00");
  const today = toISO(new Date());
  const tomorrow = toISO(new Date(Date.now() + 86400000));
  if (d === today) return "Today";
  if (d === tomorrow) return "Tomorrow";
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function elapsedMin(since: string): number {
  return Math.floor((Date.now() - new Date(since).getTime()) / 60000);
}

/** "12m" / "1h 05m" elapsed since an ISO timestamp. */
export function fmtElapsed(since: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function isArrivingSoon(resTime: string): boolean {
  const [h, m] = resTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  const now = new Date();
  const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
  return diff >= -10 && diff <= 20;
}

export function inPeriod(time: string, period: PeriodLabel): boolean {
  if (period === "All Day") return true;
  const p = SERVICE_PERIODS.find((x) => x.label === period)!;
  return time >= p.start && time <= p.end;
}

/** Estimate wait (mins) for a waitlist entry by position and fitting tables. */
export function estimateWait(
  entry: { partySize: number },
  position: number,
  tables: { capacity: number }[],
  avgTurnMins = 45,
): number {
  const fitting = tables.filter((t) => t.capacity >= entry.partySize).length;
  if (fitting === 0) return position * avgTurnMins;
  return Math.ceil(position / Math.max(1, fitting)) * avgTurnMins;
}

// ── Reservation ↔ table queries ─────────────────────────────────────────────

const ACTIVE_BOOKED = ["PENDING", "CONFIRMED"];

/** The currently-seated reservation for a table (if any). */
export function seatedReservationForTable(tableId: string, reservations: Reservation[]): Reservation | null {
  return reservations.find((r) => r.tableId === tableId && r.status === "SEATED") ?? null;
}

/** The next not-yet-seated reservation assigned to a table, earliest first. */
export function nextReservationForTable(tableId: string, reservations: Reservation[]): Reservation | null {
  const upcoming = reservations
    .filter((r) => r.tableId === tableId && ACTIVE_BOOKED.includes(r.status))
    .sort((a, b) => a.time.localeCompare(b.time));
  return upcoming[0] ?? null;
}

// ── Table state derivation (the floor color/parity core) ────────────────────

export type TableState = "OPEN" | "UPCOMING" | "SEATED" | "DINING" | "CHECK" | "BUSSING" | "BLOCKED";

export interface TableVisual {
  state: TableState;
  /** Optional Tailwind classes for the table body. */
  cls: string;
  /** Inline brand colors (background/border/text) for exact palette control. */
  style: { background: string; borderColor: string; color: string };
  /** A short status word for the panel header. */
  label: string;
}

// Brand palette mirrored from mobile/lib/theme.ts (Teal + Navy + Warm Gold),
// plus navy-dark surfaces for the host stand's dark theme.
export const BRAND = {
  void: "#F2F4F7", surface: "#FFFFFF", surfaceHi: "#E9EDF2",
  rim: "#DCE2EA", rimBright: "#C3CCD8",
  pearl: "#0C1A1E", mist: "#475569", smoke: "#8A97A6",
  gold: "#21A090", goldBright: "#2BB39B", goldMuted: "#E7F4F1",
  jade: "#1E7A45", coral: "#D44030", sky: "#2E6EB0", ember: "#E0A82E",
  // Navy-dark surfaces (host stand)
  floorDark: "#0C1A1E", surfaceDark: "#131C2B", surfaceDark2: "#1B2433",
  rimDark: "#2C3A4D", textDim: "#94A1B2",
} as const;

// Each state's look on the warm-dark floor. Inline-style hexes keep the brand
// colors exact (Tailwind's palette is remapped, but these are semantic accents).
const STATE_STYLE: Record<TableState, { cls: string; style: { background: string; borderColor: string; color: string }; label: string }> = {
  OPEN:     { cls: "", style: { background: BRAND.surfaceDark2, borderColor: BRAND.rimDark, color: BRAND.textDim }, label: "Open" },
  UPCOMING: { cls: "", style: { background: BRAND.surfaceDark2, borderColor: BRAND.gold,    color: "#E9EDF2"     }, label: "Reserved" },
  SEATED:   { cls: "", style: { background: BRAND.jade,      borderColor: BRAND.jade,       color: "#FFFFFF"   }, label: "Seated" },
  DINING:   { cls: "", style: { background: BRAND.ember,     borderColor: BRAND.ember,      color: "#0C1A1E"   }, label: "Dining" },
  CHECK:    { cls: "", style: { background: BRAND.sky,       borderColor: BRAND.sky,        color: "#FFFFFF"   }, label: "Check" },
  BUSSING:  { cls: "", style: { background: BRAND.coral,     borderColor: BRAND.coral,      color: "#FFFFFF"   }, label: "Bussing" },
  BLOCKED:  { cls: "", style: { background: "#334155",       borderColor: "#475569",        color: "#CBD5E1"   }, label: "Blocked" },
};

// Short, precise course-stage labels for the floor chip + panel, so every
// system (host, POS, KDS) reads the same words. The color stays bucketed by
// state; only the label is stage-precise.
const STAGE_SHORT: Record<string, string> = {
  SEATED: "Seated", APPS: "Apps", ENTREES: "Entrees", DESSERT: "Dessert",
  CHECK_DROPPED: "Check", CHECK_PAID: "Paid", BUSSING: "Bussing",
};

export function deriveTableState(table: TableRow): TableVisual {
  let state: TableState;
  let stageLabel: string | undefined;
  if (table.status === "OCCUPIED") {
    const stage = table.serviceStage ?? "SEATED";
    if (stage === "SEATED" || stage === "APPS") state = "SEATED";
    else if (stage === "ENTREES" || stage === "DESSERT") state = "DINING";
    else if (stage === "CHECK_DROPPED" || stage === "CHECK_PAID") state = "CHECK";
    else state = "BUSSING";
    stageLabel = STAGE_SHORT[stage];
  } else if (table.status === "DIRTY") {
    state = "BUSSING";
  } else {
    state = "OPEN"; // refined to UPCOMING by the caller when a reservation is assigned
  }
  return { state, ...STATE_STYLE[state], ...(stageLabel ? { label: stageLabel } : {}) };
}

export function stateStyle(state: TableState) {
  return STATE_STYLE[state];
}
