import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const assignment = await prisma.trainingAssignment.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, role: true } },
      assigner: { select: { id: true, name: true } },
      template: { include: { items: { orderBy: { sortOrder: "asc" } } } },
      signoffs: {
        include: { manager: { select: { id: true, name: true } } },
      },
    },
  });

  if (!assignment) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(assignment);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // Cascade: delete signoffs first, then assignment
    await prisma.trainingSignoff.deleteMany({ where: { assignmentId: id } });
    await prisma.trainingAssignment.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    console.error("[DELETE /api/training/assignments/[id]]", e);
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
