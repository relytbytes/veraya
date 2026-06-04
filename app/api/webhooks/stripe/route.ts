import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { sendEmail, orderConfirmationEmail } from "@/lib/email";
import { sendTicketEmail } from "@/lib/event-tickets";

// Lazily create the Stripe client so a missing key never crashes module load.
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return Response.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Webhook error";
    return Response.json({ error: msg }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;

    const order = await prisma.order.findFirst({
      where: { stripePaymentIntentId: pi.id },
      include: { items: { include: { menuItem: { select: { name: true } } } } },
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

      // Email the receipt (best-effort; no-op without Resend / guest email).
      if (order.guestEmail) {
        const { subject, html } = await orderConfirmationEmail({
          guestName: order.guestName,
          items: order.items.map((it) => ({ name: it.menuItem.name, quantity: it.quantity, unitPrice: Number(it.unitPrice) })),
          subtotal: Number(order.subtotal),
          tax: Number(order.tax),
          total: Number(order.total),
        });
        await sendEmail({ to: order.guestEmail, subject, html });
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const pi = event.data.object as Stripe.PaymentIntent;
    // Leave order as OPEN — guest can retry
    console.warn("Payment failed for PI", pi.id);
  }

  // ── Event ticket purchases (Stripe Checkout) ──
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "event_order" && session.metadata.orderId) {
      const eo = await prisma.eventOrder.findUnique({ where: { id: session.metadata.orderId } });
      // Idempotent — only promote a PENDING order.
      if (eo && eo.status === "PENDING") {
        await prisma.eventOrder.update({
          where: { id: eo.id },
          data: {
            status: "PAID",
            amountPaidCents: session.amount_total ?? eo.amountPaidCents,
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            expiresAt: null,
          },
        });
        // Text the entry code to the guest (best-effort; no-op without Twilio/phone).
        if (eo.phone) {
          const ev = await prisma.event.findUnique({ where: { id: eo.eventId }, select: { name: true } });
          await sendSms(eo.phone, `You're confirmed for ${ev?.name ?? "the event"}! Entry code: ${eo.confirmationCode}. Show this at check-in.`).catch(() => {});
        }
        // Email the tickets (entry code + QR; best-effort, no-op without Resend/email).
        await sendTicketEmail(eo.id, new URL(req.url).origin);
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind === "event_order" && session.metadata.orderId) {
      // Buyer abandoned checkout — release the held seats.
      await prisma.eventOrder.updateMany({
        where: { id: session.metadata.orderId, status: "PENDING" },
        data: { status: "CANCELLED", expiresAt: new Date() },
      });
    }
  }

  return Response.json({ received: true });
}
