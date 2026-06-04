import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { sendEmail, eventTicketEmail } from "@/lib/email";

/**
 * Email a paid event order its tickets (entry code + QR attachment + link to the
 * confirmation page). Fire-and-forget: no-ops without an email on file or when
 * Resend isn't configured, and never throws.
 */
export async function sendTicketEmail(orderId: string, origin: string): Promise<void> {
  try {
    const order = await prisma.eventOrder.findUnique({
      where: { id: orderId },
      include: { items: true, event: true },
    });
    if (!order || !order.email) return;

    const ticketUrl = `${origin}/special-events/${order.eventId}/confirmed?code=${order.confirmationCode}`;
    const { subject, html } = await eventTicketEmail(
      {
        name: order.name,
        confirmationCode: order.confirmationCode,
        amountPaidCents: order.amountPaidCents,
        items: order.items.map((it) => ({ tierName: it.tierName, quantity: it.quantity, unitPriceCents: it.unitPriceCents })),
        event: {
          name: order.event.name,
          date: order.event.date,
          startTime: order.event.startTime,
          endTime: order.event.endTime,
          venue: order.event.venue,
          ticketMode: order.event.ticketMode,
        },
      },
      ticketUrl,
    );

    let attachments;
    try {
      const buf = await QRCode.toBuffer(order.confirmationCode, { margin: 1, width: 320 });
      attachments = [{ filename: `ticket-${order.confirmationCode}.png`, content: buf.toString("base64") }];
    } catch { /* QR optional — entry code + link still work */ }

    await sendEmail({ to: order.email, subject, html, attachments });
  } catch (e) {
    console.error("[sendTicketEmail] failed (non-fatal):", e instanceof Error ? e.message : e);
  }
}

// What the guest is charged NOW per seat for a tier, given the event's mode.
// TICKET = full price; DEPOSIT = the deposit (balance settled at the venue).
export function chargePerSeatCents(
  tier: { priceCents: number; depositCents: number | null },
  mode: string,
): number {
  if (mode === "DEPOSIT") return tier.depositCents ?? tier.priceCents;
  return tier.priceCents;
}

export interface TierAvailability {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  depositCents: number | null;
  chargeNowCents: number;
  capacity: number;
  sold: number;
  remaining: number;
  active: boolean;
  sortOrder: number;
}

/**
 * Seats consumed per tier = PAID/CHECKED_IN orders + PENDING orders whose hold
 * hasn't expired. Returns a map of tierId → seats consumed. Used both to show
 * availability and to enforce capacity at checkout.
 */
async function soldByTier(eventId: string, tx: typeof prisma = prisma): Promise<Map<string, number>> {
  const now = new Date();
  const items = await tx.eventOrderItem.findMany({
    where: {
      tier: { eventId },
      order: {
        OR: [
          { status: { in: ["PAID", "CHECKED_IN"] } },
          { status: "PENDING", expiresAt: { gt: now } },
        ],
      },
    },
    select: { tierId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const it of items) map.set(it.tierId, (map.get(it.tierId) ?? 0) + it.quantity);
  return map;
}

/** Public-facing ticketing snapshot for an event: tiers + remaining seats. */
export async function getEventTicketing(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { ticketTiers: { orderBy: { sortOrder: "asc" } } },
  });
  if (!event) return null;
  const sold = await soldByTier(eventId);
  const tiers: TierAvailability[] = event.ticketTiers.map((t) => {
    const s = sold.get(t.id) ?? 0;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      priceCents: t.priceCents,
      depositCents: t.depositCents,
      chargeNowCents: chargePerSeatCents(t, event.ticketMode),
      capacity: t.capacity,
      sold: s,
      remaining: Math.max(0, t.capacity - s),
      active: t.active,
      sortOrder: t.sortOrder,
    };
  });
  const totalRemaining = tiers.filter((t) => t.active).reduce((a, t) => a + t.remaining, 0);
  return { event, tiers, totalRemaining };
}

/** Ambiguity-free 8-char confirmation code (no 0/O/1/I/B/8 lookalikes). */
export function generateConfirmationCode(): string {
  const A = "ACDEFGHJKLMNPQRSTUVWXYZ2345679";
  let s = "";
  for (let i = 0; i < 8; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export interface CheckoutLine {
  tierId: string;
  quantity: number;
}

/**
 * Atomically create a PENDING order that holds seats, enforcing per-tier
 * capacity inside the transaction so concurrent buyers can't oversell. The
 * caller then creates the Stripe Checkout session and stores its id.
 * Throws Error("SOLD_OUT:<tier name>") if a requested tier lacks seats.
 */
export async function createPendingOrder(opts: {
  eventId: string;
  name: string;
  email: string;
  phone?: string | null;
  lines: CheckoutLine[];
  holdMinutes?: number;
}) {
  const holdMs = (opts.holdMinutes ?? 30) * 60_000;
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: opts.eventId },
      include: { ticketTiers: true },
    });
    if (!event || !event.ticketingEnabled) throw new Error("TICKETING_DISABLED");

    const sold = await soldByTier(opts.eventId, tx as typeof prisma);
    const tierById = new Map(event.ticketTiers.map((t) => [t.id, t]));

    let amount = 0;
    const itemData: { tierId: string; tierName: string; quantity: number; unitPriceCents: number }[] = [];
    for (const line of opts.lines) {
      if (line.quantity <= 0) continue;
      const tier = tierById.get(line.tierId);
      if (!tier || !tier.active) throw new Error("INVALID_TIER");
      const remaining = tier.capacity - (sold.get(tier.id) ?? 0);
      if (line.quantity > remaining) throw new Error(`SOLD_OUT:${tier.name}`);
      const unit = chargePerSeatCents(tier, event.ticketMode);
      amount += unit * line.quantity;
      itemData.push({ tierId: tier.id, tierName: tier.name, quantity: line.quantity, unitPriceCents: unit });
    }
    if (itemData.length === 0) throw new Error("EMPTY_ORDER");

    // Link to an existing customer by phone/email (best-effort).
    const customer = opts.phone || opts.email
      ? await tx.customer.findFirst({
          where: { OR: [opts.phone ? { phone: opts.phone } : {}, opts.email ? { email: opts.email } : {}].filter((o) => Object.keys(o).length) },
        })
      : null;

    // Confirmation code must be unique; retry a couple times on the rare clash.
    let code = generateConfirmationCode();
    for (let i = 0; i < 3; i++) {
      const clash = await tx.eventOrder.findUnique({ where: { confirmationCode: code } });
      if (!clash) break;
      code = generateConfirmationCode();
    }

    const order = await tx.eventOrder.create({
      data: {
        eventId: opts.eventId,
        confirmationCode: code,
        name: opts.name,
        email: opts.email,
        phone: opts.phone ?? null,
        customerId: customer?.id ?? null,
        status: "PENDING",
        expiresAt: new Date(Date.now() + holdMs),
        items: { create: itemData },
      },
      include: { items: true },
    });
    return { order, amountCents: amount, mode: event.ticketMode, eventName: event.name };
  });
}
