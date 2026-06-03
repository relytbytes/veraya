import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { subscribe, type RealtimeEvent } from "@/lib/realtime";
import { subscribe as subscribeAppEvents, type AppEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel kills a function at its plan's hard cap (300s on Pro) and logs a
// "Runtime Timeout Error". An SSE stream is meant to stay open, so instead of
// riding into that cap we close the stream ourselves comfortably before it and
// let the client's EventSource reconnect — a clean rollover, no error logged.
export const maxDuration = 300;
const STREAM_TTL_MS = 240_000; // recycle the connection every 4 min (< 300s cap)

// GET /api/realtime — Server-Sent Events stream of live floor/kitchen changes.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { /* stream closed */ }
      };

      // Initial comment so the client's onopen fires promptly, plus a short
      // reconnect hint so the browser/RN EventSource comes back fast after we
      // recycle the stream.
      safeEnqueue("retry: 2000\n: connected\n\n");

      const send = (event: RealtimeEvent) => safeEnqueue(`event: change\ndata: ${JSON.stringify(event)}\n\n`);

      // Floor events (reservations, tables, waitlist) published via lib/realtime.
      const unsubscribe = subscribe(send);

      // Order / kitchen / 86 events already flow through the existing lib/events
      // emitter — bridge them in as kitchen-scoped realtime events.
      const unsubscribeApp = subscribeAppEvents((e: AppEvent) => {
        const ids = "orderId" in e ? [e.orderId] : "menuItemId" in e ? [e.menuItemId] : [];
        send({ scope: "kitchen", type: e.type, ids, at: Date.now() });
      });

      // Heartbeat keeps proxies from killing an idle connection.
      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(ttl);
        unsubscribe();
        unsubscribeApp();
        try { controller.close(); } catch { /* already closed */ }
      };

      // Recycle the connection before Vercel's function cap so the platform
      // never has to time it out. The client reconnects automatically.
      const ttl = setTimeout(cleanup, STREAM_TTL_MS);

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
