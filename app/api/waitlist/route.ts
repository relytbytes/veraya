import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";
import { quoteWaitMinutes } from "@/lib/waitlist";

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

  if (!name || !partySize || !phone?.trim()) {
    return Response.json({ error: "name, partySize and phone are required" }, { status: 400 });
  }

  const entry = await prisma.waitlist.create({
    data: { name, partySize, phone, notes, customerId: customerId || null },
  });

  publish({ scope: "floor", type: "waitlist.created", ids: [entry.id] });

  // Auto wait-time quote so the host can tell the guest on the spot (#5).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const position = await prisma.waitlist.count({
    where: { status: "WAITING", addedAt: { gte: today, lte: entry.addedAt } },
  });
  const estWaitMins = await quoteWaitMinutes(entry.partySize, position);

  return Response.json({ ...entry, position, estWaitMins }, { status: 201 });
}
