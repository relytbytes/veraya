import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { computeDayForecast } from "@/lib/forecast-day";

// Vera Forecast — projects the upcoming service from same-weekday history,
// recency-weighted with a damped trend, then folds in tonight's reservations,
// events, holiday, and weather. The deterministic core lives in
// lib/forecast-day.ts (shared with the Vera health panel so the two agree); the
// AI writes the briefing here when a key is present.

function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fc = await computeDayForecast(new Date());
    const { projectedSales, projectedCovers, reservedCovers, eventCovers, sampleCount, confidence, prep, dowName, todayStr } = fc;

    const trendNote = fc.trendPct > 0.02 ? " trending up" : fc.trendPct < -0.02 ? " trending down" : "";
    const eventNote = eventCovers > 0 ? ` plus ${eventCovers} event guests (${fc.eventNames.join(", ")})` : "";
    const holidayNote = fc.holiday ? ` It's ${fc.holiday.name} (${fc.holiday.tendency}).` : "";
    const weatherNote = fc.weather && fc.weather.summary !== "mild" ? ` Weather: ${fc.weather.summary}, ${fc.weather.tempMaxF}°F.` : "";

    // Deterministic narrative (always valid).
    const deterministic = sampleCount === 0
      ? `Not enough ${dowName} history yet to project tonight. ${reservedCovers > 0 ? `${reservedCovers} covers are already booked.` : "No reservations booked yet."}`
      : `Based on the last ${sampleCount} ${dowName}${sampleCount > 1 ? "s" : ""}${trendNote}, Vera projects about ${fmt(projectedSales)} across ~${projectedCovers} covers tonight${reservedCovers > 0 ? `, with ${reservedCovers} already booked` : ""}${eventNote}.${holidayNote}${weatherNote}`;

    const payload = {
      projectedSales,
      projectedCovers,
      reservedCovers,
      eventCovers,
      baseSales: fc.baseSales,
      trendPct: Math.round(fc.trendPct * 100),
      sampleCount,
      dowName,
      confidence,
      prep,
      dayparts: fc.dayparts.map((d) => ({ name: d.name, projectedSales: d.projectedSales, share: Math.round(d.share * 100) })),
      holiday: fc.holiday ? { name: fc.holiday.name, tendency: fc.holiday.tendency } : null,
      weather: fc.weather ? { summary: fc.weather.summary, tempMaxF: fc.weather.tempMaxF, precipMm: fc.weather.precipMm } : null,
      adjustmentPct: Math.round((fc.adjustment - 1) * 100),
      sansAdjustment: Math.round(fc.baseSales),
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
        `  Organic projection: ${fmt(fc.baseSales)}; with signals: ${fmt(projectedSales)} / ${projectedCovers} covers (confidence: ${confidence}).`,
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
