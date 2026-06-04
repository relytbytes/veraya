import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  const notes = await prisma.staffNote.findMany({
    where: userId ? { userId } : {},
    include: {
      author: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(notes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { userId, body: noteBody, type } = body as { userId: string; body: string; type?: string };

  if (!userId || !noteBody?.trim()) {
    return Response.json({ error: "userId and body are required" }, { status: 400 });
  }
  const noteType = ["POSITIVE", "DISCIPLINARY", "GENERAL"].includes(type ?? "") ? type! : "GENERAL";

  const authorId = session.user?.id;
  if (!authorId) return Response.json({ error: "No session user" }, { status: 401 });

  try {
    const note = await prisma.staffNote.create({
      data: { userId, authorId, body: noteBody.trim(), type: noteType },
      include: {
        author: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });
    return Response.json(note, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/staff-notes]", e);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
