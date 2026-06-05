import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getWeatherSignal } from "@/lib/weather";

// GET /api/settings/weather
// Returns today's weather signal for the saved venue location, so Settings can
// preview/confirm the weather integration is live after coordinates are set.

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const signal = await getWeatherSignal(localDateStr(new Date()));
  if (!signal) return Response.json({ configured: false });
  return Response.json({ configured: true, ...signal });
}
