import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// Vera Forecast — looks at the same weekday over recent history (blended with
// tonight's confirmed reservations) to project the upcoming service and
// recommend what to prep. Deterministic core; AI writes the briefing when a key
// is present, with a deterministic fallback so it always returns something.

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

interface PrepItem { name: string; suggestedQty: number; basis: string }

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
    const todayDow = now.getDay();
    const dowName = now.toLocaleDateString("en-US", { weekday: "long" });
    const since = new Date(now.getTime() - 63 * 24 * 60 * 60 * 1000); // ~9 weeks

    const [history, tonightRes] = await Promise.all([
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
    ]);

    // Group history by local date, keeping only the same weekday as today.
    const byDay = new Map<string, { sales: number; orders: number; items: Map<string, number> }>();
    for (const o of history) {
      const d = new Date(o.createdAt);
      if (d.getDay() !== todayDow) continue;
      const key = localDateStr(d);
      const day = byDay.get(key) ?? { sales: 0, orders: 0, items: new Map() };
      day.sales += Number(o.total);
      day.orders += 1;
      for (const it of o.items) {
        day.items.set(it.menuItem.name, (day.items.get(it.menuItem.name) ?? 0) + it.quantity);
      }
      byDay.set(key, day);
    }

    // Most recent up-to-6 same-weekday samples.
    const sampleDays = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
    const sampleCount = sampleDays.length;

    const avgSales  = sampleCount ? sampleDays.reduce((s, [, d]) => s + d.sales, 0) / sampleCount : 0;
    const avgOrders = sampleCount ? sampleDays.reduce((s, [, d]) => s + d.orders, 0) / sampleCount : 0;

    // Average per-service quantity for each item across the samples → prep basis.
    const itemTotals = new Map<string, number>();
    for (const [, d] of sampleDays) {
      for (const [name, qty] of d.items) itemTotals.set(name, (itemTotals.get(name) ?? 0) + qty);
    }
    const prep: PrepItem[] = [...itemTotals.entries()]
      .map(([name, total]) => ({ name, avg: sampleCount ? total / sampleCount : 0 }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 6)
      .map((x) => ({
        name: x.name,
        suggestedQty: Math.max(1, Math.ceil(x.avg)),
        basis: `avg ${x.avg.toFixed(1)}/${dowName}`,
      }));

    const reservedCovers = tonightRes.reduce((s, r) => s + r.partySize, 0);
    // Projected covers: lean on history, nudge up if bookings already exceed the average.
    const projectedCovers = Math.max(Math.round(avgOrders), reservedCovers);
    const projectedSales = Math.round(avgSales);
    const confidence = sampleCount >= 4 ? "high" : sampleCount >= 2 ? "medium" : "low";

    // Deterministic narrative (always valid).
    const deterministic = sampleCount === 0
      ? `Not enough ${dowName} history yet to project tonight. ${reservedCovers > 0 ? `${reservedCovers} covers are already booked.` : "No reservations booked yet."}`
      : `Based on the last ${sampleCount} ${dowName}${sampleCount > 1 ? "s" : ""}, Vera projects about ${fmt(projectedSales)} across ${Math.round(avgOrders)} tickets tonight${reservedCovers > 0 ? `, with ${reservedCovers} covers already booked` : ""}.`;

    const payload = {
      projectedSales,
      projectedCovers,
      reservedCovers,
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
        `Same-weekday history (${sampleCount} recent ${dowName}s):`,
        `  Average sales: ${fmt(avgSales)}; average tickets: ${avgOrders.toFixed(0)}`,
        `  Covers booked so far tonight: ${reservedCovers}`,
        `Projected: ${fmt(projectedSales)} / ${projectedCovers} covers (confidence: ${confidence}).`,
        `Top items on ${dowName}s (avg qty per service):`,
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
