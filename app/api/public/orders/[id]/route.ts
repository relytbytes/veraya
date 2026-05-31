import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      type: true,
      guestName: true,
      subtotal: true,
      tax: true,
      total: true,
      createdAt: true,
      notes: true,
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          notes: true,
          sentAt: true,
          completedAt: true,
          menuItem: { select: { name: true } },
        },
      },
    },
  });

  if (!order) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(order);
}
