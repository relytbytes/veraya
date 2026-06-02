import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const profiles = await prisma.beverageProfile.findMany({
    include: {
      ingredient: {
        include: {
          inventoryItem: true,
        },
      },
    },
    orderBy: [{ category: "asc" }, { ingredient: { name: "asc" } }],
  });

  return Response.json(profiles);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { ingredientId, category, bottleSizeMl, pourSizeMl, producer, vintage, abv, binNumber, offerGlass, offerBottle } = body;

  if (!ingredientId || !category) {
    return Response.json({ error: "ingredientId and category are required" }, { status: 400 });
  }

  const profile = await prisma.beverageProfile.create({
    data: {
      ingredientId,
      category,
      bottleSizeMl: bottleSizeMl ?? 750,
      pourSizeMl: pourSizeMl ?? 44,
      producer: producer ?? null,
      vintage: vintage ?? null,
      abv: abv ?? null,
      binNumber: binNumber ?? null,
      offerGlass: offerGlass ?? false,
      offerBottle: offerBottle ?? true,
    },
    include: {
      ingredient: {
        include: { inventoryItem: true },
      },
    },
  });

  return Response.json(profile, { status: 201 });
}
