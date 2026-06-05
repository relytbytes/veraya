import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { snapshotDay } from "@/lib/vera-snapshot";
import { localDateStr } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

// POST/GET /api/cron/vera-snapshot
//
// Records an end-of-day snapshot: each health dimension's score paired with the
// day's realized P&L. Vera correlates these over time (lib/vera-weights) to
// learn which signals predict THIS restaurant's profit. Run nightly after close.
//
// Auth: CRON_SECRET (?secret= / Bearer) OR a logged-in session (manual trigger).
// Idempotent — upserts by date. ?date=YYYY-MM-DD to backfill a specific day.
// The core computation lives in lib/vera-snapshot.ts (shared with the simulator).

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorized = (secret && provided === secret) || !!(await auth());
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Snapshot a venue-local business day. Default to "today" in the restaurant's
  // timezone so the nightly run records the day that just closed, not the UTC day.
  const tz = await getRestaurantTz();
  const dateStr = url.searchParams.get("date") || localDateStr(new Date(), tz);

  const snap = await snapshotDay(dateStr, tz);
  return Response.json({ ok: true, ...snap });
}

export const GET = handle;
export const POST = handle;
