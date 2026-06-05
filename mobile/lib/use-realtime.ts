import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import EventSource from "react-native-sse";
import { BASE_URL, getHeaders } from "./api";

// Mirror of the web RealtimeEvent shape emitted by /api/realtime.
export type RealtimeScope = "floor" | "kitchen" | "data";
export interface RealtimeEvent {
  scope: RealtimeScope;
  type: string;
  ids?: string[];
  at?: number;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Hold a single Server-Sent Events connection to the backend's /api/realtime
 * stream and hand parsed events to `onChange`.
 *
 * Mobile-specific behavior vs the web hook:
 *  - Authenticates with the same NextAuth cookie the API client uses.
 *  - Only connects while `enabled` AND the app is foregrounded (a socket on a
 *    backgrounded RN app is unreliable and wastes battery).
 *  - Reconnects with exponential backoff, but STOPS on HTTP 401 — an expired
 *    token shouldn't hammer the server; React Query polling carries until the
 *    next login.
 */
export function useRealtime(
  enabled: boolean,
  onChange: (e: RealtimeEvent) => void,
  onConnect?: () => void,
) {
  // Keep the latest callbacks without forcing a reconnect when identity changes.
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }, [onChange]);
  const connectCb = useRef(onConnect);
  useEffect(() => { connectCb.current = onConnect; }, [onConnect]);

  useEffect(() => {
    if (!enabled) return;

    let es: EventSource<"change"> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let openedAt = 0;
    let lastCatchUp = 0;
    let appActive = AppState.currentState === "active";
    let disposed = false;
    let stoppedFor401 = false;
    // Throttle the on-(re)connect catch-up so a flapping socket can't storm the
    // cache with invalidations.
    const CATCHUP_THROTTLE_MS = 10_000;
    // A connection must stay open this long to count as "healthy" and reset the
    // backoff. On serverless (Vercel) the stream is short-lived, so without this
    // the socket flaps open→close and reconnects every ~1s.
    const STABLE_MS = 20_000;
    // Generation guard: getHeaders() is async, so a teardown mid-await must not
    // leave a stray connection behind.
    let generation = 0;

    const clearReconnect = () => {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    const teardown = () => {
      clearReconnect();
      if (es) {
        es.removeAllEventListeners();
        es.close();
        es = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || !appActive || stoppedFor401) return;
      clearReconnect();
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
      attempts += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (disposed || !appActive || stoppedFor401 || es) return;
      const myGen = ++generation;
      const headers = await getHeaders();
      // Bailed out while awaiting headers, or another connect superseded us.
      if (disposed || !appActive || stoppedFor401 || myGen !== generation) return;

      es = new EventSource<"change">(`${BASE_URL}/api/realtime`, {
        headers,
        // We manage reconnection ourselves (to honor 401 + app state).
        pollingInterval: 0,
      });

      es.addEventListener("open", () => {
        openedAt = Date.now();
        // Any events that fired while the socket was down were missed; refresh
        // once on (re)connect to catch up. This is what replaces fast polling.
        if (openedAt - lastCatchUp >= CATCHUP_THROTTLE_MS) {
          lastCatchUp = openedAt;
          connectCb.current?.();
        }
      });

      es.addEventListener("change", (event) => {
        if (!event.data) return;
        let data: RealtimeEvent;
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.scope !== "floor" && data.scope !== "kitchen" && data.scope !== "data") return;
        cb.current(data);
      });

      es.addEventListener("error", (event) => {
        // 401 → token invalid/expired; stop retrying and let polling carry.
        const status = (event as { xhrStatus?: number }).xhrStatus;
        if (status === 401) {
          stoppedFor401 = true;
          teardown();
          return;
        }
        // Any other drop: close this socket and back off before retrying.
        // Only reset the backoff if the connection was healthy (stayed open a
        // while); a quick flap keeps backing off so we don't reconnect-storm.
        if (openedAt && Date.now() - openedAt >= STABLE_MS) attempts = 0;
        openedAt = 0;
        if (es) { es.removeAllEventListeners(); es.close(); es = null; }
        scheduleReconnect();
      });
    };

    const onAppState = (state: AppStateStatus) => {
      const nowActive = state === "active";
      if (nowActive === appActive) return;
      appActive = nowActive;
      if (nowActive) {
        // Returning to foreground — a fresh login may have happened, so retry.
        stoppedFor401 = false;
        attempts = 0;
        connect();
      } else {
        teardown();
      }
    };

    const sub = AppState.addEventListener("change", onAppState);
    connect();

    return () => {
      disposed = true;
      sub.remove();
      teardown();
    };
  }, [enabled]);
}
