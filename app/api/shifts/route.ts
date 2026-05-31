import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/shifts?weekStart=YYYY-MM-DD
// Returns all shifts for the 7-day window starting on weekStart
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart"); // YYYY-MM-DD

  // Validate weekStart is a real date before using it
  if (weekStart && isNaN(new Date(weekStart + "T00:00:00").getTime())) {
    return Response.json({ error: "Invalid weekStart date" }, { status: 400 });
  }

  const where = weekStart
    ? {
        date: {
          gte: weekStart,
          lte: offsetDate(weekStart, 6),
        },
      }
    : {};

  const shifts = await prisma.shift.findMany({
    where,
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return Response.json(shifts);
}

// POST /api/shifts
// Body: { userId, date, startTime, endTime, position?, notes? }
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
    return Response.json({ error: "userId, date, startTime, endTime are required" }, { status: 400 });
  }

  const shift = await prisma.shift.create({
    data: {
      userId,
      date,
      startTime,
      endTime,
      position: position || null,
      notes: notes || null,
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  return Response.json(shift, { status: 201 });
}

// PATCH /api/shifts?weekStart=YYYY-MM-DD&action=publish|unpublish
// Bulk-publish or unpublish all shifts for a given week
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("weekStart");
  const action = searchParams.get("action");

  if (!weekStart || !action) {
    return Response.json({ error: "weekStart and action are required" }, { status: 400 });
  }
  if (!["publish", "unpublish"].includes(action)) {
    return Response.json({ error: "action must be publish or unpublish" }, { status: 400 });
  }

  const now = new Date();
  const result = await prisma.shift.updateMany({
    where: {
      date: { gte: weekStart, lte: offsetDate(weekStart, 6) },
    },
    data: {
      isPublished: action === "publish",
      publishedAt: action === "publish" ? now : null,
    },
  });

  return Response.json({ updated: result.count, published: action === "publish" });
}

// Helper: add N days to a YYYY-MM-DD string
function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
