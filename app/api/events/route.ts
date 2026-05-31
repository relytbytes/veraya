import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const events = await prisma.event.findMany({
    orderBy: { date: "desc" },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  return Response.json(events);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name?: string; date?: string; startTime?: string; endTime?: string;
    guestCount?: number; contactName?: string; contactPhone?: string; contactEmail?: string;
    venue?: string; notes?: string; menuNotes?: string;
    depositAmount?: number; totalAmount?: number; customerId?: string;
  };

  if (!body.name?.trim()) return Response.json({ error: "name is required" }, { status: 400 });
  if (!body.date?.trim()) return Response.json({ error: "date is required" }, { status: 400 });
  if (!body.startTime?.trim()) return Response.json({ error: "startTime is required" }, { status: 400 });
  if (!body.contactName?.trim()) return Response.json({ error: "contactName is required" }, { status: 400 });

  const event = await prisma.event.create({
    data: {
      name: body.name.trim(),
      date: body.date.trim(),
      startTime: body.startTime.trim(),
      endTime: body.endTime?.trim() || null,
      guestCount: body.guestCount ?? null,
      contactName: body.contactName.trim(),
      contactPhone: body.contactPhone?.trim() || null,
      contactEmail: body.contactEmail?.trim() || null,
      venue: body.venue?.trim() || null,
      notes: body.notes?.trim() || null,
      menuNotes: body.menuNotes?.trim() || null,
      depositAmount: body.depositAmount != null ? body.depositAmount : null,
      totalAmount: body.totalAmount != null ? body.totalAmount : null,
      customerId: body.customerId || null,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  return Response.json(event, { status: 201 });
}
