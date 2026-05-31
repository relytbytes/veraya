import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { templateId, title, description } = body as {
    templateId: string;
    title: string;
    description?: string;
  };

  if (!templateId || !title?.trim()) {
    return Response.json({ error: "templateId and title are required" }, { status: 400 });
  }

  // Compute next sortOrder
  const count = await prisma.trainingItem.count({ where: { templateId } });

  try {
    const item = await prisma.trainingItem.create({
      data: {
        templateId,
        title: title.trim(),
        description: description ?? null,
        sortOrder: count,
      },
    });
    return Response.json(item, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/training/items]", e);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
