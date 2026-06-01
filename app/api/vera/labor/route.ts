import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// Vera Labor Plan — projects an upcoming day's demand by daypart from day-of-week
// history, recommends labor-hours at a target sales-per-labor-hour (SPLH), and
// compares against what's actually scheduled. Deterministic core; AI phrases.

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
}
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}
function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

const DAYPARTS = [
  { name: "Lunch", start: 11, end: 16 },
  { name: "Dinner", start: 16, end: 23 },
];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");
    const now = new Date();
    const target = dateParam ? new Date(dateParam + "T12:00:00") : new Date(now.getTime() + 86400_000);
    const targetStr = localISO(target);
    const targetDow = target.getDay();
    const dayName = target.toLocaleDateString("en-US", { weekday: "long" });

    const splhSetting = await prisma.restaurantSettings.findUnique({ where: { key: "targetSplh" } }).catch(() => null);
    const splh = splhSetting ? Number(splhSetting.value) : 55; // sales per labor-hour target

    const since = new Date(now.getTime() - 56 * 86400_000);
    const [history, shifts] = await Promise.all([
      prisma.order.findMany({
        where: { status: "COMPLETED", createdAt: { gte: since, lt: new Date(localISO(now) + "T00:00:00") } },
        select: { total: true, createdAt: true },
      }),
      prisma.shift.findMany({
        where: { date: targetStr },
        include: { user: { select: { role: true } } },
      }),
    ]);

    // Same-weekday history → avg sales per daypart.
    const dayKeys = new Set<string>();
    const partSales: Record<string, number> = { Lunch: 0, Dinner: 0 };
    for (const o of history) {
      const d = new Date(o.createdAt);
      if (d.getDay() !== targetDow) continue;
      dayKeys.add(localISO(d));
      const hr = d.getHours() + d.getMinutes() / 60;
      for (const p of DAYPARTS) {
        if (hr >= p.start && hr < p.end) partSales[p.name] += Number(o.total);
      }
    }
    const sampleCount = dayKeys.size;

    // Scheduled labor-hours per daypart.
    const schedHours: Record<string, number> = { Lunch: 0, Dinner: 0 };
    for (const s of shifts) {
      const st = parseHHMM(s.startTime), en = parseHHMM(s.endTime);
      for (const p of DAYPARTS) schedHours[p.name] += overlap(st, en, p.start, p.end);
    }

    const dayparts = DAYPARTS.map((p) => {
      const projectedSales = sampleCount ? partSales[p.name] / sampleCount : 0;
      const recommendedHours = splh > 0 ? projectedSales / splh : 0;
      const scheduled = schedHours[p.name];
      let status: "ok" | "over" | "under" | "unknown" = "unknown";
      if (sampleCount > 0 && (scheduled > 0 || recommendedHours > 0)) {
        if (recommendedHours <= 0) status = scheduled > 1 ? "over" : "ok";
        else if (scheduled < recommendedHours * 0.8) status = "under";
        else if (scheduled > recommendedHours * 1.2) status = "over";
        else status = "ok";
      }
      return {
        name: p.name,
        projectedSales: Math.round(projectedSales),
        recommendedHours: Math.round(recommendedHours * 10) / 10,
        scheduledHours: Math.round(scheduled * 10) / 10,
        status,
      };
    });

    const totalRecommended = dayparts.reduce((s, d) => s + d.recommendedHours, 0);
    const totalScheduled = dayparts.reduce((s, d) => s + d.scheduledHours, 0);

    // Deterministic narrative
    const projTotal = dayparts.reduce((s, d) => s + d.projectedSales, 0);
    let narrative = sampleCount === 0
      ? `Not enough ${dayName} history to plan labor yet.`
      : `For ${dayName} Vera projects ${fmt(projTotal)} and recommends about ${totalRecommended.toFixed(1)} labor-hours at ${fmt(splh)}/hour.` +
        (totalScheduled > 0
          ? ` You have ${totalScheduled.toFixed(1)} scheduled${totalScheduled > totalRecommended * 1.2 ? `, over by ${(totalScheduled - totalRecommended).toFixed(1)}` : totalScheduled < totalRecommended * 0.8 ? `, short by ${(totalRecommended - totalScheduled).toFixed(1)}` : ", about right"}.`
          : " No shifts scheduled yet.");
    let aiPowered = false;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && sampleCount > 0) {
      try {
        const ctx = [
          `Target: ${dayName} ${targetStr}. SPLH target ${fmt(splh)}.`,
          ...dayparts.map((d) => `${d.name}: projected ${fmt(d.projectedSales)}, recommend ${d.recommendedHours}h, scheduled ${d.scheduledHours}h (${d.status}).`),
        ].join("\n");
        const client = new OpenAI({ apiKey });
        const c = await client.chat.completions.create({
          model: "gpt-4o-mini", temperature: 0.3, max_tokens: 160,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `You are Vera, restaurant labor intelligence. Give the manager a concise staffing call for the day. Use the numbers, name the daypart that is over or understaffed, and what to do. Warm, direct, like a sharp GM. No hype, no em-dashes, no Oxford commas. Two sentences max. Respond ONLY as JSON: { "narrative": "<two sentences>" }` },
            { role: "user", content: ctx },
          ],
        });
        const parsed = JSON.parse(c.choices[0]?.message?.content ?? "{}") as { narrative?: string };
        if (parsed.narrative) { narrative = parsed.narrative; aiPowered = true; }
      } catch (err) {
        console.error("[/api/vera/labor] OpenAI failed:", (err as Error)?.message ?? err);
      }
    }

    return Response.json(
      { date: targetStr, dayName, sampleCount, splh, dayparts, totalRecommended: Math.round(totalRecommended * 10) / 10, totalScheduled: Math.round(totalScheduled * 10) / 10, narrative, aiPowered },
      { headers: { "Cache-Control": "private, max-age=900, stale-while-revalidate=120" } },
    );
  } catch (err) {
    console.error("[/api/vera/labor]", (err as Error)?.message ?? err);
    return Response.json({ error: "labor_unavailable" }, { status: 503 });
  }
}
