import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getEventTicketing } from "@/lib/event-tickets";

// GET /api/events/[id]/ticketing — admin view: tiers + availability + attendee list + revenue.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const data = await getEventTicketing(id);
  if (!data) return Response.json({ error: "Not found" }, { status: 404 });

  // Attendees = orders that consumed seats (paid / checked in), most recent first.
  const orders = await prisma.eventOrder.findMany({
    where: { eventId: id, status: { in: ["PAID", "CHECKED_IN", "REFUNDED"] } },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  const paid = orders.filter((o) => o.status === "PAID" || o.status === "CHECKED_IN");
  const seatsSold = paid.reduce((a, o) => a + o.items.reduce((s, it) => s + it.quantity, 0), 0);
  const revenueCents = paid.reduce((a, o) => a + o.amountPaidCents, 0);
  const checkedIn = orders.filter((o) => o.status === "CHECKED_IN").length;

  return Response.json({
    enabled: data.event.ticketingEnabled,
    mode: data.event.ticketMode,
    tiers: data.tiers,
    totalRemaining: data.totalRemaining,
    orders: orders.map((o) => ({
      id: o.id,
      confirmationCode: o.confirmationCode,
      name: o.name,
      email: o.email,
      phone: o.phone,
      status: o.status,
      amountPaidCents: o.amountPaidCents,
      checkedInAt: o.checkedInAt,
      seats: o.items.reduce((s, it) => s + it.quantity, 0),
      items: o.items.map((it) => ({ tierName: it.tierName, quantity: it.quantity, unitPriceCents: it.unitPriceCents })),
      createdAt: o.createdAt,
    })),
    summary: { orders: paid.length, seatsSold, revenueCents, checkedIn },
  });
}
