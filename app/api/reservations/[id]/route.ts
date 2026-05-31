import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Prisma } from "@/app/generated/prisma/client";
import { tableHasConflict } from "@/lib/reservations";
import { publish } from "@/lib/realtime";
import { applyAutoTags } from "@/lib/customer-tags";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, tableId, notes, time, partySize, name, phone, email, customerId } = body as {
    status?: string;
    tableId?: string;
    notes?: string;
    time?: string;
    partySize?: number;
    name?: string;
    phone?: string | null;
    email?: string | null;
    customerId?: string | null;
  };

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) return Response.json({ error: "Not found" }, { status: 404 });

  // Cancelling/no-showing frees the table slot so it can be rebooked.
  const freeingSlot = status === "CANCELLED" || status === "NO_SHOW";

  // The (table, date, time) this reservation will hold after the patch.
  const effectiveTableId = freeingSlot ? null : (tableId !== undefined ? tableId : reservation.tableId);
  const effectiveTime = time !== undefined ? time : reservation.time;

  // Overlap conflict check when assigning/moving to a real table at an active status.
  if (!freeingSlot && effectiveTableId && (tableId !== undefined || time !== undefined)) {
    const conflict = await tableHasConflict({
      tableId: effectiveTableId,
      date: reservation.date,
      time: effectiveTime,
      ignoreReservationId: id,
    });
    if (conflict) {
      return Response.json(
        { error: "That table is already booked for an overlapping time." },
        { status: 409 },
      );
    }
  }

  let updated;
  try {
    updated = await prisma.reservation.update({
      where: { id },
      data: {
        ...(status !== undefined && { status: status as never }),
        ...(freeingSlot ? { tableId: null } : tableId !== undefined && { tableId }),
        ...(notes !== undefined && { notes }),
        ...(time !== undefined && { time }),
        ...(partySize !== undefined && { partySize }),
        ...(name !== undefined && { name }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(customerId !== undefined && { customerId }),
      },
      include: { table: true, customer: { select: { id: true, name: true, phone: true, visitCount: true, loyaltyPoints: true } } },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return Response.json(
        { error: "That table is already booked for that time slot." },
        { status: 409 },
      );
    }
    throw err;
  }

  // Physical table to release uses the reservation's table *before* the update
  // (we may have just nulled tableId to free the slot).
  const priorTableId = reservation.tableId;

  // When seating a guest, occupy the table AND stamp the seat fields the host
  // stand reads for the dining timer + floor display.
  if (status === "SEATED" && updated.tableId) {
    await prisma.table.update({
      where: { id: updated.tableId },
      data: {
        status: "OCCUPIED",
        seatedAt: new Date(),
        guestName: updated.name,
        partySize: updated.partySize,
        serviceStage: "SEATED",
        stageUpdatedAt: new Date(),
      },
    });
  }

  // When cancelling or marking no-show after seating, release the physical table.
  // (updated.tableId may now be null since cancelling frees the slot, so use the prior table.)
  if (freeingSlot && reservation.status === "SEATED" && priorTableId) {
    await prisma.table.update({
      where: { id: priorTableId },
      data: { status: "DIRTY" },
    });
  }

  // Bump visit count when seated, then refresh auto loyalty tags.
  if (status === "SEATED" && updated.customerId) {
    await prisma.customer.update({
      where: { id: updated.customerId },
      data: { visitCount: { increment: 1 }, lastVisitAt: new Date() },
    });
    await applyAutoTags(updated.customerId);
  }

  publish({ scope: "floor", type: "reservation.updated", ids: [id] });
  return Response.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.reservation.delete({ where: { id } });
  publish({ scope: "floor", type: "reservation.deleted", ids: [id] });
  return new Response(null, { status: 204 });
}
