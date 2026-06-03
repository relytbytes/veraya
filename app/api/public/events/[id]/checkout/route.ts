import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { createPendingOrder, type CheckoutLine } from "@/lib/event-tickets";

// POST /api/public/events/[id]/checkout
// Body: { name, email, phone?, items: [{ tierId, quantity }] }
// Holds the seats (PENDING order) + opens a Stripe Checkout session.
// Returns { url } to redirect the buyer to Stripe.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string; email?: string; phone?: string; items?: CheckoutLine[];
  };
  const name = body.name?.trim();
  const email = body.email?.trim();
  const items = (body.items ?? []).filter((i) => i.tierId && i.quantity > 0);

  if (!name || !email || items.length === 0) {
    return Response.json({ error: "Name, email and at least one ticket are required." }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return Response.json({ error: "Online payments aren't set up yet." }, { status: 503 });

  let created;
  try {
    created = await createPendingOrder({ eventId: id, name, email, phone: body.phone?.trim() || null, lines: items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    if (msg.startsWith("SOLD_OUT:")) return Response.json({ error: `Sorry — "${msg.slice(9)}" just sold out. Adjust your selection.` }, { status: 409 });
    if (msg === "TICKETING_DISABLED") return Response.json({ error: "Tickets aren't on sale for this event." }, { status: 400 });
    if (msg === "EMPTY_ORDER") return Response.json({ error: "Pick at least one ticket." }, { status: 400 });
    return Response.json({ error: "Couldn't start checkout. Please try again." }, { status: 400 });
  }

  const { order, mode, eventName } = created;
  const stripe = new Stripe(secret, { apiVersion: "2026-04-22.dahlia" });
  const origin = new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: order.items.map((it) => ({
        quantity: it.quantity,
        price_data: {
          currency: "usd",
          unit_amount: it.unitPriceCents,
          product_data: { name: `${eventName} — ${it.tierName}${mode === "DEPOSIT" ? " (deposit)" : ""}` },
        },
      })),
      metadata: { kind: "event_order", orderId: order.id, eventId: id },
      payment_intent_data: { metadata: { kind: "event_order", orderId: order.id } },
      success_url: `${origin}/special-events/${id}/confirmed?code=${order.confirmationCode}`,
      cancel_url: `${origin}/special-events/${id}?canceled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    await prisma.eventOrder.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return Response.json({ url: session.url });
  } catch {
    // Couldn't open Stripe — release the held seats so they aren't stuck PENDING.
    await prisma.eventOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", expiresAt: new Date() } }).catch(() => {});
    return Response.json({ error: "Payment provider error. Please try again." }, { status: 502 });
  }
}
