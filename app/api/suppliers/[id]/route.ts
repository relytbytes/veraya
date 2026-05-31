import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, email, phone, address, notes } = body;

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(notes !== undefined && { notes }),
    },
  });
  return Response.json(supplier);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await prisma.supplier.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err: unknown) {
    // FK constraint: supplier has linked ingredients
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Foreign key") || msg.includes("constraint") || msg.includes("FOREIGN")) {
      return Response.json(
        { error: "Cannot delete supplier — they have linked ingredients. Reassign or delete those first." },
        { status: 409 }
      );
    }
    throw err;
  }
}
