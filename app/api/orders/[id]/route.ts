import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";
import { inferStageFromItems, advanceStage } from "@/lib/stage-inference";
import { depleteForFiredItems, restoreForVoidedItems } from "@/lib/inventory";
import { verifyManagerPin } from "@/lib/manager-auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      table: true,
      server: { select: { id: true, name: true } },
      reservation: { select: { id: true, name: true, date: true, time: true } },
      items: { include: { menuItem: { include: { category: true } } } },
      payments: true,
    },
  });
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as {
    status?: string;
    payment?: { amount: number; tip?: number; method: string; reference?: string };
    reason?: string;
    fireItemIds?: string[];
    voidItem?: { itemId: string; reason?: string; managerPin?: string };
    compItem?: { itemId: string; reason?: string; managerPin?: string };
    compCheck?: { reason?: string; managerPin?: string };
    reopen?: { reason?: string; managerPin?: string };
    holdFireMins?: number; // auto-fire newly held items after N minutes (0 = manual)
    addItems?: Array<{
      menuItemId: string;
      quantity: number;
      unitPrice: number;
      notes?: string;
      modifierIds?: string[];
      held?: boolean;
    }>;
  };
  const { status, payment, fireItemIds, voidItem, compItem, compCheck, addItems, reopen, holdFireMins } = body;

  // Helper: recalculate order subtotal/tax/total after item changes
  async function recalcTotals(orderId: string) {
    const allItems = await prisma.orderItem.findMany({ where: { orderId } });
    const taxSetting = await prisma.restaurantSettings.findUnique({ where: { key: "taxRate" } });
    const TAX_RATE = taxSetting ? Number(taxSetting.value) / 100 : 0.0875;
    const newSubtotal = allItems
      .filter((i) => !i.voided)
      .reduce((sum, i) => (i.comped ? sum : sum + Number(i.unitPrice) * i.quantity), 0);
    const newTax = newSubtotal * TAX_RATE;
    await prisma.order.update({
      where: { id: orderId },
      data: { subtotal: newSubtotal, tax: newTax, total: newSubtotal + newTax },
    });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { table: true, payments: true } });
  if (!order) return Response.json({ error: "Not found" }, { status: 404 });

  // Reopen a closed/paid check — reverses the close so it can be edited and
  // re-charged. Manager-protected + reasoned (it un-does money), audited as REOPEN.
  if (reopen) {
    const reason = reopen.reason?.trim();
    if (!reason) return Response.json({ error: "A reason is required." }, { status: 400 });
    const mgr = await verifyManagerPin(reopen.managerPin ?? "");
    if (!mgr) return Response.json({ error: "A valid manager PIN is required to reopen a check." }, { status: 403 });

    const refunded = order.payments.reduce((s, p) => s + Number(p.amount) + Number(p.tip), 0);
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { orderId: id } }),
      prisma.order.update({ where: { id }, data: { status: "IN_PROGRESS", closedAt: null } }),
      prisma.auditLog.create({
        data: {
          action: "REOPEN", orderId: id, amount: refunded, reason,
          notes: `Check reopened. Authorized by ${mgr.name}; by ${session.user?.name ?? "staff"}`,
          userId: mgr.id,
        },
      }),
    ]);
    if (order.tableId) {
      await prisma.table.update({ where: { id: order.tableId }, data: { status: "OCCUPIED" } }).catch(() => {});
    }
    emit({ type: "order.updated", orderId: id, status: "IN_PROGRESS" });
    const reopened = await prisma.order.findUnique({
      where: { id }, include: { table: true, items: { include: { menuItem: true } }, payments: true },
    });
    return Response.json(reopened);
  }

  /** Re-read all order items (with categories) and auto-advance the table's serviceStage. */
  async function autoAdvanceTableStage() {
    if (!order?.tableId) return;
    try {
      const allItems = await prisma.orderItem.findMany({
        where: { orderId: id },
        include: { menuItem: { include: { category: true } } },
      });
      const currentTable = await prisma.table.findUnique({
        where: { id: order.tableId },
        select: { serviceStage: true },
      });
      const inferred = inferStageFromItems(allItems as Parameters<typeof inferStageFromItems>[0]);
      const next = advanceStage(currentTable?.serviceStage ?? null, inferred);
      if (next) {
        await prisma.table.update({
          where: { id: order.tableId },
          data: { serviceStage: next, stageUpdatedAt: new Date() },
        });
      }
    } catch (e) {
      console.error("[autoAdvanceTableStage] non-fatal:", e);
    }
  }

  // Validate status transitions
  if (status && status !== order.status) {
    const ALLOWED: Record<string, string[]> = {
      OPEN:        ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
      IN_PROGRESS: ["READY", "COMPLETED", "CANCELLED"],
      READY:       ["COMPLETED", "IN_PROGRESS"],
      COMPLETED:   ["VOID"],
      CANCELLED:   ["VOID"],
    };
    const allowed = ALLOWED[order.status] ?? [];
    if (!allowed.includes(status)) {
      return Response.json(
        { error: `Cannot transition order from ${order.status} to ${status}` },
        { status: 422 }
      );
    }
  }

  // Handle payment — skip if order is already fully paid (prevents duplicate charge on retry)
  // Cap check uses base amounts only; tips are excluded (legitimately unbounded).
  const existingBaseSum = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const existingTipSum  = order.payments.reduce((sum, p) => sum + Number(p.tip), 0);
  const alreadyFullyPaid = existingBaseSum + existingTipSum >= Number(order.total);

  if (payment && !alreadyFullyPaid) {
    const newBase = Number(payment.amount);
    if (existingBaseSum + newBase > Number(order.total) * 1.5) {
      return Response.json(
        { error: "Payment exceeds the allowed cap (150% of order total)" },
        { status: 422 }
      );
    }

    await prisma.payment.create({
      data: {
        orderId: id,
        amount: payment.amount,
        tip: payment.tip ?? 0,
        method: payment.method as never,
        reference: payment.reference,
      },
    });
  }

  // Re-fetch payments after potential new payment to check if order is fully paid
  const allPayments = await prisma.payment.findMany({ where: { orderId: id } });
  const paidBaseSum = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  const fullyPaid = paidBaseSum >= Number(order.total);

  // Update order status — libsql doesn't support nested includes inside interactive
  // transactions, so we do the order update and table release as sequential steps.
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      ...(status && { status: status as never }),
      ...(status === "COMPLETED" && fullyPaid && { closedAt: new Date() }),
      ...(status === "VOID" && { closedAt: new Date() }),
    },
    include: {
      table: true,
      items: { include: { menuItem: { include: { category: true } } } },
      payments: true,
    },
  });

  if ((status === "COMPLETED" || status === "VOID") && order.tableId) {
    await prisma.table
      .update({ where: { id: order.tableId }, data: { status: "DIRTY" as never } })
      .catch((e) => console.error("[PATCH orders/[id]] table release failed (non-fatal):", e));
  }

  // Fire held items — POS fires specific items to the kitchen
  if (fireItemIds && fireItemIds.length > 0) {
    // Flip held items to fresh, UNSENT kitchen tickets. Don't pre-set sentAt —
    // that made fired items render as already-acknowledged on the KDS instead
    // of appearing as new work to cook.
    await prisma.orderItem.updateMany({
      where: { id: { in: fireItemIds }, orderId: id },
      data: { heldForFire: false, firedAt: new Date(), fireAt: null, courseNo: null }, // stamps a new fire round on the KDS
    });
    // Deplete ingredient inventory for the items just fired.
    const justFired = await prisma.orderItem.findMany({
      where: { id: { in: fireItemIds }, orderId: id },
      select: { menuItemId: true, quantity: true },
    });
    await depleteForFiredItems(justFired, { orderId: id, userId: session.user?.id ?? null });
    // If the check was already bumped to READY, late-fired items would be
    // filtered off the KDS (only OPEN/IN_PROGRESS show) — reopen it so they appear.
    const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    if (current?.status === "READY") {
      await prisma.order.update({ where: { id }, data: { status: "IN_PROGRESS" } });
      emit({ type: "order.updated", orderId: id, status: "IN_PROGRESS" });
    }
    for (const orderItemId of fireItemIds) {
      emit({ type: "item.fired", orderId: id, orderItemId });
    }
    // Auto-advance table service stage based on what was just fired
    await autoAdvanceTableStage();
  }

  // Comps and voids are manager-protected and require a reason. Verify once,
  // up front, for whichever sensitive action this request carries.
  const sensitive = voidItem ?? compItem ?? compCheck;
  let authorizingManager: { id: string; name: string } | null = null;
  if (sensitive) {
    const reason = sensitive.reason?.trim();
    if (!reason) {
      return Response.json({ error: "A reason is required." }, { status: 400 });
    }
    authorizingManager = await verifyManagerPin(sensitive.managerPin ?? "");
    if (!authorizingManager) {
      return Response.json({ error: "A valid manager PIN is required to authorize this." }, { status: 403 });
    }
  }

  // Void a specific item (e.g. double ring)
  if (voidItem) {
    const oi = await prisma.orderItem.update({
      where: { id: voidItem.itemId, orderId: id },
      data: { voided: true, voidReason: voidItem.reason?.trim() ?? null },
    });
    // Restore countRemaining for tracked items
    try {
      await prisma.menuItem.updateMany({
        where: { id: oi.menuItemId, trackCount: true },
        data: { countRemaining: { increment: oi.quantity } },
      });
    } catch { /* non-fatal */ }
    // If the item had already been fired, its recipe ingredients were depleted —
    // a void means it shouldn't have been made, so return them to stock. (Comps
    // are NOT restored: that food was made and given away, so it stays in COGS.)
    if (oi.firedAt) {
      await restoreForVoidedItems([{ menuItemId: oi.menuItemId, quantity: oi.quantity }], { orderId: id, userId: session.user?.id ?? null });
    }
    await recalcTotals(id);
    try {
      await prisma.auditLog.create({
        data: {
          action: "VOID",
          orderId: id,
          amount: Number(oi.unitPrice) * oi.quantity,
          reason: voidItem.reason!.trim(),
          notes: `Authorized by ${authorizingManager!.name}; rung by ${session.user?.name ?? "staff"}`,
          userId: authorizingManager!.id,
        },
      });
    } catch { /* non-fatal */ }
    const voidedOrder = await prisma.order.findUnique({
      where: { id },
      include: { table: true, items: { include: { menuItem: true } }, payments: true },
    });
    return Response.json(voidedOrder);
  }

  // Comp a specific item (goodwill — item made, not charged)
  if (compItem) {
    const ci = await prisma.orderItem.update({
      where: { id: compItem.itemId, orderId: id },
      data: { comped: true },
    });
    await recalcTotals(id);
    try {
      await prisma.auditLog.create({
        data: {
          action: "COMP",
          orderId: id,
          amount: Number(ci.unitPrice) * ci.quantity,
          reason: compItem.reason!.trim(),
          notes: `Authorized by ${authorizingManager!.name}; rung by ${session.user?.name ?? "staff"}`,
          userId: authorizingManager!.id,
        },
      });
    } catch { /* non-fatal */ }
    const compedItemOrder = await prisma.order.findUnique({
      where: { id },
      include: { table: true, items: { include: { menuItem: true } }, payments: true },
    });
    return Response.json(compedItemOrder);
  }

  // Comp entire check — zero out total, close order at $0, release table
  if (compCheck !== undefined) {
    await prisma.orderItem.updateMany({
      where: { orderId: id, voided: false },
      data: { comped: true },
    });
    await prisma.order.update({
      where: { id },
      data: { subtotal: 0, tax: 0, total: 0, status: "COMPLETED" as never, closedAt: new Date() },
    });
    await prisma.payment.create({
      data: {
        orderId: id,
        amount: 0,
        tip: 0,
        method: "CASH" as never,
        reference: `COMP: ${compCheck.reason!.trim()}`,
      },
    });
    if (order.tableId) {
      await prisma.table.update({ where: { id: order.tableId }, data: { status: "DIRTY" as never } }).catch(() => {});
    }
    emit({ type: "order.updated", orderId: id, status: "COMPLETED" });
    try {
      await prisma.auditLog.create({
        data: {
          action: "COMP",
          orderId: id,
          amount: Number(order.total),
          reason: compCheck.reason!.trim(),
          notes: `Entire check comped. Authorized by ${authorizingManager!.name}; rung by ${session.user?.name ?? "staff"}`,
          userId: authorizingManager!.id,
        },
      });
    } catch { /* non-fatal */ }
    const compedOrder = await prisma.order.findUnique({
      where: { id },
      include: { table: true, items: { include: { menuItem: true } }, payments: true },
    });
    return Response.json(compedOrder);
  }

  // Add items to an existing open order (e.g. recall → add more items)
  if (addItems && addItems.length > 0) {
    // One timestamp for the batch → these added items read as one fire round.
    const firedNow = new Date();
    // A new hold batch becomes the next course; stamp the auto-fire time if a
    // timer was chosen so the held course paces itself.
    const holdFireAt = holdFireMins && holdFireMins > 0 ? new Date(Date.now() + holdFireMins * 60000) : null;
    const maxCourse = await prisma.orderItem.aggregate({
      where: { orderId: id, heldForFire: true }, _max: { courseNo: true },
    });
    const nextCourse = (maxCourse._max.courseNo ?? 0) + 1;
    for (const item of addItems) {
      const newItem = await prisma.orderItem.create({
        data: {
          orderId: id,
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes ?? null,
          heldForFire: item.held ?? false,
          firedAt: item.held ? null : firedNow,
          ...(item.held ? { courseNo: nextCourse, fireAt: holdFireAt } : {}),
        },
      });
      // Attach modifiers if any
      if (item.modifierIds && item.modifierIds.length > 0) {
        await prisma.orderItemModifier.createMany({
          data: item.modifierIds.map((optionId) => ({
            orderItemId: newItem.id,
            modifierOptionId: optionId,
          })),
        });
      }
      // Emit to kitchen unless item is held
      if (!item.held) {
        emit({ type: "item.fired", orderId: id, orderItemId: newItem.id });
      }
      // Decrement countRemaining for tracked items
      try {
        await prisma.menuItem.updateMany({
          where: { id: item.menuItemId, trackCount: true, countRemaining: { gt: 0 } },
          data: { countRemaining: { decrement: item.quantity } },
        });
      } catch { /* non-fatal */ }
    }
    await recalcTotals(id);
    // Deplete ingredient inventory for the non-held items just fired.
    await depleteForFiredItems(
      addItems.filter((i) => !(i.held ?? false)).map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
      { orderId: id, userId: session.user?.id ?? null },
    );
    // Auto-advance table service stage for any non-held items just added
    if (addItems.some(i => !(i.held ?? false))) {
      await autoAdvanceTableStage();
    }
    const addedOrder = await prisma.order.findUnique({
      where: { id },
      include: { table: true, items: { include: { menuItem: { include: { category: true } } } }, payments: true },
    });
    return Response.json(addedOrder);
  }

  emit({ type: "order.updated", orderId: id, status: updatedOrder.status });

  // Write audit log for destructive actions
  if (status === "VOID" || status === "CANCELLED") {
    try {
      const reason = body.reason ?? `${status} by staff`;
      await prisma.auditLog.create({
        data: {
          action: "VOID",
          orderId: id,
          reason,
          userId: session.user?.id ?? "unknown",
        },
      });
    } catch { /* non-fatal */ }
  }

  return Response.json(updatedOrder);
}
