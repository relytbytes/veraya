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
  const template = await prisma.trainingTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  if (!template) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, role, isActive } = body as { name?: string; role?: string | null; isActive?: boolean };

  try {
    const updated = await prisma.trainingTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return Response.json(updated);
  } catch (e: unknown) {
    console.error("[PATCH /api/training/templates/[id]]", e);
    return Response.json({ error: "Not found or database error" }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.trainingTemplate.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    console.error("[DELETE /api/training/templates/[id]]", e);
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
