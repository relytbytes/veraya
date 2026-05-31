import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const customerId = new URL(req.url).searchParams.get("customerId");
  if (!customerId) {
    return Response.json({ error: "customerId is required" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, loyaltyPoints: true },
  });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({
    customerId: customer.id,
    points: customer.loyaltyPoints,
    transactions,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    customerId?: string;
    type?: "EARNED" | "REDEEMED" | "ADJUSTED";
    points?: number;
    reason?: string;
    orderId?: string;
  };

  if (!body.customerId) return Response.json({ error: "customerId is required" }, { status: 400 });
  if (!body.type || !["EARNED", "REDEEMED", "ADJUSTED"].includes(body.type)) {
    return Response.json({ error: "type must be EARNED, REDEEMED, or ADJUSTED" }, { status: 400 });
  }
  if (body.points == null || body.points === 0) {
    return Response.json({ error: "points must be a non-zero number" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
  if (!customer) return Response.json({ error: "Customer not found" }, { status: 404 });

  // For REDEEMED, points should be positive in the request; we store as negative delta
  const pointsDelta =
    body.type === "REDEEMED" ? -Math.abs(body.points) : Math.abs(body.points);

  const newPoints = customer.loyaltyPoints + pointsDelta;
  if (newPoints < 0) {
    return Response.json(
      { error: `Insufficient points. Available: ${customer.loyaltyPoints}` },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.customer.update({
      where: { id: body.customerId },
      data: { loyaltyPoints: newPoints },
    }),
    prisma.loyaltyTransaction.create({
      data: {
        customerId: body.customerId,
        points: pointsDelta,
        type: body.type,
        reason: body.reason?.trim() || null,
        orderId: body.orderId || null,
      },
    }),
  ]);

  const transactions = await prisma.loyaltyTransaction.findMany({
    where: { customerId: body.customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({
    customerId: body.customerId,
    points: newPoints,
    transactions,
  });
}
