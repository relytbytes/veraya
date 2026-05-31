import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { assignmentId, itemId, notes } = body as {
    assignmentId: string;
    itemId: string;
    notes?: string;
  };

  if (!assignmentId || !itemId) {
    return Response.json({ error: "assignmentId and itemId are required" }, { status: 400 });
  }

  const signedOffBy = session.user?.id;
  if (!signedOffBy) return Response.json({ error: "No session user" }, { status: 401 });

  try {
    const signoff = await prisma.trainingSignoff.create({
      data: {
        assignmentId,
        itemId,
        signedOffBy,
        notes: notes ?? null,
      },
      include: { manager: { select: { id: true, name: true } } },
    });
    return Response.json(signoff, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/training/signoffs]", e);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
