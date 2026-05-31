import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.trainingSignoff.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    console.error("[DELETE /api/training/signoffs/[id]]", e);
    return Response.json({ error: "Not found" }, { status: 404 });
  }
}
