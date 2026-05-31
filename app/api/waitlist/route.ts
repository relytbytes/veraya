import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entries = await prisma.waitlist.findMany({
    where: {
      status: "WAITING",
      addedAt: { gte: today },
    },
    orderBy: { addedAt: "asc" },
  });

  return Response.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; partySize?: number; phone?: string; notes?: string; customerId?: string };
  const { name, partySize, phone, notes, customerId } = body;

  if (!name || !partySize) {
    return Response.json({ error: "name and partySize are required" }, { status: 400 });
  }

  const entry = await prisma.waitlist.create({
    data: { name, partySize, phone, notes, customerId: customerId || null },
  });

  publish({ scope: "floor", type: "waitlist.created", ids: [entry.id] });
  return Response.json(entry, { status: 201 });
}
