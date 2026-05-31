import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: { id: string; floorX: number | null; floorY: number | null; rotation: number; shape: string }[] = await req.json();

  await prisma.$transaction(
    updates.map((u) =>
      prisma.table.update({
        where: { id: u.id },
        data: { floorX: u.floorX, floorY: u.floorY, rotation: u.rotation, shape: u.shape },
      })
    )
  );

  return Response.json({ ok: true });
}
