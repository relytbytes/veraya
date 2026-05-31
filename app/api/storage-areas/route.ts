import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const areas = await prisma.storageArea.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(areas);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await req.json();
  if (!name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });
  const last = await prisma.storageArea.findFirst({ orderBy: { sortOrder: "desc" } });
  const area = await prisma.storageArea.create({ data: { name: name.trim(), sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return Response.json(area, { status: 201 });
}
