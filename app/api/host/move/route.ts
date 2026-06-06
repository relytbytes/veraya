import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

// POST /api/host/move
// Atomically move a seated party from one table to another:
//  - copy seat fields (seatedAt/guestName/partySize/serviceStage) to the target
//  - release the source table
//  - follow the party with their seated reservation and any open check
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { fromTableId, toTableId } = (await req.json()) as {
    fromTableId?: string;
    toTableId?: string;
  };

  if (!fromTableId || !toTableId) {
    return Response.json({ error: "fromTableId and toTableId are required" }, { status: 400 });
  }
  if (fromTableId === toTableId) {
    return Response.json({ error: "Source and target tables are the same" }, { status: 400 });
  }

  const [from, to] = await Promise.all([
    prisma.table.findUnique({ where: { id: fromTableId } }),
    prisma.table.findUnique({ where: { id: toTableId } }),
  ]);

  if (!from || !to) return Response.json({ error: "Table not found" }, { status: 404 });
  if (from.status !== "OCCUPIED") {
    return Response.json({ error: "Source table is not occupied" }, { status: 409 });
  }
  if (to.status === "OCCUPIED") {
    return Response.json({ error: "Target table is already occupied" }, { status: 409 });
  }
  // A combined-table member is physically part of another table group — seating a
  // party onto it would split the combo. Block it.
  if (to.primaryTableId) {
    return Response.json({ error: "That table is linked into a combined group — pick a standalone table." }, { status: 409 });
  }
  if (to.status === "DIRTY") {
    return Response.json({ error: "Target table needs bussing first." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    // Occupy the target with the source's party
    await tx.table.update({
      where: { id: toTableId },
      data: {
        status: "OCCUPIED",
        seatedAt: from.seatedAt,
        guestName: from.guestName,
        partySize: from.partySize,
        serviceStage: from.serviceStage,
        stageUpdatedAt: from.stageUpdatedAt,
        serverId: from.serverId,
        customerId: from.customerId,
      },
    });

    // Release the source
    await tx.table.update({
      where: { id: fromTableId },
      data: {
        status: "AVAILABLE",
        seatedAt: null,
        guestName: null,
        partySize: null,
        serviceStage: null,
        stageUpdatedAt: null,
        serverId: null,
        customerId: null,
      },
    });

    // Follow the party with their seated reservation, if any
    await tx.reservation.updateMany({
      where: { tableId: fromTableId, status: "SEATED" },
      data: { tableId: toTableId },
    });

    // Follow the party with any open check so the order stays with them
    await tx.order.updateMany({
      where: { tableId: fromTableId, status: { in: ["OPEN", "IN_PROGRESS", "READY"] } },
      data: { tableId: toTableId },
    });
  });

  const [updatedFrom, updatedTo] = await Promise.all([
    prisma.table.findUnique({ where: { id: fromTableId } }),
    prisma.table.findUnique({ where: { id: toTableId } }),
  ]);

  publish({ scope: "floor", type: "table.moved", ids: [fromTableId, toTableId] });
  return Response.json({ from: updatedFrom, to: updatedTo });
}
