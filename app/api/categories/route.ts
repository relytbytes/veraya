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
  const { name, description, sortOrder, station } = body;

  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const category = await prisma.category.create({
    data: {
      name,
      description,
      sortOrder: sortOrder ?? 0,
      station: station === "BAR" ? "BAR" : "KITCHEN",
    },
  });
  return Response.json(category, { status: 201 });
}
