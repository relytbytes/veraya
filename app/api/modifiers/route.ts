import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const menuItemId = searchParams.get("menuItemId");

  const modifiers = await prisma.modifier.findMany({
    where: menuItemId
      ? { OR: [{ menuItemId }, { menuItemId: null }] }
      : {},
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  return Response.json(modifiers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { menuItemId, name, isRequired, maxSelect, sortOrder, options } = body as {
    menuItemId?: string;
    name: string;
    isRequired?: boolean;
    maxSelect?: number;
    sortOrder?: number;
    options: { name: string; priceAdj?: number; sortOrder?: number }[];
  };

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }
  if (!options?.length) {
    return Response.json({ error: "At least one option is required" }, { status: 400 });
  }

  const modifier = await prisma.modifier.create({
    data: {
      menuItemId: menuItemId ?? null,
      name,
      isRequired: isRequired ?? false,
      maxSelect: maxSelect ?? 1,
      sortOrder: sortOrder ?? 0,
      options: {
        create: options.map((o, i) => ({
          name: o.name,
          priceAdj: o.priceAdj ?? 0,
          sortOrder: o.sortOrder ?? i,
        })),
      },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json(modifier, { status: 201 });
}
