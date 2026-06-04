import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET  /api/staff/[id]/notes  — list notes for a staff member
// POST /api/staff/[id]/notes  — add a note  { body: string }
// DELETE /api/staff/[id]/notes?noteId=xxx — delete a note (author or manager only)

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const notes = await prisma.staffNote.findMany({
      where: { userId: id },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });

    return Response.json(notes);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const authorId = (session?.user as { id?: string } | undefined)?.id;
    if (!session || !authorId) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const body = await req.json() as { body?: string; type?: string };
    if (!body.body?.trim()) {
      return Response.json({ error: "Note body is required" }, { status: 400 });
    }
    const noteType = ["POSITIVE", "DISCIPLINARY", "GENERAL"].includes(body.type ?? "") ? body.type! : "GENERAL";

    const note = await prisma.staffNote.create({
      data: {
        userId: id,
        authorId,
        type: noteType,
        body: body.body.trim(),
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    return Response.json(note, { status: 201 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    await params;

    const noteId = new URL(req.url).searchParams.get("noteId");
    if (!noteId) return Response.json({ error: "noteId required" }, { status: 400 });

    await prisma.staffNote.delete({ where: { id: noteId } });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
