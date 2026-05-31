import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: { _count: { select: { ingredients: true } } },
    orderBy: { name: "asc" },
  });
  return Response.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, contactName, email, phone, address, notes } = body;

  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });

  const supplier = await prisma.supplier.create({
    data: { name, contactName, email, phone, address, notes },
  });
  return Response.json(supplier, { status: 201 });
}
