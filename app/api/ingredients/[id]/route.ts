import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, unit, costPerUnit, supplierId, barcode, minThreshold, maxThreshold, category } = body;

  const data: Record<string, unknown> = {
    ...(name !== undefined && { name }),
    ...(unit !== undefined && { unit }),
    ...(costPerUnit !== undefined && { costPerUnit: Number(costPerUnit) }),
    ...(supplierId !== undefined && { supplierId: supplierId || null }),
    ...(barcode !== undefined && { barcode: barcode || null }),
    ...(category !== undefined && ["KITCHEN", "BAR", "WINE"].includes(category) && { category }),
  };

  // Threshold fields live on the related InventoryItem. Each is applied
  // independently (max-only edits used to be silently dropped), and we upsert so
  // it works whether or not the ingredient already has an inventory row (a
  // nested `update` against a missing row threw and 500'd the whole save).
  if (minThreshold !== undefined || maxThreshold !== undefined) {
    data.inventoryItem = {
      upsert: {
        create: {
          quantity: 0,
          minThreshold: minThreshold !== undefined ? Number(minThreshold) : 0,
          ...(maxThreshold !== undefined && maxThreshold !== null && maxThreshold !== "" && { maxThreshold: Number(maxThreshold) }),
        },
        update: {
          ...(minThreshold !== undefined && { minThreshold: Number(minThreshold) }),
          ...(maxThreshold !== undefined && { maxThreshold: maxThreshold === null || maxThreshold === "" ? null : Number(maxThreshold) }),
        },
      },
    };
  }

  const ingredient = await prisma.ingredient.update({
    where: { id },
    data,
    include: { inventoryItem: true, supplier: true },
  });
  return Response.json(ingredient);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.ingredient.update({ where: { id }, data: { isActive: false } });
  return Response.json({ success: true });
}
