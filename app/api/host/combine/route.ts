import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

// POST /api/host/combine  { primaryTableId, tableIds: string[] }
//   Link the given tables to a primary so they seat as one party.
// DELETE /api/host/combine?primaryTableId=...
//   Split: unlink all tables from the primary.

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { primaryTableId, tableIds } = (await req.json()) as {
    primaryTableId?: string; tableIds?: string[];
  };
  if (!primaryTableId || !Array.isArray(tableIds) || tableIds.length === 0) {
    return Response.json({ error: "primaryTableId and tableIds are required" }, { status: 400 });
  }

  const ids = tableIds.filter((id) => id !== primaryTableId);
  const [primary, members] = await Promise.all([
    prisma.table.findUnique({ where: { id: primaryTableId } }),
    prisma.table.findMany({ where: { id: { in: ids } } }),
  ]);
  if (!primary) return Response.json({ error: "Primary table not found" }, { status: 404 });
  if (primary.primaryTableId) {
    return Response.json({ error: "Primary is already part of another combination" }, { status: 409 });
  }
  const occupied = members.find((m) => m.status === "OCCUPIED" || m.status === "DIRTY");
  if (occupied) {
    return Response.json({ error: `Table ${occupied.number} isn't free to combine` }, { status: 409 });
  }

  // primaryTableId alone marks a member; we leave status untouched so we don't
  // overload the floor status enum.
  await prisma.table.updateMany({
    where: { id: { in: ids } },
    data: { primaryTableId },
  });

  publish({ scope: "floor", type: "table.combined", ids: [primaryTableId, ...ids] });
  return Response.json({ ok: true, primaryTableId, linked: ids });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const primaryTableId = new URL(req.url).searchParams.get("primaryTableId");
  if (!primaryTableId) return Response.json({ error: "primaryTableId is required" }, { status: 400 });

  // Unlink every member of this primary.
  await prisma.table.updateMany({
    where: { primaryTableId },
    data: { primaryTableId: null },
  });

  publish({ scope: "floor", type: "table.split", ids: [primaryTableId] });
  return Response.json({ ok: true });
}
