import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { useRealtime, type RealtimeEvent, type RealtimeScope } from "@/lib/use-realtime";

const DEBOUNCE_MS = 250;

// Which React Query caches each realtime scope should refresh. `["reservations"]`
// matches `["reservations", date]` too — React Query invalidation is prefix-based.
const SCOPE_KEYS: Record<RealtimeScope, string[][]> = {
  // 86 add/clear bridges to the kitchen scope, so refresh the 86 list + menu here
  // too — otherwise a server keeps ringing an 86'd item until the 2-min poll.
  kitchen: [["kitchen"], ["bar"], ["openOrders"], ["dashboard"], ["eightysix"], ["menuItems"]],
  floor: [["tables"], ["waitlist"], ["reservations"], ["openOrders"], ["dashboard"]],
  // Data changes (inventory adjust, 86, receiving) → refresh stock lists, Vera's
  // Cost & Inventory read, the 86 list/menu, and the dashboard, everywhere at once.
  data: [["inventory"], ["reorder"], ["vera"], ["vera-predicted"], ["dashboard"], ["eightysix"], ["menuItems"]],
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

  // On (re)connect, refresh every scope's caches once — this catches up any
  // events missed while the socket was down, which is the job blind polling
  // used to do. With this in place the background poll is just a slow safety net.
  const onConnect = useCallback(() => {
    const seen = new Set<string>();
    for (const keys of Object.values(SCOPE_KEYS)) {
      for (const queryKey of keys) {
        const k = queryKey.join("/");
        if (seen.has(k)) continue;
        seen.add(k);
        qc.invalidateQueries({ queryKey });
      }
    }
  }, [qc]);

  useRealtime(!!user, onChange, onConnect);
  return null;
}
