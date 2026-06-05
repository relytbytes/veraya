import { prisma } from "@/lib/prisma";
import { groupSameDowSamples, forecastFromSamples, forecastDayparts, type OrderLite, type PrepItem } from "@/lib/forecast";
import { loadForecastParams } from "@/lib/forecast-params";
import { usHoliday, holidayMultiplier, type HolidayInfo } from "@/lib/calendar";
import { getWeatherSignal, type WeatherSignal } from "@/lib/weather";

// Single source of truth for the day's demand forecast. Used by both the Vera
// Forecast card (/api/vera/forecast) and the Vera health panel (/api/vera) so the
// two ALWAYS agree on tonight's projected sales — the dashboard projection is the
// same number the forecast card shows.

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DayForecast {
  projectedSales: number;
  projectedCovers: number;
  baseSales: number;
  reservedCovers: number;
  eventCovers: number;
  eventNames: string[];
  sampleCount: number;
  confidence: "low" | "medium" | "high";
  trendPct: number;
  prep: PrepItem[];
  dayparts: { name: string; projectedSales: number; share: number }[];
  holiday: HolidayInfo | null;
  weather: WeatherSignal | null;
  adjustment: number;
  avgCheck: number;
  dowName: string;
  todayStr: string;
}

export async function computeDayForecast(now: Date = new Date()): Promise<DayForecast> {
  const todayStr = localDateStr(now);
  const dowName = now.toLocaleDateString("en-US", { weekday: "long" });
  const since = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000); // 12 weeks

  const [history, tonightRes, todayEvents, params, weather] = await Promise.all([
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: since, lt: new Date(todayStr + "T00:00:00") } },
      select: {
        total: true,
        createdAt: true,
        items: { where: { voided: false }, select: { quantity: true, menuItem: { select: { name: true } } } },
      },
    }),
    prisma.reservation.findMany({
      where: { date: todayStr, status: { in: ["CONFIRMED", "PENDING", "SEATED"] } },
      select: { partySize: true },
    }),
    prisma.event.findMany({
      where: { date: todayStr, status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { guestCount: true, name: true },
    }),
    loadForecastParams(),
    getWeatherSignal(todayStr),
  ]);

  const orders: OrderLite[] = history.map((o) => ({
    total: Number(o.total),
    createdAt: new Date(o.createdAt),
    items: o.items.map((it) => ({ quantity: it.quantity, name: it.menuItem.name })),
  }));

  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const avgCheck = orders.length ? totalSales / orders.length : 0;

  const reservedCovers = tonightRes.reduce((s, r) => s + r.partySize, 0);
  const eventCovers = todayEvents.reduce((s, e) => s + (e.guestCount ?? 0), 0);

  const holiday = usHoliday(now);
  const adjustment = holidayMultiplier(holiday) * (weather?.multiplier ?? 1);

  const samples = groupSameDowSamples(orders, now);
  const f = forecastFromSamples(samples, { reservedCovers, eventCovers, avgCheck, adjustment }, params);
  const dayparts = forecastDayparts(orders, now, params, adjustment);

  return {
    projectedSales: f.projectedSales,
    projectedCovers: f.projectedCovers,
    baseSales: f.baseSales,
    reservedCovers,
    eventCovers,
    eventNames: todayEvents.map((e) => e.name),
    sampleCount: f.sampleCount,
    confidence: f.confidence,
    trendPct: f.trendPct,
    prep: f.prep,
    dayparts: dayparts.map((d) => ({ name: d.name, projectedSales: d.projectedSales, share: d.share })),
    holiday,
    weather,
    adjustment,
    avgCheck,
    dowName,
    todayStr,
  };
}
