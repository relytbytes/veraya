import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

interface SuggestionItem {
  ingredientId: string;
  qty: number;
  supplierId: string;
  unitCost: number;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const items: SuggestionItem[] = await req.json();

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "items array required" }, { status: 400 });
  }

  // Group items by supplierId
  const grouped = new Map<string, SuggestionItem[]>();
  for (const item of items) {
    if (!item.supplierId) continue;
    const group = grouped.get(item.supplierId) ?? [];
    group.push(item);
    grouped.set(item.supplierId, group);
  }

  const userId = session.user?.id ?? null;
  const createdOrders = [];

  for (const [supplierId, supplierItems] of grouped) {
    const totalAmount = supplierItems.reduce((sum, i) => sum + i.qty * i.unitCost, 0);

    try {
      const po = await prisma.purchaseOrder.create({
        data: {
          supplierId,
          userId,
          status: "DRAFT",
          totalAmount: Math.round(totalAmount * 100) / 100,
          invoiceNumber: `AUTO-${Date.now()}`,
          notes: "Auto-generated from Smart Reorder",
          items: {
            create: supplierItems.map((i) => ({
              ingredientId: i.ingredientId,
              quantity: i.qty,
              unitCost: i.unitCost,
            })),
          },
        },
        include: {
          vendor: true,
          items: { include: { ingredient: true } },
        },
      });
      createdOrders.push(po);
    } catch (e: unknown) {
      console.error("[POST /api/purchase-orders/from-suggestions]", e);
    }
  }

  return Response.json(createdOrders, { status: 201 });
}
