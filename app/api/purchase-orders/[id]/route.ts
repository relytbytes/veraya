import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: true,
      supplier: { select: { id: true, name: true } },
      items: { include: { ingredient: true } },
    },
  });
  if (!po) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(po);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, notes, invoiceNumber, items: newItems } = body as {
    status?: string;
    notes?: string;
    invoiceNumber?: string;
    items?: { ingredientId: string; quantity: number; unitCost: number }[];
  };

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po) return Response.json({ error: "Not found" }, { status: 404 });

  if (status === "RECEIVED" && po.status === "RECEIVED") {
    return Response.json({ error: "Purchase order already received" }, { status: 409 });
  }

  // Item corrections require manager/admin
  if (newItems && !MANAGE_ROLES.includes(session.user?.role as string)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {};
  if (notes !== undefined) updateData.notes = notes;
  if (invoiceNumber !== undefined) updateData.invoiceNumber = invoiceNumber || null;
  if (status) {
    updateData.status = status;
    if (status === "ORDERED") updateData.orderedAt = now;
    if (status === "RECEIVED") updateData.receivedAt = now;
  }

  // Recalculate total if items are being corrected
  if (newItems) {
    updateData.totalAmount =
      Math.round(newItems.reduce((s, i) => s + i.quantity * i.unitCost, 0) * 100) / 100;
  }

  let updated;

  if (newItems && po.status === "RECEIVED") {
    // Correct a received PO: reverse old inventory deltas, apply new ones
    const ops = [
      // reverse old
      ...po.items.map((item) =>
        prisma.inventoryItem.updateMany({
          where: { ingredientId: item.ingredientId },
          data: { quantity: { decrement: Number(item.quantity) } },
        })
      ),
      // delete old items
      prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }),
      // apply new inventory
      ...newItems.map((item) =>
        prisma.inventoryItem.updateMany({
          where: { ingredientId: item.ingredientId },
          data: { quantity: { increment: item.quantity } },
        })
      ),
      // create new items
      ...newItems.map((item) =>
        prisma.purchaseOrderItem.create({
          data: { purchaseOrderId: id, ingredientId: item.ingredientId, quantity: item.quantity, unitCost: item.unitCost },
        })
      ),
      // update PO header
      prisma.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: { vendor: true, items: { include: { ingredient: true } } },
      }),
    ];
    const results = await prisma.$transaction(ops);
    updated = results[results.length - 1];
  } else if (newItems) {
    // Correct a non-received PO: just swap items
    const ops = [
      prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }),
      ...newItems.map((item) =>
        prisma.purchaseOrderItem.create({
          data: { purchaseOrderId: id, ingredientId: item.ingredientId, quantity: item.quantity, unitCost: item.unitCost },
        })
      ),
      prisma.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: { vendor: true, items: { include: { ingredient: true } } },
      }),
    ];
    const results = await prisma.$transaction(ops);
    updated = results[results.length - 1];
  } else if (status === "RECEIVED") {
    const ops = [
      ...po.items.map((item) =>
        prisma.inventoryItem.updateMany({
          where: { ingredientId: item.ingredientId },
          data: { quantity: { increment: Number(item.quantity) } },
        })
      ),
      ...po.items.map((item) =>
        prisma.inventoryTransaction.create({
          data: {
            ingredientId: item.ingredientId,
            quantity: item.quantity,
            type: "RECEIVED",
            notes: `PO #${id.slice(-6)}`,
            userId: session.user?.id ?? null,
          },
        })
      ),
      prisma.purchaseOrder.update({
        where: { id },
        data: updateData,
        include: { vendor: true, items: { include: { ingredient: true } } },
      }),
    ];
    const results = await prisma.$transaction(ops);
    updated = results[results.length - 1];
  } else {
    updated = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: { vendor: true, items: { include: { ingredient: true } } },
    });
  }

  return Response.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!MANAGE_ROLES.includes(session.user?.role as string)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po) return Response.json({ error: "Not found" }, { status: 404 });

  const ops = [
    // Reverse inventory if this PO was already received
    ...(po.status === "RECEIVED"
      ? po.items.map((item) =>
          prisma.inventoryItem.updateMany({
            where: { ingredientId: item.ingredientId },
            data: { quantity: { decrement: Number(item.quantity) } },
          })
        )
      : []),
    prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } }),
    prisma.purchaseOrder.delete({ where: { id } }),
  ];

  await prisma.$transaction(ops);
  return Response.json({ ok: true });
}
