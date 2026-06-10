import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { parseSalesCsv, importSalesHistory, clearImportedSales } from "@/lib/sales-import";

// POST /api/import/sales  { csv, clear? }
// Turns a restaurant's real daily-sales export (CSV from any POS) into the
// COMPLETED Order rows + learning snapshots Vera reads, so the whole intelligence
// layer runs on the venue's actual numbers. Logic lives in lib/sales-import so it
// can be dry-run tested against a real DB.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { csv, clear } = body as { csv?: string; clear?: boolean };

  if (clear) return Response.json(await clearImportedSales());

  const parsed = parseSalesCsv(csv ?? "");
  if (parsed.error) return Response.json({ error: parsed.error, detected: parsed.detected }, { status: 400 });

  const tz = await getRestaurantTz();
  const result = await importSalesHistory(parsed.byDate, tz);
  return Response.json({ ...result, skipped: parsed.skipped, detected: parsed.detected });
}
