import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// PATCH /api/events/[id]/tiers/[tierId] — edit a tier.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tierId } = await params;
  const body = await req.json() as {
    name?: string; description?: string | null;
    priceCents?: number; depositCents?: number | null; capacity?: number; active?: boolean; sortOrder?: number;
  };
  const tier = await prisma.eventTicketTier.update({
    where: { id: tierId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.priceCents !== undefined && { priceCents: Math.max(0, Math.round(body.priceCents)) }),
      ...(body.depositCents !== undefined && { depositCents: body.depositCents != null ? Math.max(0, Math.round(body.depositCents)) : null }),
      ...(body.capacity !== undefined && { capacity: Math.max(0, Math.round(body.capacity)) }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
    },
  });
  return Response.json(tier);
}

// DELETE — only if no tickets have been sold against it.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; tierId: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tierId } = await params;
  const sold = await prisma.eventOrderItem.count({
    where: { tierId, order: { status: { in: ["PAID", "CHECKED_IN", "PENDING"] } } },
  });
  if (sold > 0) {
    // Don't orphan sold tickets — deactivate instead.
    await prisma.eventTicketTier.update({ where: { id: tierId }, data: { active: false } });
    return Response.json({ ok: true, deactivated: true });
  }
  await prisma.eventTicketTier.delete({ where: { id: tierId } });
  return Response.json({ ok: true });
}
