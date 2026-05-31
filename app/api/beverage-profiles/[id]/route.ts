import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { category, bottleSizeMl, pourSizeMl, producer, vintage, abv } = body;

  const profile = await prisma.beverageProfile.update({
    where: { id },
    data: {
      ...(category !== undefined && { category }),
      ...(bottleSizeMl !== undefined && { bottleSizeMl }),
      ...(pourSizeMl !== undefined && { pourSizeMl }),
      ...(producer !== undefined && { producer }),
      ...(vintage !== undefined && { vintage }),
      ...(abv !== undefined && { abv }),
    },
    include: {
      ingredient: {
        include: { inventoryItem: true },
      },
    },
  });

  return Response.json(profile);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.beverageProfile.delete({ where: { id } });
  return Response.json({ success: true });
}
