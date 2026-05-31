import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      items: { some: { heldForFire: false } }, // Only surface orders that have at least one fired item
      ...(since ? { updatedAt: { gt: new Date(since) } } : {}),
    },
    include: {
      table: true,
      server: { select: { id: true, name: true } },
      items: {
        where: { heldForFire: false }, // Held items are invisible to the kitchen until fired from POS
        include: {
          menuItem: { select: { id: true, name: true, prepTime: true } },
          modifiers: { include: { option: { select: { id: true, name: true, priceAdj: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(orders);
}

// PATCH /api/kitchen — update an order item's status (sentAt / completedAt)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { orderId, orderItemId, action } = body as {
    orderId?: string;
    orderItemId?: string;
    action: "send" | "complete" | "bump";
  };

  // "bump" = mark entire order as READY
  if (action === "bump" && orderId) {
    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: "READY" },
      include: {
        table: true,
        items: { include: { menuItem: { select: { id: true, name: true, prepTime: true } } } },
      },
    });
    emit({ type: "order.updated", orderId, status: "READY" });
    return Response.json(order);
  }

  if (action === "send") {
    if (!orderItemId || !orderId) {
      return Response.json({ error: "orderItemId and orderId are required for send" }, { status: 400 });
    }
    // Mark item sent and transition order to IN_PROGRESS atomically
    await prisma.$transaction([
      prisma.orderItem.update({
        where: { id: orderItemId },
        data: { sentAt: new Date() },
      }),
      prisma.order.update({
        where: { id: orderId },
        data: { status: "IN_PROGRESS" },
      }),
    ]);

    // Deplete inventory for this specific item at fire time
    try {
      const orderItem = await prisma.orderItem.findUnique({
        where: { id: orderItemId },
        select: { menuItemId: true, quantity: true, orderId: true },
      });
      if (orderItem) {
        const recipe = await prisma.recipeIngredient.findMany({
          where: { menuItemId: orderItem.menuItemId },
        });
        if (recipe.length > 0) {
          const deductions = recipe.map((r) => ({
            ingredientId: r.ingredientId,
            qty: Number(r.quantity) * orderItem.quantity,
          }));
          await prisma.$transaction([
            ...deductions.map(({ ingredientId, qty }) =>
              prisma.inventoryItem.updateMany({
                where: { ingredientId },
                data: { quantity: { decrement: qty } },
              })
            ),
            ...deductions.map(({ ingredientId, qty }) =>
              prisma.inventoryTransaction.create({
                data: {
                  ingredientId,
                  quantity: -qty,
                  type: "USED",
                  notes: `Fired — Order #${orderItem.orderId.slice(-6).toUpperCase()}`,
                  userId: session.user?.id ?? null,
                },
              })
            ),
          ]);
        }
      }
    } catch { /* non-fatal */ }

    emit({ type: "item.fired", orderId, orderItemId });
  }

  if (action === "complete" && orderItemId) {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { completedAt: new Date() },
    });
    if (orderId) {
      emit({ type: "item.completed", orderId, orderItemId });
    }
  }

  return Response.json({ ok: true });
}
