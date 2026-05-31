import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const cards = await prisma.giftCard.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      customer: { select: { id: true, name: true } },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  return Response.json(cards);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    initialBalance?: number;
    recipientName?: string;
    recipientEmail?: string;
    message?: string;
    customerId?: string;
  };

  if (body.initialBalance == null || body.initialBalance <= 0) {
    return Response.json({ error: "initialBalance must be a positive number" }, { status: 400 });
  }

  // Generate a unique 16-char code, retry on collision
  let code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const existing = await prisma.giftCard.findUnique({ where: { code } });
    if (!existing) break;
    code = generateCode();
    attempts++;
  }

  const card = await prisma.giftCard.create({
    data: {
      code,
      initialBalance: body.initialBalance,
      balance: body.initialBalance,
      isActive: true,
      recipientName: body.recipientName?.trim() || null,
      recipientEmail: body.recipientEmail?.trim() || null,
      message: body.message?.trim() || null,
      customerId: body.customerId || null,
    },
    include: {
      customer: { select: { id: true, name: true } },
      transactions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  return Response.json(card, { status: 201 });
}
