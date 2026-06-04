import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/ingredients/[id]/adjust-cost  { newCost, reason }
// Manager/admin manual cost correction (#3). Writes the new unit cost AND a
// ledger entry (InventoryTransaction type ADJUSTED) with a required reason, so
// material corrections to inventory valuation have a clean audit trail.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user?.role as string | undefined;
  if (!role || !["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Only managers can adjust cost" }, { status: 403 });
  }

  const { id } = await params;
  const { newCost, reason } = (await req.json()) as { newCost?: number; reason?: string };
  const cost = Number(newCost);
  if (!Number.isFinite(cost) || cost < 0) {
    return Response.json({ error: "A valid new cost is required" }, { status: 400 });
  }
  if (!reason?.trim()) {
    return Response.json({ error: "A reason is required for the audit trail" }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.findUnique({ where: { id }, select: { id: true, name: true, costPerUnit: true } });
  if (!ingredient) return Response.json({ error: "Ingredient not found" }, { status: 404 });

  const oldCost = Number(ingredient.costPerUnit);
  const rounded = Math.round(cost * 10000) / 10000;

  await prisma.$transaction([
    prisma.ingredient.update({ where: { id }, data: { costPerUnit: rounded } }),
    prisma.inventoryTransaction.create({
      data: {
        ingredientId: id,
        quantity: 0, // a cost correction, not a quantity movement
        type: "ADJUSTED",
        notes: `Cost adjusted $${oldCost.toFixed(2)} → $${rounded.toFixed(2)} — ${reason.trim()}`,
        userId: (session.user?.id as string | undefined) ?? null,
      },
    }),
  ]);

  return Response.json({ ok: true, id, oldCost, newCost: rounded });
}
