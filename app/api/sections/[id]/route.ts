import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

// PATCH /api/sections/[id] — update a section's server, name, or color.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { name, color, serverId } = await req.json() as { name?: string; color?: string; serverId?: string | null };

  const section = await prisma.serverSection.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(color !== undefined && { color }),
      ...(serverId !== undefined && { serverId: serverId || null }),
    },
    include: { server: { select: { id: true, name: true } }, tables: { select: { id: true, number: true } } },
  });
  publish({ scope: "floor", type: "section.updated", ids: [id] });
  return Response.json(section);
}

// DELETE /api/sections/[id] — detaches member tables, then removes the section.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.table.updateMany({ where: { sectionId: id }, data: { sectionId: null } });
  await prisma.serverSection.delete({ where: { id } });
  publish({ scope: "floor", type: "section.updated", ids: [id] });
  return Response.json({ ok: true });
}
