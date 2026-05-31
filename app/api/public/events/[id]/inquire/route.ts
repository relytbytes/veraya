import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) {
    return Response.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status !== "CONFIRMED") {
    return Response.json({ error: "Event is not accepting inquiries" }, { status: 400 });
  }

  const body = await req.json() as {
    name?: string;
    email?: string;
    phone?: string;
    partySize?: number;
    notes?: string;
  };

  if (!body.name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  if (!body.email?.trim()) {
    return Response.json({ error: "email is required" }, { status: 400 });
  }

  // Create a Reservation linked to the event's date as a PENDING inquiry
  const reservation = await prisma.reservation.create({
    data: {
      date: event.date,
      time: event.startTime,
      partySize: body.partySize ?? 1,
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      email: body.email.trim(),
      notes: [
        `Event inquiry: ${event.name}`,
        body.notes?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
      status: "PENDING",
    },
  });

  return Response.json({ id: reservation.id, success: true }, { status: 201 });
}
