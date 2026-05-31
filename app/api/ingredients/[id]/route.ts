import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, unit, costPerUnit, supplierId, barcode, minThreshold, maxThreshold } = body;

  const ingredient = await prisma.ingredient.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(costPerUnit !== undefined && { costPerUnit }),
      ...(supplierId !== undefined && { supplierId: supplierId || null }),
      ...(barcode !== undefined && { barcode: barcode || null }),
      ...(minThreshold !== undefined && {
        inventoryItem: {
          update: {
            minThreshold,
            ...(maxThreshold !== undefined && { maxThreshold }),
          },
        },
      }),
    },
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
