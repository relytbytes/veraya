// Server-only resolver for the venue's IANA timezone. Kept separate from
// lib/time.ts (pure date math) so that module stays safe to import from
// anywhere — only this file touches the database.
//
// The timezone is stored as a RestaurantSettings row ("timezone"), set from the
// Settings panel (auto-detected from the browser on first setup). Every server
// route that computes a "business day" should resolve the tz through here so the
// whole app agrees on when "today" starts and ends.

import { prisma } from "./prisma";
import { resolveTz, RESTAURANT_TZ } from "./time";

let cache: { at: number; tz: string } | null = null;
const TTL_MS = 60 * 1000; // settings change rarely; re-read at most once a minute

/** The restaurant's timezone from Settings (falls back to env / US Central). */
export async function getRestaurantTz(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.tz;
  try {
    const row = await prisma.restaurantSettings.findUnique({ where: { key: "timezone" } });
    const tz = resolveTz(row?.value);
    cache = { at: Date.now(), tz };
    return tz;
  } catch {
    return RESTAURANT_TZ;
  }
}
