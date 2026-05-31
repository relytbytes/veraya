import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    quantity?: number;
    minThreshold?: number; maxThreshold?: number | null;
    storageArea?: string | null; shelfOrder?: number | null;
  };

  const data: Record<string, unknown> = {};
  if (body.quantity !== undefined) data.quantity = body.quantity;
  if (body.minThreshold !== undefined) data.minThreshold = body.minThreshold;
  if ("maxThreshold" in body) data.maxThreshold = body.maxThreshold ?? null;
  if ("storageArea" in body) data.storageArea = body.storageArea ?? null;
  if ("shelfOrder" in body) data.shelfOrder = body.shelfOrder ?? null;

  const updated = await prisma.inventoryItem.update({
    where: { id },
    data,
    include: { ingredient: true },
  });

  return Response.json(updated);
}
