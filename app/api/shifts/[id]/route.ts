import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// PATCH /api/shifts/[id]
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const body = await req.json();
  const { userId, date, startTime, endTime, position, notes } = body as {
    userId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    position?: string | null;
    notes?: string | null;
  };

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      ...(userId !== undefined && { userId }),
      ...(date !== undefined && { date }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
      ...(position !== undefined && { position: position || null }),
      ...(notes !== undefined && { notes: notes || null }),
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  });

  return Response.json(shift);
}

// DELETE /api/shifts/[id]
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  await prisma.shift.delete({ where: { id } });
  return Response.json({ success: true });
}
