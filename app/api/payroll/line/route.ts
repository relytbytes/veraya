import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { setLineAdjustment } from "@/lib/payroll-server";

// PATCH /api/payroll/line
// body: { index: number, userId: string, adjustmentCents: number, adjustmentNote?: string }
// Sets a manager bonus/deduction on one employee's line, opening a DRAFT run if needed.
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user?.role as string | undefined;
  if (!role || !["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    index?: number; userId?: string; adjustmentCents?: number; adjustmentNote?: string;
  };
  const index = Number(body.index);
  if (!Number.isFinite(index) || !body.userId) {
    return Response.json({ error: "index and userId are required" }, { status: 400 });
  }
  const cents = Number(body.adjustmentCents);
  if (!Number.isFinite(cents)) {
    return Response.json({ error: "adjustmentCents must be a number" }, { status: 400 });
  }

  const actorId = (session.user?.id as string | undefined) ?? null;
  const result = await setLineAdjustment(index, body.userId, cents, body.adjustmentNote ?? null, actorId);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
