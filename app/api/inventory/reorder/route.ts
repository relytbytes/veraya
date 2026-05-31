import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Batch-update storageArea + shelfOrder for many items at once (shelf setup saves)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: { id: string; storageArea: string | null; shelfOrder: number | null }[] = await req.json();

  await prisma.$transaction(
    updates.map((u) =>
      prisma.inventoryItem.update({
        where: { id: u.id },
        data: { storageArea: u.storageArea, shelfOrder: u.shelfOrder },
      })
    )
  );

  return Response.json({ ok: true });
}
