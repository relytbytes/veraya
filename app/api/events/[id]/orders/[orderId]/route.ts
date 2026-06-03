import { NextRequest } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// PATCH /api/events/[id]/orders/[orderId] — { action: "checkin" | "uncheckin" | "refund" | "cancel" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; orderId: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { orderId } = await params;
  const { action } = await req.json() as { action?: string };
  const order = await prisma.eventOrder.findUnique({ where: { id: orderId } });
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  if (action === "checkin") {
    const updated = await prisma.eventOrder.update({ where: { id: orderId }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
    return Response.json(updated);
  }
  if (action === "uncheckin") {
    const updated = await prisma.eventOrder.update({ where: { id: orderId }, data: { status: "PAID", checkedInAt: null } });
    return Response.json(updated);
  }
  if (action === "refund" || action === "cancel") {
    // Refund the Stripe charge if there is one, then release the seats.
    if (order.stripePaymentIntentId && order.amountPaidCents > 0) {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) return Response.json({ error: "Payments not configured." }, { status: 503 });
      try {
        const stripe = new Stripe(secret, { apiVersion: "2026-04-22.dahlia" });
        await stripe.refunds.create({ payment_intent: order.stripePaymentIntentId });
      } catch (e) {
        return Response.json({ error: e instanceof Error ? e.message : "Refund failed" }, { status: 502 });
      }
    }
    const updated = await prisma.eventOrder.update({
      where: { id: orderId },
      data: { status: "REFUNDED", expiresAt: new Date() },
    });
    return Response.json(updated);
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}
