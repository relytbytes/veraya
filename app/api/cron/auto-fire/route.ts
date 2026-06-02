import { prisma } from "@/lib/prisma";
import { emit } from "@/lib/events";
import { depleteForFiredItems } from "@/lib/inventory";

// Auto-fire held courses whose timer has elapsed. Runs as a cron (server-side
// safety net) and is also pokeable by the POS client interval during service.
// Fires every held item with a fireAt in the past: clears the hold, stamps
// firedAt (so it appears on the KDS as a new round), and depletes inventory.
export async function POST() {
  return run();
}
export async function GET() {
  return run();
}

async function run() {
  const now = new Date();
  const due = await prisma.orderItem.findMany({
    where: {
      heldForFire: true,
      fireAt: { not: null, lte: now },
      voided: false,
      order: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    },
    select: { id: true, orderId: true, menuItemId: true, quantity: true },
  });
  if (due.length === 0) return Response.json({ fired: 0 });

  await prisma.orderItem.updateMany({
    where: { id: { in: due.map((d) => d.id) } },
    data: { heldForFire: false, firedAt: now, fireAt: null, courseNo: null },
  });

  // Group by order: reopen READY orders, deplete inventory, emit to the KDS.
  const byOrder = new Map<string, typeof due>();
  for (const d of due) {
    const arr = byOrder.get(d.orderId) ?? [];
    arr.push(d);
    byOrder.set(d.orderId, arr);
  }
  for (const [orderId, items] of byOrder) {
    await depleteForFiredItems(items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })), { orderId });
    for (const i of items) emit({ type: "item.fired", orderId, orderItemId: i.id });
  }

  return Response.json({ fired: due.length });
}
