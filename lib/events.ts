import { EventEmitter } from "events";

// Survive Next.js HMR reloads in development
const g = globalThis as unknown as { __restaurantEmitter?: EventEmitter };
if (!g.__restaurantEmitter) {
  g.__restaurantEmitter = new EventEmitter();
  g.__restaurantEmitter.setMaxListeners(200);
}
const emitter = g.__restaurantEmitter;

export type AppEvent =
  | { type: "order.created"; orderId: string }
  | { type: "order.updated"; orderId: string; status: string }
  | { type: "item.fired"; orderId: string; orderItemId: string }
  | { type: "item.completed"; orderId: string; orderItemId: string }
  | { type: "eightysix.add"; menuItemId: string; name: string; reason?: string }
  | { type: "eightysix.clear"; menuItemId: string };

export function emit(event: AppEvent): void {
  emitter.emit("event", event);
}

export function subscribe(handler: (event: AppEvent) => void): () => void {
  emitter.on("event", handler);
  return () => emitter.off("event", handler);
}
