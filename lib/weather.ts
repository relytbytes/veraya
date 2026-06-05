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

// WMO weather code → human label + emoji (Open-Meteo's `weather_code`).
function codeToCondition(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code === 1) return { label: "Mostly clear", emoji: "🌤️" };
  if (code === 2) return { label: "Partly cloudy", emoji: "⛅" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", emoji: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", emoji: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Rain", emoji: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Snow", emoji: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Showers", emoji: "🌦️" };
  if (code >= 85 && code <= 86) return { label: "Snow showers", emoji: "🌨️" };
  if (code >= 95) return { label: "Thunderstorm", emoji: "⛈️" };
  return { label: "—", emoji: "🌡️" };
}

function demandMultiplier(precipMm: number, tempMaxF: number): { multiplier: number; summary: string } {
  let multiplier = 1;
  const reasons: string[] = [];
  if (precipMm >= 25) { multiplier *= 0.9; reasons.push("heavy rain"); }
  else if (precipMm >= 10) { multiplier *= 0.95; reasons.push("rain"); }
  if (tempMaxF >= 95) { multiplier *= 0.95; reasons.push("heat"); }
  else if (tempMaxF <= 25) { multiplier *= 0.95; reasons.push("cold"); }
  multiplier = Math.max(0.85, Math.min(1.05, multiplier));
  return { multiplier, summary: reasons.length ? reasons.join(" + ") : "mild" };
}

export interface WeatherDisplay {
  configured: boolean;
  label?: string;          // saved location label
  tempNowF?: number;
  hiF?: number;
  loF?: number;
  condition?: string;
  emoji?: string;
  precipMm?: number;
  multiplier?: number;     // demand adjustment fed into the forecast
}

// Richer current-conditions read for the dashboard widget.
export async function getWeatherDisplay(dateStr: string): Promise<WeatherDisplay> {
  try {
    const rows = await prisma.restaurantSettings.findMany({ where: { key: { in: ["restaurantLat", "restaurantLng", "restaurantLocationLabel"] } } });
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const lat = Number(cfg.restaurantLat);
    const lng = Number(cfg.restaurantLng);
    if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return { configured: false };

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto&start_date=${dateStr}&end_date=${dateStr}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { configured: false };
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[]; weather_code?: number[] };
    };
    const hiF = data.daily?.temperature_2m_max?.[0] ?? 70;
    const loF = data.daily?.temperature_2m_min?.[0] ?? 55;
    const precipMm = data.daily?.precipitation_sum?.[0] ?? 0;
    const code = data.current?.weather_code ?? data.daily?.weather_code?.[0] ?? 0;
    const cond = codeToCondition(code);
    const { multiplier } = demandMultiplier(precipMm, hiF);
    return {
      configured: true,
      label: cfg.restaurantLocationLabel || undefined,
      tempNowF: Math.round(data.current?.temperature_2m ?? hiF),
      hiF: Math.round(hiF), loF: Math.round(loF),
      condition: cond.label, emoji: cond.emoji,
      precipMm: Math.round(precipMm * 10) / 10,
      multiplier,
    };
  } catch {
    return { configured: false };
  }
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

    const { multiplier, summary } = demandMultiplier(precipMm, tempMaxF);
    return { tempMaxF: Math.round(tempMaxF), precipMm: Math.round(precipMm * 10) / 10, summary, multiplier };
  } catch {
    return null;
  }
}
