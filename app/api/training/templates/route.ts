import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.trainingTemplate.findMany({
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  return Response.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, role, items } = body as { name: string; role?: string; items?: string[] };

  if (!name?.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  // Optional starter items — created atomically with the template so an import
  // can never end up partially populated (or blank) from a failed follow-up call.
  const itemTitles = Array.isArray(items)
    ? items.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean)
    : [];

  try {
    const template = await prisma.trainingTemplate.create({
      data: {
        name: name.trim(),
        role: role ?? null,
        ...(itemTitles.length
          ? { items: { create: itemTitles.map((title, i) => ({ title, sortOrder: i })) } }
          : {}),
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    return Response.json(template, { status: 201 });
  } catch (e: unknown) {
    console.error("[POST /api/training/templates]", e);
    return Response.json({ error: "Database error" }, { status: 500 });
  }
}
