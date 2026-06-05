import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TransactionType } from "@/app/generated/prisma/enums";
import { publish } from "@/lib/realtime";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const items = await prisma.inventoryItem.findMany({
    include: {
      ingredient: { include: { supplier: true } },
    },
    orderBy: { ingredient: { name: "asc" } },
  });
  return Response.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { ingredientId, quantity, type, notes } = body as {
    ingredientId: string;
    quantity: number;
    type: TransactionType;
    notes?: string;
  };

  if (!ingredientId || quantity === undefined || !type) {
    return Response.json({ error: "ingredientId, quantity, and type are required" }, { status: 400 });
  }

  // ADJUSTED uses the raw signed value (negative = shrinkage, positive = correction)
  // RECEIVED/RETURNED always add. WASTED/USED always deduct.
  const delta = type === "ADJUSTED"
    ? quantity  // can be negative
    : type === "RECEIVED" || type === "RETURNED"
      ? Math.abs(quantity)
      : -Math.abs(quantity);

  const [transaction, updatedItem] = await prisma.$transaction([
    prisma.inventoryTransaction.create({
      data: {
        ingredientId,
        // Store the actual signed delta applied to inventory so the audit
        // log accurately reflects what happened (+/- wise)
        quantity: delta,
        type,
        notes,
        userId: session.user?.id,
      },
    }),
    prisma.inventoryItem.update({
      where: { ingredientId },
      data: { quantity: { increment: delta } },
    }),
  ]);

  // Push to every client (cross-instance via Redis) so inventory lists, the
  // dashboard, and Vera's Cost & Inventory read refresh instantly instead of
  // waiting for a poll.
  publish({ scope: "data", type: "inventory.changed", ids: [ingredientId] });

  return Response.json({ transaction, updatedItem }, { status: 201 });
}
