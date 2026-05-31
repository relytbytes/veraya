import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";
import { inferStageFromItems, advanceStage } from "@/lib/stage-inference";

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
    const { tableId, type, notes, items } = body as {
      tableId?: string;
      type?: string;
      notes?: string;
      items: { menuItemId: string; quantity: number; unitPrice: number; notes?: string; modifierIds?: string[]; held?: boolean }[];
    };

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

    // Create order first — this is the critical operation.
    const order = await prisma.order.create({
      data: {
        tableId: tableId || null,
        userId: session.user?.id,
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
    if (tableId) {
      try {
        const currentTable = await prisma.table.findUnique({ where: { id: tableId }, select: { serviceStage: true } });
        // Infer stage from the items we just created
        const inferred = inferStageFromItems(order.items as Parameters<typeof inferStageFromItems>[0]);
        const nextStage = advanceStage(currentTable?.serviceStage ?? null, inferred) ?? (isDineIn ? "SEATED" : null);
        await prisma.table.update({
          where: { id: tableId },
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
