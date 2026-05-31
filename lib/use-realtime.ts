"use client";

import { useEffect, useRef } from "react";

export type RealtimeScope = "floor" | "kitchen";
export interface RealtimeEvent { scope: RealtimeScope; type: string; ids?: string[]; at?: number }

/**
 * Subscribe to the server's SSE stream. Calls `onChange` when an event whose
 * scope is in `scopes` arrives, debounced so a burst of changes triggers a
 * single refresh. The EventSource auto-reconnects on drop (browser built-in).
 */
export function useRealtime(
  scopes: RealtimeScope | RealtimeScope[],
  onChange: (e: RealtimeEvent) => void,
  debounceMs = 250,
) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }, [onChange]);

  const wanted = Array.isArray(scopes) ? scopes : [scopes];
  const key = wanted.join(",");

  useEffect(() => {
    const accept = new Set(key.split(","));
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last: RealtimeEvent | null = null;

    const es = new EventSource("/api/realtime");
    es.addEventListener("change", (ev) => {
      let data: RealtimeEvent;
      try { data = JSON.parse((ev as MessageEvent).data); } catch { return; }
      if (!accept.has(data.scope)) return;
      last = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (last) cb.current(last); }, debounceMs);
    });

    return () => { if (timer) clearTimeout(timer); es.close(); };
  }, [key, debounceMs]);
}
