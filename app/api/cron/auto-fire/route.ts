import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { emit } from "@/lib/events";
import { depleteForFiredItems } from "@/lib/inventory";

// Auto-fire held courses whose timer has elapsed.
// Accepts two callers:
//   1. Vercel Cron — must supply Authorization: Bearer <CRON_SECRET>
//   2. Authenticated POS client (session cookie) — fires only their own table's held items
export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return run();
}

function verifyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
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
