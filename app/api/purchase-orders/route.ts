import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const orders = await prisma.purchaseOrder.findMany({
    where: status ? { status: status as never } : {},
    include: {
      vendor: true,
      supplier: { select: { id: true, name: true } },
      items: { include: { ingredient: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supplierId, notes, invoiceNumber, invoiceImageUrl, items } = body as {
    supplierId: string;
    notes?: string;
    invoiceNumber: string;
    invoiceImageUrl?: string;
    items: { ingredientId: string; quantity: number; unitCost: number }[];
  };

  if (!supplierId) return Response.json({ error: "Supplier required" }, { status: 400 });
  if (!items?.length) return Response.json({ error: "At least one item required" }, { status: 400 });
  // Invoice number is optional: packing slips and distributor order guides often
  // have none, and it can be filled in later via the inline edit on the PO list.

  // Round to 2 decimal places to avoid floating-point accumulation errors
  const totalAmount = Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0) * 100) / 100;

  let po;
  try {
    po = await prisma.purchaseOrder.create({
      data: {
        supplierId,
        userId: session.user?.id ?? null,
        notes,
        invoiceNumber: invoiceNumber?.trim() || null,
        invoiceImageUrl: invoiceImageUrl || null,
        totalAmount,
        status: "DRAFT",
        items: {
          create: items.map((i) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
            unitCost: i.unitCost,
          })),
        },
      },
      include: {
        vendor: true,
        items: { include: { ingredient: true } },
      },
    });
  } catch (e: unknown) {
    console.error("[POST /api/purchase-orders]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 500 });
  }

  return Response.json(po, { status: 201 });
}
