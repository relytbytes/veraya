import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";

// Which display this request is for. KITCHEN (food) is the default; BAR pulls
// only drink-station items. Station lives on the menu Category.
function stationOf(req: NextRequest): string {
  const s = (new URL(req.url).searchParams.get("station") ?? "KITCHEN").toUpperCase();
  return s === "BAR" ? "BAR" : "KITCHEN";
}

// Flip the order to READY once every fired (non-held), non-voided item across
// ALL stations is completed — so a shared check only "runs" when both the
// kitchen and the bar have finished their parts.
async function maybeMarkOrderReady(orderId: string): Promise<"READY" | null> {
  const remaining = await prisma.orderItem.count({
    where: { orderId, heldForFire: false, voided: false, completedAt: null },
  });
  if (remaining > 0) return null;
  await prisma.order.update({ where: { id: orderId }, data: { status: "READY" } });
  return "READY";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const station = stationOf(req);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      // On the board while this station still has fired work left to make.
      items: {
        some: {
          heldForFire: false,
          voided: false,
          completedAt: null,
          menuItem: { category: { station } },
        },
      },
      ...(since ? { updatedAt: { gt: new Date(since) } } : {}),
    },
    include: {
      table: true,
      server: { select: { id: true, name: true } },
      items: {
        // Only this station's fired items — drinks never appear on the kitchen
        // display and food never appears on the bar display.
        where: { heldForFire: false, menuItem: { category: { station } } },
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

// PATCH /api/kitchen — update an order item's status (sentAt / completedAt) or
// bump a station's portion of a ticket.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { orderId, orderItemId, action, station: rawStation } = body as {
    orderId?: string;
    orderItemId?: string;
    action: "send" | "complete" | "uncomplete" | "bump";
    station?: string;
  };
  const station = (rawStation ?? "KITCHEN").toUpperCase() === "BAR" ? "BAR" : "KITCHEN";

  // "bump" = this station has finished its items on the ticket.
  if (action === "bump" && orderId) {
    // updateMany can't filter on a relation, so resolve the station's
    // outstanding item ids first.
    const items = await prisma.orderItem.findMany({
      where: {
        orderId,
        heldForFire: false,
        voided: false,
        completedAt: null,
        menuItem: { category: { station } },
      },
      select: { id: true },
    });
    if (items.length > 0) {
      await prisma.orderItem.updateMany({
        where: { id: { in: items.map((i) => i.id) } },
        data: { completedAt: new Date() },
      });
    }
    const status = await maybeMarkOrderReady(orderId);
    emit({ type: "order.updated", orderId, status: status ?? "IN_PROGRESS" });
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        table: true,
        items: { include: { menuItem: { select: { id: true, name: true, prepTime: true } } } },
      },
    });
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

    // Inventory depletion happens at POS fire time (see lib/inventory.ts,
    // wired into /api/orders create + fire-held + add-items), so it is NOT
    // repeated here — this KDS "send" only acknowledges the ticket.
    emit({ type: "item.fired", orderId, orderItemId });
  }

  if (action === "complete" && orderItemId) {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { completedAt: new Date() },
    });
    if (orderId) {
      const status = await maybeMarkOrderReady(orderId);
      emit({ type: "item.completed", orderId, orderItemId });
      if (status) emit({ type: "order.updated", orderId, status });
    }
  }

  // Un-complete: clear the done stamp so a mis-tapped item goes back to working.
  if (action === "uncomplete" && orderItemId) {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { completedAt: null },
    });
    if (orderId) emit({ type: "item.completed", orderId, orderItemId });
  }

  return Response.json({ ok: true });
}
