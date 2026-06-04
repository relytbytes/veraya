import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { sweepOverdueReservations } from "@/lib/reservation-sweep";
import { getRestaurantTz } from "@/lib/restaurant-tz";
import { localDateStr, localHourFloat } from "@/lib/time";

// GET/POST /api/cron/reservation-sweep
// Marks today's overdue, un-arrived reservations NO_SHOW (when enabled in
// Settings). Safe to run frequently. Auth: CRON_SECRET or a logged-in session.
async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorized = (secret && provided === secret) || !!(await auth());
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const tz = await getRestaurantTz();
  const now = new Date();
  const swept = await sweepOverdueReservations(localDateStr(now, tz), Math.round(localHourFloat(now, tz) * 60));
  return Response.json({ ok: true, swept });
}

export const GET = handle;
export const POST = handle;
