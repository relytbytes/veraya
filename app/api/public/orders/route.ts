import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

// Lazily create the Stripe client so a missing key never crashes module load
// (online ordering is optional; it degrades to a clean 503 when unconfigured).
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key, { apiVersion: "2026-04-22.dahlia" }) : null;
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return Response.json({ error: "Online payments are not configured." }, { status: 503 });

  const body = await req.json();
  const { guestName, guestPhone, items, notes } = body as {
    guestName: string;
    guestPhone?: string;
    notes?: string;
    items: { menuItemId: string; quantity: number; notes?: string }[];
  };

  if (!guestName || !items || items.length === 0) {
    return Response.json(
      { error: "guestName and items are required" },
      { status: 400 }
    );
  }

  // Fetch current prices for all requested items
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds }, isActive: true },
    select: { id: true, price: true, name: true },
  });

  if (menuItems.length !== menuItemIds.length) {
    return Response.json(
      { error: "One or more menu items not found or unavailable" },
      { status: 400 }
    );
  }

  const priceMap = new Map(
    menuItems.map((m) => [m.id, Number(m.price)])
  );

  const subtotal = items.reduce((sum, item) => {
    return sum + (priceMap.get(item.menuItemId) ?? 0) * item.quantity;
  }, 0);

  const taxRate = 0.0875;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  // Create Stripe PaymentIntent (amount in cents)
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: "usd",
      metadata: { guestName, guestPhone: guestPhone ?? "" },
      automatic_payment_methods: { enabled: true },
    });
  } catch (err) {
    const msg = err instanceof Stripe.errors.StripeError
      ? err.message
      : "Payment service unavailable. Please try again.";
    return Response.json({ error: msg }, { status: 502 });
  }

  // Create the order (OPEN — will transition to IN_PROGRESS when payment confirmed via webhook)
  const order = await prisma.order.create({
    data: {
      type: "TAKEOUT",
      status: "OPEN",
      guestName,
      guestPhone: guestPhone ?? null,
      notes: notes ?? null,
      stripePaymentIntentId: paymentIntent.id,
      subtotal,
      tax,
      total,
      items: {
        create: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: priceMap.get(item.menuItemId) ?? 0,
          notes: item.notes ?? null,
        })),
      },
    },
    include: { items: { include: { menuItem: { select: { name: true } } } } },
  });

  return Response.json(
    {
      orderId: order.id,
      clientSecret: paymentIntent.client_secret,
      total,
      order,
    },
    { status: 201 }
  );
}
