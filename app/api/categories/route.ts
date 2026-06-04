import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { menuItems: true } } },
  });
  return Response.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, sortOrder, station, parentId } = body;

  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  // A subcategory inherits its parent's station so order routing stays correct.
  let resolvedStation = station === "BAR" ? "BAR" : "KITCHEN";
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId }, select: { station: true } });
    if (parent) resolvedStation = parent.station;
  }

  const category = await prisma.category.create({
    data: {
      name,
      description,
      sortOrder: sortOrder ?? 0,
      station: resolvedStation,
      parentId: parentId || null,
    },
  });
  return Response.json(category, { status: 201 });
}
