import { EventEmitter } from "events";
import type IORedis from "ioredis";

/**
 * In-process pub/sub for live updates, transparently backed by Redis when a
 * REDIS_URL is configured. A mutation route calls publish(); the SSE endpoint
 * (app/api/realtime) subscribes and streams events to connected clients.
 *
 * WHY REDIS: on a multi-instance serverless deploy (Vercel) a bare EventEmitter
 * only reaches listeners in the *same* Node process, so an event published on
 * one instance never reaches an SSE stream held open on another — clients then
 * rely on their polling fallback. Pointing REDIS_URL at an Upstash (or any)
 * Redis makes publish() fan out across every instance via Redis pub/sub. The
 * publish()/subscribe() surface is unchanged, so callers don't change, and with
 * no REDIS_URL it degrades to the original single-process behavior.
 */

export interface RealtimeEvent {
  /** Coarse channel so clients can ignore irrelevant traffic. */
  scope: "floor" | "kitchen" | "data";
  /** What happened, e.g. "reservation.seated", "table.updated", "inventory.changed". */
  type: string;
  /** Optional ids for targeted client updates. */
  ids?: string[];
  at?: number;
}

const CHANNEL = "veraya:realtime";

const KEY = "__restaurantOpsRealtimeBus";
type Glob = {
  [KEY]?: EventEmitter;
  __veraRedisPub?: IORedis;
  __veraRedisBridged?: boolean;
};
const g = globalThis as unknown as Glob;
const bus: EventEmitter = g[KEY] ?? (g[KEY] = new EventEmitter());
bus.setMaxListeners(0); // many SSE clients

function redisUrl(): string {
  return process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || "";
}

/**
 * Stand up the Redis publisher + a single per-instance subscriber that forwards
 * every cross-instance event onto the local bus. Idempotent and best-effort —
 * if Redis is misconfigured we silently stay on the in-process bus.
 */
function ensureRedisBridge(): void {
  const url = redisUrl();
  if (!url || g.__veraRedisBridged) return;
  g.__veraRedisBridged = true;
  void (async () => {
    try {
      const { default: Redis } = await import("ioredis");
      g.__veraRedisPub = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false });
      g.__veraRedisPub.on("error", (e) => console.error("[realtime] redis pub error:", e?.message ?? e));
      const sub = new Redis(url, { maxRetriesPerRequest: 2 });
      sub.on("error", (e) => console.error("[realtime] redis sub error:", e?.message ?? e));
      await sub.subscribe(CHANNEL);
      sub.on("message", (_ch, msg) => {
        try { bus.emit("event", JSON.parse(msg) as RealtimeEvent); } catch { /* ignore malformed */ }
      });
    } catch (e) {
      console.error("[realtime] redis bridge init failed; staying in-process:", (e as Error)?.message ?? e);
      g.__veraRedisBridged = false; // allow a later retry
    }
  })();
}

export function publish(event: Omit<RealtimeEvent, "at">): void {
  const full: RealtimeEvent = { ...event, at: Date.now() };
  if (redisUrl()) {
    ensureRedisBridge();
    const pub = g.__veraRedisPub;
    if (pub) {
      // Fan out to every instance (incl. this one — our own subscriber receives
      // it and emits to the local bus, so we don't double-emit here).
      pub.publish(CHANNEL, JSON.stringify(full)).catch((e) => {
        console.error("[realtime] publish failed, emitting locally:", e?.message ?? e);
        bus.emit("event", full);
      });
    } else {
      // Bridge still warming up — deliver locally so same-instance clients work.
      bus.emit("event", full);
    }
  } else {
    bus.emit("event", full);
  }
}

export function subscribe(listener: (event: RealtimeEvent) => void): () => void {
  ensureRedisBridge(); // make sure cross-instance events reach this process
  bus.on("event", listener);
  return () => { bus.off("event", listener); };
}
