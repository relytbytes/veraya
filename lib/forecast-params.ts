import { prisma } from "@/lib/prisma";
import { DEFAULT_PARAMS, type ForecastParams } from "@/lib/forecast";

// The active forecast parameters live in RestaurantSettings under this key as
// JSON. The self-tuning cron (/api/cron/forecast-tune) backtests a grid and
// writes the best set here; everything else reads it (falling back to defaults).

const KEY = "forecastParams";

export async function loadForecastParams(): Promise<ForecastParams> {
  try {
    const row = await prisma.restaurantSettings.findUnique({ where: { key: KEY } });
    if (!row?.value) return DEFAULT_PARAMS;
    const parsed = JSON.parse(row.value) as Partial<ForecastParams>;
    // Merge over defaults so a partial / older blob still yields a complete set.
    return { ...DEFAULT_PARAMS, ...parsed };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export async function saveForecastParams(params: ForecastParams): Promise<void> {
  await prisma.restaurantSettings.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(params) },
    update: { value: JSON.stringify(params) },
  });
}
