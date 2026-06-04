// A rotating, characterful header greeting. Picks from a daypart-appropriate
// pool and rotates hour-to-hour (stable within the hour so it doesn't flicker
// on refresh). Used as `${rotatingGreeting()}, ${firstName}`.

const POOLS: Record<string, string[]> = {
  morning: [
    "Good morning", "Rise and shine", "Mornin'", "Fresh start", "Let's cook",
    "Coffee's on", "Here we go", "Sleeves up",
  ],
  afternoon: [
    "Good afternoon", "Afternoon", "Keep it rolling", "Halfway home",
    "Cruising along", "Back at it", "Hope lunch flew",
  ],
  evening: [
    "Good evening", "Evening", "Showtime", "Let's get after it",
    "Big night ahead", "Lights up", "Game time",
  ],
  latenight: [
    "Burning the midnight oil", "Still standing", "Last-call energy",
    "Closing strong", "Almost home", "Night owl",
  ],
};

function poolFor(date: Date): string[] {
  const h = date.getHours();
  return h < 5 ? POOLS.latenight :
    h < 12 ? POOLS.morning :
    h < 17 ? POOLS.afternoon :
    h < 22 ? POOLS.evening :
    POOLS.latenight;
}

// Deterministic (SSR-safe) hourly rotation — same value on server + client.
export function rotatingGreeting(date: Date = new Date()): string {
  const pool = poolFor(date);
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return pool[(dayOfYear * 24 + date.getHours()) % pool.length];
}

// Fresh random phrase — call once per mount (useState initializer) so the
// greeting visibly changes each time the screen opens. Client-only.
export function randomGreeting(date: Date = new Date()): string {
  const pool = poolFor(date);
  return pool[Math.floor(Math.random() * pool.length)];
}
