import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// PATCH /api/timeclock/[id] — manager/admin edit of a punch (clockIn/clockOut).
// A non-empty reason is mandatory; every edit is recorded in ClockEntryEdit
// with the before/after times and who made the change (labor/payroll audit).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Only a manager can edit punches." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json()) as { clockIn?: string; clockOut?: string | null; reason?: string };

  const reason = body.reason?.trim();
  if (!reason) {
    return Response.json({ error: "A reason is required to edit a punch." }, { status: 400 });
  }

  const entry = await prisma.clockEntry.findUnique({ where: { id } });
  if (!entry) return Response.json({ error: "Punch not found." }, { status: 404 });

  // Resolve the new values. Omitted fields keep their current value; clockOut
  // may be explicitly cleared by sending null.
  const newClockIn = body.clockIn ? new Date(body.clockIn) : entry.clockIn;
  if (isNaN(newClockIn.getTime())) {
    return Response.json({ error: "Invalid clock-in time." }, { status: 400 });
  }
  let newClockOut: Date | null = entry.clockOut;
  if ("clockOut" in body) {
    newClockOut = body.clockOut ? new Date(body.clockOut) : null;
    if (newClockOut && isNaN(newClockOut.getTime())) {
      return Response.json({ error: "Invalid clock-out time." }, { status: 400 });
    }
  }
  if (newClockOut && newClockOut.getTime() <= newClockIn.getTime()) {
    return Response.json({ error: "Clock-out must be after clock-in." }, { status: 400 });
  }

  const [, updated] = await prisma.$transaction([
    prisma.clockEntryEdit.create({
      data: {
        clockEntryId: entry.id,
        editedById: (session.user as { id?: string })?.id ?? null,
        reason,
        prevClockIn: entry.clockIn,
        prevClockOut: entry.clockOut,
        newClockIn,
        newClockOut,
      },
    }),
    prisma.clockEntry.update({
      where: { id: entry.id },
      data: { clockIn: newClockIn, clockOut: newClockOut },
    }),
  ]);

  return Response.json(updated);
}
