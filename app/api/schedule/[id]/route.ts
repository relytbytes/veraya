import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const INCLUDE = { user: { select: { id: true, name: true, role: true } } } as const;

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const body = await req.json();
  const { userId, date, startTime, endTime, position, notes, isPublished } = body as {
    userId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    position?: string | null;
    notes?: string | null;
    isPublished?: boolean;
  };

  const shift = await prisma.shift.update({
    where: { id },
    data: {
      ...(userId !== undefined && { userId }),
      ...(date !== undefined && { date }),
      ...(startTime !== undefined && { startTime }),
      ...(endTime !== undefined && { endTime }),
      ...(position !== undefined && { position }),
      ...(notes !== undefined && { notes }),
      ...(isPublished !== undefined && {
        isPublished,
        publishedAt: isPublished ? new Date() : null,
      }),
    },
    include: INCLUDE,
  });

  return Response.json(shift);
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  await prisma.shift.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
