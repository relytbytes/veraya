import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/vera/feedback — a manager reacts to one of Vera's indicators.
// { key: indicator type, action: "dismissed" | "helpful", text?: rendered text }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { key, action, text } = await req.json() as { key?: string; action?: string; text?: string };
  if (!key || (action !== "dismissed" && action !== "helpful")) {
    return Response.json({ error: "key and a valid action are required" }, { status: 400 });
  }

  await prisma.veraFeedback.create({
    data: { key, action, text: text ?? null, userId: session.user?.id ?? null },
  });

  return Response.json({ ok: true });
}
