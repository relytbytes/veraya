import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const digits = q.replace(/\D/g, "");

  const customers = await prisma.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
            // Match phones on digits only so "602-569" finds "6025696208".
            ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : undefined,
    orderBy: [{ visitCount: "desc" }, { name: "asc" }],
    take: 50,
  });

  return Response.json(customers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name?: string; phone?: string; email?: string;
    birthday?: string; notes?: string; tags?: string;
  };

  if (!body.name?.trim() || !body.phone?.trim()) {
    return Response.json({ error: "name and phone are required" }, { status: 400 });
  }

  const customer = await prisma.customer.create({
    data: {
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      birthday: body.birthday?.trim() || null,
      notes: body.notes?.trim() || null,
      tags: body.tags?.trim() || null,
    },
  });

  return Response.json(customer, { status: 201 });
}
