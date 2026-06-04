import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { buildRegister, openOrFinalizeRun } from "@/lib/payroll-server";

function mgmt(role?: string) {
  return !!role && ["ADMIN", "MANAGER"].includes(role);
}

// GET /api/payroll?index=<signed period index>
// Returns the gross-pay register for the period (live for DRAFT / no run, frozen
// snapshot for FINALIZED), plus period nav and config.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mgmt(session.user?.role as string | undefined)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const indexParam = new URL(req.url).searchParams.get("index");
  const index = indexParam !== null && indexParam.trim() !== "" ? Number(indexParam) : null;
  const register = await buildRegister(index);
  return Response.json(register);
}

// POST /api/payroll  body: { index: number, action: "open" | "finalize" | "reopen", notes? }
// open    → snapshot a DRAFT run for the period (idempotent)
// finalize→ freeze the run
// reopen  → set a finalized run back to DRAFT for corrections
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user?.role as string | undefined;
  if (!mgmt(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { index?: number; action?: string; notes?: string };
  const index = Number(body.index);
  if (!Number.isFinite(index)) return Response.json({ error: "index is required" }, { status: 400 });
  const action = body.action ?? "open";
  if (!["open", "finalize", "reopen"].includes(action)) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  const userId = (session.user?.id as string | undefined) ?? null;
  const result = await openOrFinalizeRun(index, {
    finalize: action === "finalize",
    userId,
    notes: body.notes,
  });
  return Response.json(result);
}
