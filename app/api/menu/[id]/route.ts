import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: { category: true, recipe: { include: { ingredient: true } } },
  });
  if (!item) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, price, categoryId, prepTime, isActive, imageUrl, recipe, trackCount, countRemaining } = body;

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price }),
      ...(categoryId !== undefined && { categoryId }),
      ...(prepTime !== undefined && { prepTime }),
      ...(isActive !== undefined && { isActive }),
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      ...(trackCount !== undefined && { trackCount }),
      ...(countRemaining !== undefined && { countRemaining: countRemaining === null ? null : Number(countRemaining) }),
      ...(recipe !== undefined && {
        recipe: {
          deleteMany: {},
          create: recipe.map((r: { ingredientId: string; quantity: number }) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantity,
          })),
        },
      }),
    },
    include: { category: true, recipe: { include: { ingredient: true } } },
  });
  return Response.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.menuItem.update({ where: { id }, data: { isActive: false } });
  return Response.json({ success: true });
}
