import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const card = await prisma.giftCard.findUnique({
    where: { code },
    include: {
      customer: { select: { id: true, name: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!card) return Response.json({ error: "Gift card not found" }, { status: 404 });
  return Response.json(card);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await params;
  const body = await req.json() as {
    action?: "LOAD" | "REDEEM";
    amount?: number;
    orderId?: string;
  };

  if (!body.action || !["LOAD", "REDEEM"].includes(body.action)) {
    return Response.json({ error: "action must be LOAD or REDEEM" }, { status: 400 });
  }
  if (!body.amount || body.amount <= 0) {
    return Response.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const card = await prisma.giftCard.findUnique({ where: { code } });
  if (!card) return Response.json({ error: "Gift card not found" }, { status: 404 });
  if (!card.isActive) return Response.json({ error: "Gift card is inactive" }, { status: 400 });

  const currentBalance = Number(card.balance);

  if (body.action === "REDEEM") {
    if (body.amount > currentBalance) {
      return Response.json(
        { error: `Insufficient balance. Available: $${currentBalance.toFixed(2)}` },
        { status: 400 }
      );
    }
  }

  const newBalance =
    body.action === "LOAD"
      ? currentBalance + body.amount
      : currentBalance - body.amount;

  const [updatedCard] = await prisma.$transaction([
    prisma.giftCard.update({
      where: { code },
      data: { balance: newBalance },
      include: {
        customer: { select: { id: true, name: true } },
        transactions: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
    prisma.giftCardTransaction.create({
      data: {
        giftCardId: card.id,
        amount: body.amount,
        type: body.action,
        orderId: body.orderId || null,
      },
    }),
  ]);

  return Response.json(updatedCard);
}
