import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      orders: {
        where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
        include: { items: { include: { menuItem: true } }, server: { select: { id: true, name: true } } },
      },
    },
  });
  if (!table) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(table);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, capacity, notes, number, serviceStage, seatedAt, guestName, partySize, serverId, customerId } = body as {
    status?: string;
    capacity?: number;
    notes?: string;
    number?: number;
    serviceStage?: string | null;
    seatedAt?: string | null;
    guestName?: string | null;
    partySize?: number | null;
    serverId?: string | null;
    customerId?: string | null;
  };

  const force = new URL(req.url).searchParams.get("force") === "true";

  if (status && ["AVAILABLE", "DIRTY", "RESERVED"].includes(status) && !force) {
    const activeOrder = await prisma.order.findFirst({
      where: { tableId: id, status: { in: ["OPEN", "IN_PROGRESS", "READY"] } },
    });
    if (activeOrder) {
      return Response.json(
        { error: "Table has an active order. Close the check before changing status." },
        { status: 409 }
      );
    }
  }

  // Force-release: cancel any dangling open orders so they don't haunt the system
  if (force && status === "AVAILABLE") {
    await prisma.order.updateMany({
      where: { tableId: id, status: { in: ["OPEN", "IN_PROGRESS", "READY"] } },
      data: { status: "CANCELLED", closedAt: new Date() },
    });
  }

  // Determine serviceStage to write
  const isReleasing = status === "AVAILABLE";
  const stageToSet = isReleasing ? null : serviceStage !== undefined ? serviceStage : undefined;

  const updated = await prisma.table.update({
    where: { id },
    data: {
      ...(status && { status: status as never }),
      ...(capacity !== undefined && { capacity }),
      ...(notes !== undefined && { notes }),
      ...(number !== undefined && { number }),
      ...(isReleasing
        ? { serviceStage: null, stageUpdatedAt: null, seatedAt: null, guestName: null, partySize: null, serverId: null, customerId: null }
        : serviceStage !== undefined
        ? { serviceStage: stageToSet, stageUpdatedAt: new Date() }
        : {}),
      ...(seatedAt !== undefined && { seatedAt: seatedAt ? new Date(seatedAt) : null }),
      ...(guestName !== undefined && { guestName }),
      ...(partySize !== undefined && { partySize }),
      ...(serverId !== undefined && { serverId }),
      ...(customerId !== undefined && { customerId }),
    },
    include: { server: { select: { id: true, name: true } } },
  });

  publish({ scope: "floor", type: "table.updated", ids: [id] });
  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.table.delete({ where: { id } });
  return Response.json({ ok: true });
}
