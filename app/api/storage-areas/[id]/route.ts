import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { name, sortOrder } = await req.json();
  const area = await prisma.storageArea.update({
    where: { id },
    data: { ...(name && { name: name.trim() }), ...(sortOrder !== undefined && { sortOrder }) },
  });
  return Response.json(area);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const area = await prisma.storageArea.findUnique({ where: { id } });
  if (!area) return Response.json({ error: "Not found" }, { status: 404 });
  // Clear items assigned to this area
  await prisma.inventoryItem.updateMany({ where: { storageArea: area.name }, data: { storageArea: null, shelfOrder: null } });
  await prisma.storageArea.delete({ where: { id } });
  return Response.json({ ok: true });
}
