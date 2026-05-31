import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const INCLUDE = { user: { select: { id: true, name: true, role: true } } } as const;

// GET /api/timeclock — active clock-ins (clockOut IS NULL)
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const active = await prisma.clockEntry.findMany({
    where: { clockOut: null },
    include: INCLUDE,
    orderBy: { clockIn: "asc" },
  });

  return Response.json(active);
}

// POST /api/timeclock  body: { userId, action: "IN"|"OUT", notes? }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, action, notes } = body as {
    userId: string;
    action: "IN" | "OUT";
    notes?: string;
  };

  if (!userId || !action) {
    return Response.json({ error: "userId and action are required" }, { status: 400 });
  }
  if (action !== "IN" && action !== "OUT") {
    return Response.json({ error: 'action must be "IN" or "OUT"' }, { status: 400 });
  }

  if (action === "IN") {
    // Prevent double clock-in
    const existing = await prisma.clockEntry.findFirst({
      where: { userId, clockOut: null },
    });
    if (existing) {
      return Response.json({ error: "User is already clocked in" }, { status: 400 });
    }

    const entry = await prisma.clockEntry.create({
      data: { userId, clockIn: new Date(), notes: notes ?? null },
    });
    return Response.json(entry, { status: 201 });
  }

  // action === "OUT" — close the latest open entry
  const open = await prisma.clockEntry.findFirst({
    where: { userId, clockOut: null },
    orderBy: { clockIn: "desc" },
  });
  if (!open) {
    return Response.json({ error: "No active clock-in found for this user" }, { status: 400 });
  }

  const entry = await prisma.clockEntry.update({
    where: { id: open.id },
    data: { clockOut: new Date(), ...(notes !== undefined && { notes }) },
  });
  return Response.json(entry);
}
