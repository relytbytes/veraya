import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { followUp, resolvedAt, title, body: entryBody } = body as {
    followUp?: string;
    resolvedAt?: string | null;
    title?: string;
    body?: string;
  };

  try {
    const updated = await prisma.managerLogEntry.update({
      where: { id },
      data: {
        ...(followUp !== undefined && { followUp }),
        ...(resolvedAt !== undefined && { resolvedAt: resolvedAt ? new Date(resolvedAt) : null }),
        ...(title !== undefined && { title }),
        ...(entryBody !== undefined && { body: entryBody }),
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    return Response.json(updated);
  } catch (e: unknown) {
    console.error("[PATCH /api/manager-log/[id]]", e);
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
    await prisma.managerLogEntry.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    console.error("[DELETE /api/manager-log/[id]]", e);
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
