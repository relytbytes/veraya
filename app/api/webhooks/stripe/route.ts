import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    return Response.json({ error: msg }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    const order = await prisma.order.findFirst({
      where: { stripePaymentIntentId: pi.id },
    });

    if (order) {
      const amountPaid = pi.amount_received / 100;

      await prisma.$transaction([
        // Record the payment
        prisma.payment.create({
          data: {
            orderId: order.id,
            amount: amountPaid,
            tip: 0,
            method: "CREDIT",
            reference: pi.id,
          },
        }),
        // Advance order to IN_PROGRESS so it shows on kitchen display
        prisma.order.update({
          where: { id: order.id },
          data: { status: "IN_PROGRESS" },
        }),
      ]);
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    // Leave order as OPEN — guest can retry
    console.warn("Payment failed for PI", pi.id);
  }

  return Response.json({ received: true });
}
