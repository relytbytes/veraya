import { useCallback, useState } from "react";

/**
 * Drives a RefreshControl's spinner from USER-initiated pulls only.
 *
 * Binding `refreshing` directly to React Query's `isRefetching` makes the
 * spinner animate on every background refetch (polling + SSE-triggered
 * invalidations), which looks like the app is pulling itself down. This tracks
 * a manual flag instead and only shows the spinner while the user's own
 * refresh is in flight.
 */
export function useManualRefresh() {
  const [refreshing, setRefreshing] = useState(false);
  const run = useCallback(async (fn: () => void | Promise<unknown>) => {
    setRefreshing(true);
    try { await fn(); } finally { setRefreshing(false); }
  }, []);
  return { refreshing, run };
}
