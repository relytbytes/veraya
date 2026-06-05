import { prisma } from "@/lib/prisma";

// Weather as an exogenous demand signal. Uses Open-Meteo (free, no API key).
// Requires the venue's lat/long in RestaurantSettings (keys: restaurantLat,
// restaurantLng); returns null otherwise so the forecast degrades gracefully.
//
// NOTE: the multiplier here is a transparent heuristic prior. The rigorous next
// step is to log daily weather alongside sales and learn the true coefficients
// from history — this gives us the signal to start collecting now.

export interface WeatherSignal {
  tempMaxF: number;
  precipMm: number;
  summary: string;
  multiplier: number; // demand adjustment, clamped to a conservative band
}

export async function getWeatherSignal(dateStr: string): Promise<WeatherSignal | null> {
  try {
    const rows = await prisma.restaurantSettings.findMany({ where: { key: { in: ["restaurantLat", "restaurantLng"] } } });
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const lat = Number(cfg.restaurantLat);
    const lng = Number(cfg.restaurantLng);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return null;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=precipitation_sum,temperature_2m_max&temperature_unit=fahrenheit&timezone=auto` +
      `&start_date=${dateStr}&end_date=${dateStr}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { daily?: { precipitation_sum?: number[]; temperature_2m_max?: number[] } };
    const precipMm = data.daily?.precipitation_sum?.[0] ?? 0;
    const tempMaxF = data.daily?.temperature_2m_max?.[0] ?? 70;

    let multiplier = 1;
    const reasons: string[] = [];
    if (precipMm >= 25) { multiplier *= 0.9; reasons.push("heavy rain"); }
    else if (precipMm >= 10) { multiplier *= 0.95; reasons.push("rain"); }
    if (tempMaxF >= 95) { multiplier *= 0.95; reasons.push("heat"); }
    else if (tempMaxF <= 25) { multiplier *= 0.95; reasons.push("cold"); }

    multiplier = Math.max(0.85, Math.min(1.05, multiplier));
    const summary = reasons.length ? reasons.join(" + ") : "mild";
    return { tempMaxF: Math.round(tempMaxF), precipMm: Math.round(precipMm * 10) / 10, summary, multiplier };
  } catch {
    return null;
  }
}
