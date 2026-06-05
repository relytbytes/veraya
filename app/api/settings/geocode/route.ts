import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// GET /api/settings/geocode?q=Chicago, IL
// Resolves a city/place name to coordinates via Open-Meteo's free geocoding API
// (no key). Open-Meteo matches a PLAIN place name, so we send just the city and
// use the state/region (if given) to rank the matches.

interface GeoHit { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }

// US state abbreviation → full name, so "Chicago, IL" ranks Illinois first.
const US_STATES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california", co: "colorado",
  ct: "connecticut", de: "delaware", fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho",
  il: "illinois", in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana",
  me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
  mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada", nh: "new hampshire", nj: "new jersey",
  nm: "new mexico", ny: "new york", nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma",
  or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota",
  tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia", wa: "washington",
  wv: "west virginia", wi: "wisconsin", wy: "wyoming", dc: "district of columbia",
};

function regionMatches(admin1: string | undefined, region: string): boolean {
  if (!admin1) return false;
  const a = admin1.toLowerCase();
  const r = region.toLowerCase();
  return a === r || a === (US_STATES[r] ?? "") || a.startsWith(r) || r.startsWith(a);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "missing_query" }, { status: 400 });

  // Split "City, ST" → query Open-Meteo with the city, rank by the region.
  const parts = q.split(",").map((s) => s.trim()).filter(Boolean);
  const city = parts[0] || q;
  const region = parts[1];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ results: [] });
    const data = (await res.json()) as { results?: GeoHit[] };
    let hits = data.results ?? [];

    // If a region was given, surface matching results first.
    if (region && hits.length > 1) {
      const matched = hits.filter((h) => regionMatches(h.admin1, region));
      const rest = hits.filter((h) => !regionMatches(h.admin1, region));
      hits = [...matched, ...rest];
    }

    const results = hits.slice(0, 6).map((r) => ({
      label: [r.name, r.admin1, r.country_code].filter(Boolean).join(", "),
      lat: r.latitude,
      lng: r.longitude,
    }));
    return Response.json({ results });
  } catch {
    return Response.json({ results: [] });
  }
}
