import { EventEmitter } from "events";

/**
 * In-process pub/sub for live updates. A mutation route calls publish(); the SSE
 * endpoint (app/api/realtime) subscribes and streams events to connected clients.
 *
 * Scope: this works for a single Node process (next dev / next start). On a
 * multi-instance serverless deploy (e.g. Vercel) events wouldn't cross instances —
 * swap this module's transport for Redis/Pusher/Ably at that point. The publish()
 * / subscribe() surface stays the same, so callers won't change.
 */

export interface RealtimeEvent {
  /** Coarse channel so clients can ignore irrelevant traffic. */
  scope: "floor" | "kitchen";
  /** What happened, e.g. "reservation.seated", "table.updated". */
  type: string;
  /** Optional ids for targeted client updates. */
  ids?: string[];
  at?: number;
}

const KEY = "__restaurantOpsRealtimeBus";
const g = globalThis as unknown as { [KEY]?: EventEmitter };
const bus: EventEmitter = g[KEY] ?? (g[KEY] = new EventEmitter());
bus.setMaxListeners(0); // many SSE clients

export function publish(event: Omit<RealtimeEvent, "at">): void {
  bus.emit("event", { ...event, at: Date.now() } satisfies RealtimeEvent);
}

export function subscribe(listener: (event: RealtimeEvent) => void): () => void {
  bus.on("event", listener);
  return () => { bus.off("event", listener); };
}
