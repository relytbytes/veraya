import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("categoryId");
  const activeOnly = searchParams.get("active") !== "false";

  const items = await prisma.menuItem.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    },
    include: {
      category: true,
      recipe: {
        include: { ingredient: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return Response.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, price, categoryId, prepTime, imageUrl, recipe, trackCount, countRemaining } = body;

  if (!name || !price || !categoryId) {
    return Response.json({ error: "Name, price, and category are required" }, { status: 400 });
  }

  const item = await prisma.menuItem.create({
    data: {
      name,
      description,
      price,
      categoryId,
      prepTime,
      imageUrl: imageUrl || null,
      trackCount: trackCount ?? false,
      countRemaining: countRemaining !== undefined ? Number(countRemaining) : null,
      recipe: recipe
        ? {
            create: recipe.map((r: { ingredientId: string; quantity: number }) => ({
              ingredientId: r.ingredientId,
              quantity: r.quantity,
            })),
          }
        : undefined,
    },
    include: { category: true, recipe: { include: { ingredient: true } } },
  });
  return Response.json(item, { status: 201 });
}
