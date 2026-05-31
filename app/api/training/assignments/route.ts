import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const assignments = await prisma.trainingAssignment.findMany({
    include: {
      user: { select: { id: true, name: true, role: true } },
      assigner: { select: { id: true, name: true } },
      template: { include: { items: true } },
      signoffs: true,
    },
    orderBy: { assignedAt: "desc" },
  });

  return Response.json(assignments);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, templateId, dueDate } = body as {
    userId: string;
    templateId: string;
    dueDate?: string;
  };

  if (!userId || !templateId) {
    return Response.json({ error: "userId and templateId are required" }, { status: 400 });
  }

  const assignedBy = session.user?.id;
  if (!assignedBy) return Response.json({ error: "No session user" }, { status: 401 });

  try {
    const assignment = await prisma.trainingAssignment.create({
      data: {
        userId,
        templateId,
        assignedBy,
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        assigner: { select: { id: true, name: true } },
        template: { include: { items: true } },
        signoffs: true,
      },
    });
    return Response.json(assignment, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/training/assignments]", e);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
