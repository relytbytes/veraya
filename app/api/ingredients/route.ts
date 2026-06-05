import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode");
  const search = searchParams.get("search");

  const ingredients = await prisma.ingredient.findMany({
    where: {
      isActive: true,
      ...(barcode ? { barcode } : {}),
      ...(search ? { name: { contains: search } } : {}),
    },
    include: { supplier: true, inventoryItem: true },
    orderBy: { name: "asc" },
  });
  return Response.json(ingredients);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, unit, costPerUnit, supplierId, barcode, minThreshold, maxThreshold, quantity, category } = body;

  if (!name || !unit || costPerUnit === undefined) {
    return Response.json({ error: "Name, unit, and cost are required" }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.create({
    data: {
      name,
      unit,
      costPerUnit,
      supplierId: supplierId || null,
      barcode: barcode || null,
      category: ["KITCHEN", "BAR", "WINE"].includes(category) ? category : "KITCHEN",
      inventoryItem: {
        create: {
          quantity: quantity != null ? Number(quantity) : 0, // initial on-hand
          minThreshold: minThreshold ?? 0,
          maxThreshold: maxThreshold ?? null,
        },
      },
    },
    include: { inventoryItem: true, supplier: true },
  });
  return Response.json(ingredient, { status: 201 });
}
