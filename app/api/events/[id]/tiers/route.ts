import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/events/[id]/tiers — add a ticket tier to an event.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    name?: string; description?: string | null;
    priceCents?: number; depositCents?: number | null; capacity?: number; sortOrder?: number;
  };
  if (!body.name?.trim() || body.priceCents == null || body.capacity == null) {
    return Response.json({ error: "Name, price and capacity are required." }, { status: 400 });
  }

  const count = await prisma.eventTicketTier.count({ where: { eventId: id } });
  const tier = await prisma.eventTicketTier.create({
    data: {
      eventId: id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      priceCents: Math.max(0, Math.round(body.priceCents)),
      depositCents: body.depositCents != null ? Math.max(0, Math.round(body.depositCents)) : null,
      capacity: Math.max(0, Math.round(body.capacity)),
      sortOrder: body.sortOrder ?? count,
    },
  });
  return Response.json(tier, { status: 201 });
}
