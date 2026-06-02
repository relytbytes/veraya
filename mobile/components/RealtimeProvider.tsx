import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { useRealtime, type RealtimeEvent, type RealtimeScope } from "@/lib/use-realtime";

const DEBOUNCE_MS = 250;

// Which React Query caches each realtime scope should refresh. `["reservations"]`
// matches `["reservations", date]` too — React Query invalidation is prefix-based.
const SCOPE_KEYS: Record<RealtimeScope, string[][]> = {
  kitchen: [["kitchen"], ["openOrders"], ["dashboard"]],
  floor: [["tables"], ["waitlist"], ["reservations"], ["openOrders"], ["dashboard"]],
};

/**
 * Holds the app's single SSE connection (while authenticated + foregrounded)
 * and turns live floor/kitchen events into React Query cache invalidations, so
 * screens update near-instantly instead of waiting on their poll interval.
 * Polling stays in place as the fallback when the socket is down/backgrounded.
 */
export function RealtimeProvider() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // Debounce per scope so a burst (e.g. a table move emitting several events)
  // collapses into a single round of invalidations.
  const timers = useRef<Partial<Record<RealtimeScope, ReturnType<typeof setTimeout>>>>({});

  const onChange = useCallback((e: RealtimeEvent) => {
    const existing = timers.current[e.scope];
    if (existing) clearTimeout(existing);
    timers.current[e.scope] = setTimeout(() => {
      for (const queryKey of SCOPE_KEYS[e.scope]) qc.invalidateQueries({ queryKey });
    }, DEBOUNCE_MS);
  }, [qc]);

  useRealtime(!!user, onChange);
  return null;
}
