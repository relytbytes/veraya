import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tables = await prisma.table.findMany({
    orderBy: { number: "asc" },
    include: {
      orders: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY"] } },
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { items: { include: { menuItem: true } } },
      },
      server: { select: { id: true, name: true } },
    },
  });
  return Response.json(tables);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { number, capacity, shape } = body;

  if (!number || !capacity) {
    return Response.json({ error: "Number and capacity are required" }, { status: 400 });
  }

  const table = await prisma.table.create({
    data: { number, capacity, ...(shape ? { shape } : {}) },
  });
  return Response.json(table, { status: 201 });
}
