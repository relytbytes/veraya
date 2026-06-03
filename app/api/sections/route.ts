import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publish } from "@/lib/realtime";

// GET /api/sections — dedicated server sections with their assigned server and
// the table numbers in each. POST creates a section.
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sections = await prisma.serverSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      server: { select: { id: true, name: true } },
      tables: { select: { id: true, number: true }, orderBy: { number: "asc" } },
    },
  });
  return Response.json(sections);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color, serverId } = await req.json() as { name?: string; color?: string; serverId?: string | null };
  if (!name?.trim()) return Response.json({ error: "Section name is required" }, { status: 400 });

  const count = await prisma.serverSection.count();
  try {
    const section = await prisma.serverSection.create({
      data: { name: name.trim(), color: color || "#21A090", serverId: serverId || null, sortOrder: count },
      include: { server: { select: { id: true, name: true } }, tables: { select: { id: true, number: true } } },
    });
    publish({ scope: "floor", type: "section.updated", ids: [section.id] });
    return Response.json(section, { status: 201 });
  } catch {
    return Response.json({ error: "A section with that name already exists" }, { status: 409 });
  }
}
