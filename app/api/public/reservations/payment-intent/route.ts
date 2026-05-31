import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

interface CardPolicy {
  enabled: boolean; holdAmountCents: number; chargeOnNoShow: boolean;
  refundOnCancel: boolean; cancelHours: number;
}

async function getCardPolicy(): Promise<CardPolicy | null> {
  const row = await prisma.restaurantSettings.findUnique({ where: { key: "reservationCardPolicy" } });
  if (!row) return null;
  try { return JSON.parse(row.value) as CardPolicy; } catch { return null; }
}

// POST /api/public/reservations/payment-intent
// Returns { required:false } when no card hold is needed, otherwise a Stripe
// PaymentIntent client secret. The hold uses manual capture so the card is only
// charged on a no-show (per the restaurant's card policy).
export async function POST(_req: NextRequest) {
  const policy = await getCardPolicy();
  if (!policy?.enabled) return Response.json({ required: false });

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return Response.json({ required: false }); // not configured → don't block booking

  const amountCents = policy.holdAmountCents ?? 2500;
  try {
    const stripe = new Stripe(secret, { apiVersion: "2026-04-22.dahlia" });
    const intent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      capture_method: "manual", // authorize a hold; capture only on no-show
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { purpose: "reservation_hold" },
    });
    return Response.json({ required: true, clientSecret: intent.client_secret, paymentIntentId: intent.id, amountCents });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError ? err.message : "Payment service unavailable.";
    return Response.json({ error: msg }, { status: 502 });
  }
}
