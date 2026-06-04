import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/prep-log?date=YYYY-MM-DD → the logged prep/waste rows for that day.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date");
  if (!date) return Response.json({ error: "date is required" }, { status: 400 });

  const logs = await prisma.prepWasteLog.findMany({
    where: { date },
    select: { ingredientId: true, preppedQty: true, wastedQty: true, unit: true, note: true, updatedAt: true },
  });
  // Return as a map keyed by ingredientId for easy client merge.
  const byIngredient: Record<string, { preppedQty: number; wastedQty: number; note: string | null }> = {};
  for (const l of logs) {
    byIngredient[l.ingredientId] = {
      preppedQty: Number(l.preppedQty),
      wastedQty: Number(l.wastedQty),
      note: l.note,
    };
  }
  return Response.json({ date, logs: byIngredient });
}

// POST /api/prep-log  body: { date, ingredientId, preppedQty, wastedQty, note? }
// Upserts one ingredient's yield log for a day. A zeroed row is deleted so the
// day stays clean.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    date?: string; ingredientId?: string; preppedQty?: number; wastedQty?: number; note?: string;
  };
  const { date, ingredientId } = body;
  if (!date || !ingredientId) {
    return Response.json({ error: "date and ingredientId are required" }, { status: 400 });
  }
  const preppedQty = Math.max(0, Number(body.preppedQty) || 0);
  const wastedQty = Math.max(0, Number(body.wastedQty) || 0);
  const note = body.note?.trim() || null;

  // Nothing meaningful to store → remove any existing row.
  if (preppedQty === 0 && wastedQty === 0 && !note) {
    await prisma.prepWasteLog.deleteMany({ where: { date, ingredientId } });
    return Response.json({ ok: true, deleted: true });
  }

  const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId }, select: { unit: true } });
  if (!ing) return Response.json({ error: "Unknown ingredient" }, { status: 404 });

  const userId = (session.user?.id as string | undefined) ?? null;
  await prisma.prepWasteLog.upsert({
    where: { date_ingredientId: { date, ingredientId } },
    update: { preppedQty, wastedQty, note, unit: ing.unit },
    create: { date, ingredientId, preppedQty, wastedQty, note, unit: ing.unit, createdById: userId },
  });
  return Response.json({ ok: true });
}
