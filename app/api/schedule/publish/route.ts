import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/schedule/publish  body: { date: "YYYY-MM-DD" }
// Marks all shifts on that date as published.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date } = body as { date?: string };

  if (!date) {
    return Response.json({ error: "date is required" }, { status: 400 });
  }

  const result = await prisma.shift.updateMany({
    where: { date },
    data: { isPublished: true, publishedAt: new Date() },
  });

  return Response.json({ count: result.count });
}
