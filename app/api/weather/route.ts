import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getWeatherDisplay } from "@/lib/weather";

// GET /api/weather — current conditions for the saved venue location, for the
// dashboard widget. Returns { configured: false } until a location is set.

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const data = await getWeatherDisplay(localDateStr(new Date()));
  return Response.json(data, { headers: { "Cache-Control": "private, max-age=900, stale-while-revalidate=300" } });
}
