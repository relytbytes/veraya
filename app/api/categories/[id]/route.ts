import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// PATCH /api/categories/[id] — update a category (name, description, sortOrder,
// and station: KITCHEN | BAR, which routes its items to the right display).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, description, sortOrder, station } = body as {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    station?: string;
  };

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    station?: string;
  } = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (station !== undefined) data.station = station === "BAR" ? "BAR" : "KITCHEN";

  const category = await prisma.category.update({ where: { id }, data });
  return Response.json(category);
}
