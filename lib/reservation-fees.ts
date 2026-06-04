import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

// The reservation card hold is a manual-capture PaymentIntent. Showing up and
// being seated releases it; a no-show (or a late cancel) captures it as the fee.
// All Stripe calls degrade to no-ops when Stripe isn't configured.

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null;
}

export interface CardPolicy {
  enabled: boolean;
  holdAmountCents: number;
  chargeOnNoShow: boolean;
  refundOnCancel: boolean;
  cancelHours: number;
}

export async function getCardPolicy(): Promise<CardPolicy | null> {
  const row = await prisma.restaurantSettings.findUnique({ where: { key: "reservationCardPolicy" } });
  if (!row) return null;
  try { return JSON.parse(row.value) as CardPolicy; } catch { return null; }
}

/** Capture the hold (charge the fee). Returns cents captured, or null. */
async function captureHold(paymentIntentId: string): Promise<number | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const pi = await stripe.paymentIntents.capture(paymentIntentId);
    return pi.amount_received ?? pi.amount ?? null;
  } catch (err) {
    console.error("[reservation-fees] capture failed:", (err as Error)?.message ?? err);
    return null;
  }
}

/** Release a reservation's card hold (no charge) — e.g. when it's deleted. */
export async function releaseReservationHold(paymentIntentId: string | null): Promise<void> {
  if (paymentIntentId) await releaseHold(paymentIntentId);
}

/** Release the hold (no charge). */
async function releaseHold(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) return;
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err) {
    // Likely already captured or cancelled — non-fatal.
    console.error("[reservation-fees] release failed:", (err as Error)?.message ?? err);
  }
}

function hoursUntil(date: string, time: string): number {
  const when = new Date(`${date}T${time}:00`).getTime();
  return (when - Date.now()) / 3_600_000;
}

/**
 * Settle a reservation's card hold for a status transition.
 *  - SEATED / COMPLETED → release the hold (guest honored the booking).
 *  - NO_SHOW → capture if policy charges no-shows, else release.
 *  - CANCELLED → capture if it's a late cancel (within cancelHours, or the policy
 *    never refunds), else release.
 * Returns the fee captured in cents (if any). Best-effort; never throws.
 */
export async function settleReservationHold(
  reservation: { date: string; time: string; stripePaymentIntentId: string | null },
  newStatus: string,
): Promise<{ feeCents: number | null }> {
  const pi = reservation.stripePaymentIntentId;
  if (!pi) return { feeCents: null };

  if (newStatus === "SEATED" || newStatus === "COMPLETED") {
    await releaseHold(pi);
    return { feeCents: null };
  }

  const policy = await getCardPolicy();

  if (newStatus === "NO_SHOW") {
    if (policy?.chargeOnNoShow === false) { await releaseHold(pi); return { feeCents: null }; }
    return { feeCents: await captureHold(pi) };
  }

  if (newStatus === "CANCELLED") {
    const lateWindow = policy?.cancelHours ?? 24;
    const refunds = policy?.refundOnCancel !== false;
    const isLate = hoursUntil(reservation.date, reservation.time) < lateWindow;
    if (!refunds || isLate) return { feeCents: await captureHold(pi) };
    await releaseHold(pi);
    return { feeCents: null };
  }

  return { feeCents: null };
}
