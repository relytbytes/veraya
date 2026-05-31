import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { applyAutoTags } from "@/lib/customer-tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { status?: string; tableId?: string; notes?: string };
  const { status, tableId, notes } = body;

  const data: Record<string, unknown> = {};
  if (status !== undefined) data.status = status;
  if (tableId !== undefined) data.tableId = tableId;
  if (notes !== undefined) data.notes = notes;
  if (status === "SEATED") data.seatedAt = new Date();

  const updated = await prisma.waitlist.update({ where: { id }, data });

  // Bump visit count when seated, then refresh auto loyalty tags.
  if (status === "SEATED" && updated.customerId) {
    await prisma.customer.update({
      where: { id: updated.customerId },
      data: { visitCount: { increment: 1 }, lastVisitAt: new Date() },
    });
    await applyAutoTags(updated.customerId);
  }

  publish({ scope: "floor", type: "waitlist.updated", ids: [id] });
  return Response.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.waitlist.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
