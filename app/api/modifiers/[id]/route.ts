import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { name, isRequired, maxSelect, sortOrder, options } = body as {
    name?: string;
    isRequired?: boolean;
    maxSelect?: number;
    sortOrder?: number;
    options?: { name: string; priceAdj?: number; sortOrder?: number }[];
  };

  // If options array is provided, replace them entirely
  const modifier = await prisma.modifier.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(isRequired !== undefined ? { isRequired } : {}),
      ...(maxSelect !== undefined ? { maxSelect } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(options
        ? {
            options: {
              deleteMany: {},
              create: options.map((o, i) => ({
                name: o.name,
                priceAdj: o.priceAdj ?? 0,
                sortOrder: o.sortOrder ?? i,
              })),
            },
          }
        : {}),
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json(modifier);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  await prisma.modifier.delete({ where: { id } });

  return new Response(null, { status: 204 });
}
