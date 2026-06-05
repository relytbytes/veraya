import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";
import { publish } from "@/lib/realtime";

export async function GET() {
  // No auth — POS and kitchen both need this; public menu filters use it too
  const items = await prisma.eightySixItem.findMany({
    include: { menuItem: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { menuItemId, reason } = await req.json() as { menuItemId: string; reason?: string };
  if (!menuItemId) return Response.json({ error: "menuItemId required" }, { status: 400 });

  const item = await prisma.eightySixItem.upsert({
    where: { menuItemId },
    update: { reason: reason ?? null },
    create: { menuItemId, reason: reason ?? null },
    include: { menuItem: { select: { name: true } } },
  });

  emit({ type: "eightysix.add", menuItemId, name: item.menuItem.name, reason: reason });
  publish({ scope: "data", type: "eightysix.changed", ids: [menuItemId] });
  return Response.json(item, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { menuItemId } = await req.json() as { menuItemId: string };
  if (!menuItemId) return Response.json({ error: "menuItemId required" }, { status: 400 });

  await prisma.eightySixItem.deleteMany({ where: { menuItemId } });
  emit({ type: "eightysix.clear", menuItemId });
  publish({ scope: "data", type: "eightysix.changed", ids: [menuItemId] });
  return new Response(null, { status: 204 });
}
