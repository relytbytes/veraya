import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function mgmt(role?: string) { return !!role && ["ADMIN", "MANAGER"].includes(role); }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const b = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "type", "number", "issuedTo", "authority", "issueDate", "expiryDate", "imageUrl", "notes"]) {
    if (b[k] !== undefined) data[k] = typeof b[k] === "string" ? (b[k].trim() || null) : b[k];
  }
  if (data.name === null) return Response.json({ error: "Name is required" }, { status: 400 });

  const license = await prisma.license.update({ where: { id }, data });
  return Response.json(license);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.license.delete({ where: { id } });
  return new Response(null, { status: 204 });
}
