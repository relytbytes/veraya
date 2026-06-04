import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function mgmt(role?: string) { return !!role && ["ADMIN", "MANAGER"].includes(role); }

// GET /api/licenses — all licenses/permits (managers only).
export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const licenses = await prisma.license.findMany({ orderBy: [{ expiryDate: "asc" }, { name: "asc" }] });
  return Response.json(licenses);
}

// POST /api/licenses — add a license.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const b = await req.json();
  if (!b.name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });

  const license = await prisma.license.create({
    data: {
      name: b.name.trim(),
      type: b.type ?? "OTHER",
      number: b.number?.trim() || null,
      issuedTo: b.issuedTo?.trim() || null,
      authority: b.authority?.trim() || null,
      issueDate: b.issueDate || null,
      expiryDate: b.expiryDate || null,
      imageUrl: b.imageUrl || null,
      notes: b.notes?.trim() || null,
    },
  });
  return Response.json(license, { status: 201 });
}
