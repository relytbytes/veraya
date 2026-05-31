import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/staff/[id]/clock
// Toggles clock in/out for a staff member
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const notes: string | undefined = body.notes;

  // Wrap in a transaction to prevent double clock-in from concurrent requests
  // (double-tap on button, network retry, etc.)
  const result = await prisma.$transaction(async (tx) => {
    const openEntry = await tx.clockEntry.findFirst({
      where: { userId: id, clockOut: null },
      orderBy: { clockIn: "desc" },
    });

    if (openEntry) {
      // Clock out
      const entry = await tx.clockEntry.update({
        where: { id: openEntry.id },
        data: { clockOut: new Date(), ...(notes ? { notes } : {}) },
      });
      return { action: "clock_out" as const, entry };
    } else {
      // Clock in
      const entry = await tx.clockEntry.create({
        data: { userId: id, clockIn: new Date(), notes: notes ?? null },
      });
      return { action: "clock_in" as const, entry };
    }
  });

  return Response.json(result);
}

// GET /api/staff/[id]/clock — recent clock entries for this staff member
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entries = await prisma.clockEntry.findMany({
    where: { userId: id },
    orderBy: { clockIn: "desc" },
    take: 30,
  });
  return Response.json(entries);
}
