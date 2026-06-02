import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";
import { inferStageFromItems, advanceStage } from "@/lib/stage-inference";
import { depleteForFiredItems } from "@/lib/inventory";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const date = searchParams.get("date");
  const tableId = searchParams.get("tableId");

  // When filtering by tableId we skip the date window — we need all active orders
  // for that table regardless of when they were created (handles cross-midnight shifts).
  const applyDateFilter = !tableId;
  const whereDate = date ? new Date(date) : new Date();
  whereDate.setHours(0, 0, 0, 0);
  const endDate = new Date(whereDate);
  endDate.setHours(23, 59, 59, 999);

  // status param supports a single value OR comma-separated list (e.g. "OPEN,IN_PROGRESS,READY")
  const statuses = status ? status.split(",").map((s) => s.trim()) : null;

  const orders = await prisma.order.findMany({
    where: {
      ...(statuses && statuses.length === 1
        ? { status: statuses[0] as never }
        : statuses && statuses.length > 1
        ? { status: { in: statuses as never[] } }
        : {}),
      ...(tableId ? { tableId } : {}),
      ...(applyDateFilter ? { createdAt: { gte: whereDate, lte: endDate } } : {}),
    },
    include: {
      table: true,
      server: { select: { id: true, name: true } },
      items: { include: { menuItem: { include: { category: true } } } },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { tableId, type, notes, items, holdFireMins } = body as {
      tableId?: string;
      type?: string;
      notes?: string;
      holdFireMins?: number; // auto-fire held items after N minutes (0/undefined = manual)
      items: { menuItemId: string; quantity: number; unitPrice: number; notes?: string; modifierIds?: string[]; held?: boolean }[];
    };
    // Held items become a course; if a timer was chosen, stamp their auto-fire time.
    const holdFireAt = holdFireMins && holdFireMins > 0 ? new Date(Date.now() + holdFireMins * 60000) : null;

    if (!items?.length) {
      return Response.json({ error: "At least one item is required" }, { status: 400 });
    }

    // Fetch tax rate from settings, fall back to 8.75%
    const taxSetting = await prisma.restaurantSettings.findUnique({ where: { key: "taxRate" } });
    const TAX_RATE = taxSetting ? Number(taxSetting.value) / 100 : 0.0875;

    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    const isDineIn = !type || type === "DINE_IN";

    // Guard foreign keys before the create. A stale JWT session (e.g. after the
    // DB was reseeded) can carry a userId that no longer exists, and a cleared
    // table can leave a dangling tableId — either would throw an opaque FK error.
    let validUserId: string | null = null;
    if (session.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
      validUserId = u?.id ?? null;
    }
    let validTableId: string | null = null;
    let tableCustomerId: string | null = null;
    if (tableId) {
      const tbl = await prisma.table.findUnique({ where: { id: tableId }, select: { id: true, customerId: true } });
      if (!tbl) return Response.json({ error: "That table no longer exists. Refresh and try again." }, { status: 400 });
      validTableId = tbl.id;
      tableCustomerId = tbl.customerId; // link the dine-in order to the seated guest
    }

    // One timestamp for the whole batch so everything fired together reads as a
    // single KDS fire round. Held items aren't fired yet, so firedAt stays null.
    const firedNow = new Date();

    // Create order first — this is the critical operation.
    const order = await prisma.order.create({
      data: {
        tableId: validTableId,
        userId: validUserId,
        customerId: tableCustomerId,
        type: (type as never) ?? "DINE_IN",
        notes,
        subtotal,
        tax,
        total,
        items: {
          create: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            notes: i.notes,
            heldForFire: i.held ?? false,
            firedAt: i.held ? null : firedNow,
            ...(i.held ? { courseNo: 1, fireAt: holdFireAt } : {}),
            modifiers: {
              create: i.modifierIds?.map((id) => ({ modifierOptionId: id })) ?? [],
            },
          })),
        },
      },
      include: {
        table: true,
        items: { include: { menuItem: { include: { category: true } } } },
        payments: true,
      },
    });

    // Deplete ingredient inventory for everything fired now (held items deplete
    // later, when they're actually fired).
    await depleteForFiredItems(
      order.items.filter((i) => i.firedAt).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
      { orderId: order.id, userId: validUserId },
    );

    // Decrement countRemaining for tracked items — best-effort, non-blocking.
    for (const i of items) {
      try {
        await prisma.menuItem.updateMany({
          where: { id: i.menuItemId, trackCount: true, countRemaining: { gt: 0 } },
          data: { countRemaining: { decrement: i.quantity } },
        });
      } catch { /* non-fatal */ }
    }

    // Update table status and auto-advance service stage — best-effort.
    if (validTableId) {
      try {
        const currentTable = await prisma.table.findUnique({ where: { id: validTableId }, select: { serviceStage: true } });
        // Infer stage from the items we just created
        const inferred = inferStageFromItems(order.items as Parameters<typeof inferStageFromItems>[0]);
        const nextStage = advanceStage(currentTable?.serviceStage ?? null, inferred) ?? (isDineIn ? "SEATED" : null);
        await prisma.table.update({
          where: { id: validTableId },
          data: {
            status: "OCCUPIED",
            ...(isDineIn && nextStage ? { serviceStage: nextStage, stageUpdatedAt: new Date() } : {}),
          },
        });
      } catch (tableErr) {
        console.error("[POST /api/orders] table status update failed (non-fatal):", tableErr);
      }
    }

    emit({ type: "order.created", orderId: order.id });
    return Response.json(order, { status: 201 });
  } catch (err) {
    console.error("[POST /api/orders]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
