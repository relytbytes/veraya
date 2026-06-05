import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/settings/geocode?q=Austin
// Resolves a city/place name to coordinates via Open-Meteo's free geocoding API
// (no key). Used by Settings to set the venue lat/long for weather-aware
// forecasting without the manager hunting down coordinates.

interface GeoHit { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "missing_query" }, { status: 400 });

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ results: [] });
    const data = (await res.json()) as { results?: GeoHit[] };
    const results = (data.results ?? []).map((r) => ({
      label: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
      lat: r.latitude,
      lng: r.longitude,
    }));
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
