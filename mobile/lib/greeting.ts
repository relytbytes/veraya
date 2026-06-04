// A rotating, characterful header greeting. Picks from a daypart-appropriate
// pool and rotates hour-to-hour (stable within the hour so it doesn't flicker
// on refresh). Used as `${rotatingGreeting()}, ${firstName}`.

// Each phrase is shown as "${phrase}, ${firstName}" — so every line must read
// naturally with a name appended. A deliberate mix of short and longer lines
// keeps the header feeling human rather than canned.
const POOLS: Record<string, string[]> = {
  morning: [
    "Good morning",
    "Rise and shine",
    "Welcome back",
    "The coffee's on",
    "Let's make it a good one",
    "Hope you slept well",
    "Fresh day, fresh start",
    "Ready when you are",
    "Here's to a smooth open",
    "Hope the morning's treating you right",
  ],
  afternoon: [
    "Good afternoon",
    "Back at it",
    "Keep it rolling",
    "Halfway there",
    "Hope the lunch rush was kind",
    "Cruising right along",
    "Hope you grabbed a bite",
    "Steady as she goes",
    "The afternoon lull won't last",
  ],
  evening: [
    "Good evening",
    "It's showtime",
    "Big night ahead",
    "Let's get after it",
    "Lights up",
    "The dinner rush awaits",
    "Hope you're ready for a busy one",
    "Here's to a smooth service",
    "Let's give them a night to remember",
  ],
  latenight: [
    "Burning the midnight oil",
    "Still going strong",
    "Almost home",
    "Let's close this one out strong",
    "It's last-call energy now",
    "Hope it was a good one",
    "The night owls are still at it",
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
