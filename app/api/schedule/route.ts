import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const INCLUDE = { user: { select: { id: true, name: true, role: true } } } as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const where =
    from && to
      ? { date: { gte: from, lte: to } }
      : from
      ? { date: { gte: from } }
      : to
      ? { date: { lte: to } }
      : {};

  const shifts = await prisma.shift.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return Response.json(shifts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, date, startTime, endTime, position, notes } = body as {
    userId: string;
    date: string;
    startTime: string;
    endTime: string;
    position?: string;
    notes?: string;
  };

  if (!userId || !date || !startTime || !endTime) {
    return Response.json(
      { error: "userId, date, startTime, and endTime are required" },
      { status: 400 }
    );
  }

  const shift = await prisma.shift.create({
    data: { userId, date, startTime, endTime, position: position ?? null, notes: notes ?? null },
    include: INCLUDE,
  });

  return Response.json(shift, { status: 201 });
}
