import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { toMinutes, isTableBlockedAt, type TableBlock } from "@/lib/table-blocks";

export { toMinutes, isTableBlockedAt, type TableBlock };

/**
 * Single source of truth for reservation availability + booking.
 *
 * Both the public booking endpoint and the authenticated dashboard endpoints
 * use these helpers so availability and conflict rules can never diverge.
 *
 * Key rules:
 *  - Two reservations conflict when their [start, start + SLOT_DURATION_MINS)
 *    windows overlap (NOT just exact-time matches).
 *  - Availability is computed from *reservations*, table blocks, and capacity —
 *    never from the live floor `status` (a table occupied right now must not
 *    block a slot weeks in the future).
 *  - Booking is atomic: the conflict check and the insert happen inside one
 *    transaction, backed by a DB unique constraint as a final race backstop.
 */

/** Minutes a reservation is assumed to hold a table. */
export const SLOT_DURATION_MINS = 90;

/** Reservation statuses that occupy a table. CANCELLED / NO_SHOW free the slot. */
export const ACTIVE_RESERVATION_STATUSES = ["PENDING", "CONFIRMED", "SEATED"] as const;

/** Fallback slots when the restaurant has no configured reservationHours. */
const DEFAULT_SLOTS = [
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00",
  "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00",
];

// ── Time helpers ────────────────────────────────────────────────────────────


export function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Do two HH:MM times occupy overlapping [start, start+duration) windows? */
export function timesOverlap(a: string, b: string, durationMins = SLOT_DURATION_MINS): boolean {
  return Math.abs(toMinutes(a) - toMinutes(b)) < durationMins;
}

// ── Table blocks (stored as JSON in RestaurantSettings) ─────────────────────

function parseTableBlocks(value: string | null | undefined): TableBlock[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as TableBlock[];
  } catch {
    return [];
  }
}

/** Minimal client surface needed to read settings — satisfied by both the
 *  global client and an interactive transaction client. */
type SettingsReader = {
  restaurantSettings: { findUnique(args: { where: { key: string } }): Promise<{ value: string } | null> };
};

export async function getTableBlocks(client: SettingsReader = prisma): Promise<TableBlock[]> {
  const row = await client.restaurantSettings.findUnique({ where: { key: "tableBlocks" } });
  return parseTableBlocks(row?.value);
}

/** Max covers allowed within any overlapping window (pacing). null = unlimited. */
export async function getPacingLimit(client: SettingsReader = prisma): Promise<number | null> {
  const row = await client.restaurantSettings.findUnique({ where: { key: "reservationPacing" } });
  if (!row) return null;
  try {
    const n = (JSON.parse(row.value) as { maxCoversPerSlot?: number }).maxCoversPerSlot;
    return typeof n === "number" && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Covers already booked in the window overlapping `time`. */
export function coversInWindow(
  time: string,
  reservations: { time: string; partySize: number }[],
): number {
  return reservations
    .filter((r) => timesOverlap(r.time, time))
    .reduce((sum, r) => sum + r.partySize, 0);
}

// ── Reservation hours / slot generation ─────────────────────────────────────

type Period = "breakfast" | "lunch" | "dinner";

interface DayConfig {
  open: string;
  close: string;
  periods: Period[];
  enabled: boolean;
}

interface ReservationHours {
  monday: DayConfig; tuesday: DayConfig; wednesday: DayConfig; thursday: DayConfig;
  friday: DayConfig; saturday: DayConfig; sunday: DayConfig;
  slotInterval: number;
  maxPartySize: number;
  bufferMins: number;
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

export function slotPeriod(time: string): Period | null {
  const m = toMinutes(time);
  if (m >= toMinutes("05:00") && m <= toMinutes("11:29")) return "breakfast";
  if (m >= toMinutes("11:30") && m <= toMinutes("15:59")) return "lunch";
  if (m >= toMinutes("16:00") && m <= toMinutes("23:59")) return "dinner";
  return null;
}

async function getReservationHours(): Promise<ReservationHours | null> {
  const row = await prisma.restaurantSettings.findUnique({ where: { key: "reservationHours" } });
  if (!row) return null;
  try {
    return JSON.parse(row.value) as ReservationHours;
  } catch {
    return null;
  }
}

export interface DaySlots {
  slots: string[];
  dayEnabled: boolean;
  maxPartySize: number;
}

/** Bookable slot times for a date, honoring configured hours when present. */
export async function getSlotsForDate(date: string): Promise<DaySlots> {
  const hours = await getReservationHours();
  if (!hours) return { slots: DEFAULT_SLOTS, dayEnabled: true, maxPartySize: 10 };

  const dow = new Date(date + "T12:00:00").getDay();
  const day = hours[DAY_NAMES[dow]];
  const interval = hours.slotInterval ?? 30;
  const buffer = hours.bufferMins ?? 30;
  const maxPartySize = hours.maxPartySize ?? 10;

  if (!day?.enabled) return { slots: [], dayEnabled: false, maxPartySize };

  const start = toMinutes(day.open);
  const end = toMinutes(day.close) - buffer;
  const slots: string[] = [];
  for (let t = start; t <= end; t += interval) {
    const time = fromMinutes(t);
    const period = slotPeriod(time);
    if (period === null || day.periods.includes(period)) slots.push(time);
  }
  return { slots, dayEnabled: true, maxPartySize };
}

// ── Availability core ───────────────────────────────────────────────────────

export interface TableLite {
  id: string;
  number: number;
  capacity: number;
}

export interface ActiveReservationLite {
  tableId: string | null;
  time: string;
}

/**
 * Tables that can host a party at (date, time): large enough, not blocked, and
 * not overlapping an existing active reservation. Best-fit ordered (smallest
 * suitable table first) so large tables stay open for large parties.
 *
 * `partySize: 0` skips the capacity filter (used for manager manual assignment).
 */
export function freeTablesFor(opts: {
  date: string;
  time: string;
  partySize: number;
  tables: TableLite[];
  activeReservations: ActiveReservationLite[];
  blocks: TableBlock[];
}): TableLite[] {
  const { date, time, partySize, tables, activeReservations, blocks } = opts;

  const busy = new Set(
    activeReservations
      .filter((r) => r.tableId && timesOverlap(r.time, time))
      .map((r) => r.tableId as string),
  );

  return tables
    .filter((t) => partySize === 0 || t.capacity >= partySize)
    .filter((t) => !busy.has(t.id))
    .filter((t) => !isTableBlockedAt(t.id, date, time, blocks))
    .sort((a, b) => a.capacity - b.capacity);
}

export interface SlotAvailability {
  time: string;
  period: Period | null;
  available: boolean;
  availableTableCount: number;
}

/** Per-slot availability for a whole day + party size. */
export async function getDayAvailability(date: string, partySize: number) {
  const [{ slots, dayEnabled, maxPartySize }, tables, activeReservations, blocks, pacingLimit] = await Promise.all([
    getSlotsForDate(date),
    prisma.table.findMany({ select: { id: true, number: true, capacity: true }, orderBy: { number: "asc" } }),
    prisma.reservation.findMany({
      where: { date, status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
      select: { tableId: true, time: true, partySize: true },
    }),
    getTableBlocks(),
    getPacingLimit(),
  ]);

  const slotData: SlotAvailability[] = slots.map((time) => {
    const free = freeTablesFor({ date, time, partySize, tables, activeReservations, blocks });
    // Pacing: a slot is also "full" if seating this party would exceed the cover cap.
    const pacedOut = pacingLimit !== null && coversInWindow(time, activeReservations) + partySize > pacingLimit;
    return {
      time, period: slotPeriod(time),
      available: free.length > 0 && !pacedOut,
      availableTableCount: free.length,
    };
  });

  return { date, dayEnabled, maxPartySize, slots: slotData };
}

// ── Atomic booking ──────────────────────────────────────────────────────────

export type BookingFailure = "no_table" | "conflict" | "blocked" | "pacing";

class BookingError extends Error {
  constructor(public reason: BookingFailure) {
    super(reason);
  }
}

const RESERVATION_INCLUDE = {
  table: true,
  customer: {
    select: {
      id: true, name: true, phone: true, email: true, birthday: true,
      notes: true, tags: true, visitCount: true, lastVisitAt: true, loyaltyPoints: true,
    },
  },
} as const;

export type BookedReservation = Prisma.ReservationGetPayload<{ include: typeof RESERVATION_INCLUDE }>;

export interface BookingInput {
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  customerId?: string | null;
  status?: "PENDING" | "CONFIRMED";
  /** When set, validate & use this exact table. When omitted with autoAssign, pick best-fit. */
  tableId?: string | null;
  /** Auto-pick a free table when none provided (public instant booking). */
  autoAssign?: boolean;
  requiresCard?: boolean;
  cardHoldAmount?: number | null;
  stripePaymentIntentId?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
}

export type BookingResult =
  | { ok: true; reservation: BookedReservation }
  | { ok: false; reason: BookingFailure };

/**
 * Create a reservation atomically. The conflict check and the insert run in one
 * transaction; a DB unique index on (tableId, date, time) is the final backstop
 * against a concurrent racer that slips between the check and the write.
 */
export async function bookReservation(input: BookingInput): Promise<BookingResult> {
  const { date, time, partySize } = input;

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      // IMPORTANT: every read here must use `tx`, not the global client — a
      // stray global query inside an interactive transaction contends with the
      // SQLite single writer and deadlocks the transaction.
      const [tables, activeReservations, blocks, pacingLimit] = await Promise.all([
        tx.table.findMany({ select: { id: true, number: true, capacity: true } }),
        tx.reservation.findMany({
          where: { date, status: { in: [...ACTIVE_RESERVATION_STATUSES] } },
          select: { tableId: true, time: true, partySize: true },
        }),
        getTableBlocks(tx),
        getPacingLimit(tx),
      ]);

      // Pacing: reject if this party would push the overlapping window over the cap.
      if (pacingLimit !== null && coversInWindow(time, activeReservations) + partySize > pacingLimit) {
        throw new BookingError("pacing");
      }

      let chosenTableId: string | null = null;

      if (input.tableId) {
        // Explicit table (manager assignment or pre-chosen): validate it.
        const conflict = activeReservations.some(
          (r) => r.tableId === input.tableId && timesOverlap(r.time, time),
        );
        if (conflict) throw new BookingError("conflict");
        if (isTableBlockedAt(input.tableId, date, time, blocks)) throw new BookingError("blocked");
        chosenTableId = input.tableId;
      } else if (input.autoAssign) {
        // Instant booking: pick the smallest table that fits and is free.
        const free = freeTablesFor({ date, time, partySize, tables, activeReservations, blocks });
        if (free.length === 0) throw new BookingError("no_table");
        chosenTableId = free[0].id;
      }
      // else: no table requested and not auto-assigning → unassigned reservation.

      // Guest CRM: link to a customer record so visit history accrues. Use the
      // explicit customerId if given, else find-or-create by phone.
      let customerId = input.customerId || null;
      if (!customerId && input.phone?.trim()) {
        const phone = input.phone.trim();
        const existing = await tx.customer.findUnique({ where: { phone } });
        customerId = existing
          ? existing.id
          : (await tx.customer.create({
              data: { name: input.name, phone, email: input.email?.trim() || null },
            })).id;
      }

      return tx.reservation.create({
        data: {
          date,
          time,
          partySize,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          notes: input.notes ?? null,
          customerId,
          status: input.status ?? "CONFIRMED",
          tableId: chosenTableId,
          requiresCard: input.requiresCard ?? false,
          cardHoldAmount: input.cardHoldAmount ?? null,
          stripePaymentIntentId: input.stripePaymentIntentId || null,
          cardLast4: input.cardLast4 || null,
          cardBrand: input.cardBrand || null,
        },
        include: RESERVATION_INCLUDE,
      });
    });

    return { ok: true, reservation };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, reason: err.reason };
    // Unique index (tableId, date, time) tripped by a concurrent racer.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, reason: "conflict" };
    }
    throw err;
  }
}

/**
 * Check whether assigning `tableId` at (date, time) would collide with an
 * existing active reservation (excluding `ignoreReservationId`). Used by PATCH
 * before re-seating / moving a reservation. Overlap-aware.
 */
export async function tableHasConflict(opts: {
  tableId: string;
  date: string;
  time: string;
  ignoreReservationId?: string;
}): Promise<boolean> {
  const { tableId, date, time, ignoreReservationId } = opts;
  const existing = await prisma.reservation.findMany({
    where: {
      date,
      tableId,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      ...(ignoreReservationId ? { id: { not: ignoreReservationId } } : {}),
    },
    select: { time: true },
  });
  return existing.some((r) => timesOverlap(r.time, time));
}
