import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      reservations: { orderBy: { createdAt: "desc" }, take: 10 },
      waitlist: { orderBy: { addedAt: "desc" }, take: 10 },
    },
  });

  if (!customer) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(customer);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    name?: string; phone?: string | null; email?: string | null;
    birthday?: string | null; notes?: string | null; tags?: string | null;
    visitCount?: number; lastVisitAt?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
  if (body.email !== undefined) data.email = body.email?.trim() || null;
  if (body.birthday !== undefined) data.birthday = body.birthday?.trim() || null;
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null;
  if (body.tags !== undefined) data.tags = body.tags?.trim() || null;
  if (body.visitCount !== undefined) data.visitCount = body.visitCount;
  if (body.lastVisitAt !== undefined) data.lastVisitAt = body.lastVisitAt ? new Date(body.lastVisitAt) : null;

  const customer = await prisma.customer.update({ where: { id }, data });
  return Response.json(customer);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.customer.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
