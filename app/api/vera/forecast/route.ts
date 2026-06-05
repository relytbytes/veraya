import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { groupSameDowSamples, forecastFromSamples, type OrderLite } from "@/lib/forecast";

// Vera Forecast — projects the upcoming service from same-weekday history,
// recency-weighted with a damped trend, then folds in tonight's confirmed
// reservations and booked events. Deterministic core (lib/forecast.ts, shared
// with the backtest harness); AI writes the briefing when a key is present.

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const now = new Date();
    const todayStr = localDateStr(now);
    const dowName = now.toLocaleDateString("en-US", { weekday: "long" });
    const since = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000); // 12 weeks for trend + recency

    const [history, tonightRes, todayEvents] = await Promise.all([
      prisma.order.findMany({
        where: { status: "COMPLETED", createdAt: { gte: since, lt: new Date(todayStr + "T00:00:00") } },
        select: {
          total: true,
          createdAt: true,
          items: { where: { voided: false }, select: { quantity: true, menuItem: { select: { name: true } } } },
        },
      }),
      prisma.reservation.findMany({
        where: { date: todayStr, status: { in: ["CONFIRMED", "PENDING", "SEATED"] } },
        select: { partySize: true },
      }),
      prisma.event.findMany({
        where: { date: todayStr, status: { in: ["CONFIRMED", "COMPLETED"] } },
        select: { guestCount: true, name: true },
      }),
    ]);

    const orders: OrderLite[] = history.map((o) => ({
      total: Number(o.total),
      createdAt: new Date(o.createdAt),
      items: o.items.map((it) => ({ quantity: it.quantity, name: it.menuItem.name })),
    }));

    // Average check across the loaded window (covers ↔ sales conversion).
    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const avgCheck = orders.length ? totalSales / orders.length : 0;

    const reservedCovers = tonightRes.reduce((s, r) => s + r.partySize, 0);
    const eventCovers = todayEvents.reduce((s, e) => s + (e.guestCount ?? 0), 0);

    const samples = groupSameDowSamples(orders, now);
    const f = forecastFromSamples(samples, { reservedCovers, eventCovers, avgCheck });

    const sampleCount = f.sampleCount;
    const projectedSales = f.projectedSales;
    const projectedCovers = f.projectedCovers;
    const confidence = f.confidence;
    const prep = f.prep;
    const trendNote = f.trendPct > 0.02 ? " trending up" : f.trendPct < -0.02 ? " trending down" : "";
    const eventNote = eventCovers > 0 ? ` plus ${eventCovers} event guests (${todayEvents.map((e) => e.name).join(", ")})` : "";

    // Deterministic narrative (always valid).
    const deterministic = sampleCount === 0
      ? `Not enough ${dowName} history yet to project tonight. ${reservedCovers > 0 ? `${reservedCovers} covers are already booked.` : "No reservations booked yet."}`
      : `Based on the last ${sampleCount} ${dowName}${sampleCount > 1 ? "s" : ""}${trendNote}, Vera projects about ${fmt(projectedSales)} across ~${projectedCovers} covers tonight${reservedCovers > 0 ? `, with ${reservedCovers} already booked` : ""}${eventNote}.`;

    const payload = {
      projectedSales,
      projectedCovers,
      reservedCovers,
      eventCovers,
      baseSales: f.baseSales,
      trendPct: Math.round(f.trendPct * 100),
      sampleCount,
      dowName,
      confidence,
      prep,
      narrative: deterministic,
      aiPowered: false,
    };

    const cacheHeaders = { headers: { "Cache-Control": "private, max-age=900, stale-while-revalidate=120" } };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || sampleCount === 0) return Response.json(payload, cacheHeaders);

    // AI writes the briefing from the computed numbers (no invented data).
    try {
      const context = [
        `Today is ${dowName}, ${todayStr}.`,
        `Same-weekday history (${sampleCount} recent ${dowName}s, recency-weighted${trendNote || ""}):`,
        `  Organic projection: ${fmt(f.baseSales)}; with signals: ${fmt(projectedSales)} / ${projectedCovers} covers (confidence: ${confidence}).`,
        `  Covers booked so far tonight: ${reservedCovers}${eventCovers > 0 ? `; booked event guests: ${eventCovers}` : ""}.`,
        `Top items to prep (recency-weighted avg qty):`,
        ...prep.map((p) => `  - ${p.name}: ${p.basis}`),
      ].join("\n");

      const client = new OpenAI({ apiKey });
      const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 220,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are Vera, the intelligence inside a restaurant platform. Write a forward-looking prep briefing for tonight's service.
Voice: warm, direct, like a sharp GM. Lead with the projection, then what to prep. Use the actual numbers. No hype, no em-dashes, no Oxford commas. Two sentences max.
Respond ONLY as JSON: { "narrative": "<two sentences>" }`,
          },
          { role: "user", content: context },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { narrative?: string };
      if (parsed.narrative) {
        return Response.json({ ...payload, narrative: parsed.narrative, aiPowered: true }, cacheHeaders);
      }
    } catch (err) {
      console.error("[/api/vera/forecast] OpenAI failed:", (err as Error)?.message ?? err);
    }
    return Response.json(payload, cacheHeaders);
  } catch (err) {
    console.error("[/api/vera/forecast] data load failed:", (err as Error)?.message ?? err);
    return Response.json({ error: "forecast_unavailable" }, { status: 503 });
  }
}
