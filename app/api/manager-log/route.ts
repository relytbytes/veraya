import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const entries = await prisma.managerLogEntry.findMany({
    where: type ? { type } : {},
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(entries);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    type,
    shift,
    title,
    body: entryBody,
    severity,
    staffIds,
    followUp,
    openingBank,
    closingBank,
    totalDrop,
    discrepancy,
  } = body as {
    type: string;
    shift?: string;
    title: string;
    body: string;
    severity?: string;
    staffIds?: string;
    followUp?: string;
    openingBank?: number;
    closingBank?: number;
    totalDrop?: number;
    discrepancy?: number;
  };

  if (!type || !title || !entryBody) {
    return Response.json({ error: "type, title, and body are required" }, { status: 400 });
  }

  const authorId = session.user?.id;
  if (!authorId) return Response.json({ error: "No session user" }, { status: 401 });

  try {
    const entry = await prisma.managerLogEntry.create({
      data: {
        type,
        shift: shift ?? null,
        title,
        body: entryBody,
        severity: severity ?? null,
        staffIds: staffIds ?? null,
        followUp: followUp ?? null,
        openingBank: openingBank != null ? openingBank : null,
        closingBank: closingBank != null ? closingBank : null,
        totalDrop: totalDrop != null ? totalDrop : null,
        discrepancy: discrepancy != null ? discrepancy : null,
        authorId,
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    return Response.json(entry, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/manager-log]", e);
    return Response.json({ error: e instanceof Error ? e.message : "Database error" }, { status: 500 });
  }
}
