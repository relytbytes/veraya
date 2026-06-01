import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// GET/POST /api/cron/weekly-digest
//
// Generates Vera's week-in-review and posts it to the manager log so it shows up
// in-app every Monday. Auth: CRON_SECRET (?secret= or Bearer) OR a logged-in
// session (for manual runs). Idempotent — one digest per calendar day.

function fmt(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }
function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function handle(req: NextRequest) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const provided = url.searchParams.get("secret")
    ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authorized = (secret && provided === secret) || !!(await auth());
  if (!authorized) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 86400_000);
    const priorStart = new Date(now.getTime() - 14 * 86400_000);
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    // Idempotency — don't double-post on the same day.
    const existing = await prisma.managerLogEntry.findFirst({
      where: { title: { startsWith: "Vera Weekly Digest" }, createdAt: { gte: todayStart } },
      select: { id: true },
    });
    if (existing && !url.searchParams.get("force")) {
      return Response.json({ skipped: true, reason: "already posted today", entryId: existing.id });
    }

    const author = await prisma.user.findFirst({
      where: { role: { in: ["ADMIN", "MANAGER"] } },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!author) return Response.json({ error: "No admin/manager to author the digest" }, { status: 400 });

    const [orders, priorOrders, clockEntries, voidComp] = await Promise.all([
      prisma.order.findMany({
        where: { status: "COMPLETED", createdAt: { gte: weekStart, lte: now } },
        select: { total: true, createdAt: true, items: { where: { voided: false }, select: { quantity: true, menuItem: { select: { name: true } } } } },
      }),
      prisma.order.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: priorStart, lt: weekStart } },
        _sum: { total: true }, _count: true,
      }),
      prisma.clockEntry.findMany({
        where: { clockIn: { gte: weekStart, lte: now } },
        select: { clockIn: true, clockOut: true, user: { select: { hourlyRate: true } } },
      }),
      prisma.auditLog.findMany({
        where: { action: { in: ["VOID", "COMP"] }, createdAt: { gte: weekStart, lte: now } },
        select: { action: true, amount: true },
      }),
    ]);

    const revenue = orders.reduce((s, o) => s + Number(o.total), 0);
    const orderCount = orders.length;
    const avgCheck = orderCount ? revenue / orderCount : 0;
    const priorRevenue = Number(priorOrders._sum.total ?? 0);
    const revenueDelta = priorRevenue > 0 ? ((revenue - priorRevenue) / priorRevenue) * 100 : null;

    const laborCost = clockEntries.reduce((s, c) => {
      const hrs = ((c.clockOut ?? now).getTime() - c.clockIn.getTime()) / 3600000;
      return s + Math.max(0, hrs) * Number(c.user.hourlyRate ?? 0);
    }, 0);
    const laborPct = revenue > 0 ? (laborCost / revenue) * 100 : null;

    const itemQty = new Map<string, number>();
    const dayRev = new Map<string, number>();
    for (const o of orders) {
      const d = localISO(new Date(o.createdAt));
      dayRev.set(d, (dayRev.get(d) ?? 0) + Number(o.total));
      for (const it of o.items) itemQty.set(it.menuItem.name, (itemQty.get(it.menuItem.name) ?? 0) + it.quantity);
    }
    const topItems = [...itemQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const days = [...dayRev.entries()].sort((a, b) => b[1] - a[1]);
    const bestDay = days[0];
    const voidTotal = voidComp.filter(l => l.action === "VOID").reduce((s, l) => s + Number(l.amount ?? 0), 0);
    const compTotal = voidComp.filter(l => l.action === "COMP").reduce((s, l) => s + Number(l.amount ?? 0), 0);

    const range = `${localISO(weekStart)} to ${localISO(now)}`;

    const context = [
      `Week: ${range}`,
      `Revenue: ${fmt(revenue)} across ${orderCount} orders (avg check ${fmt(avgCheck)})`,
      revenueDelta !== null ? `vs prior week ${fmt(priorRevenue)} (${revenueDelta >= 0 ? "+" : ""}${revenueDelta.toFixed(1)}%)` : "no prior-week baseline",
      laborPct !== null ? `Labor: ${fmt(laborCost)} (${laborPct.toFixed(1)}% of revenue)` : `Labor: ${fmt(laborCost)}`,
      bestDay ? `Best day: ${bestDay[0]} (${fmt(bestDay[1])})` : "",
      `Top items: ${topItems.map(([n, q]) => `${n} (${q})`).join(", ") || "n/a"}`,
      `Voids ${fmt(voidTotal)}, comps ${fmt(compTotal)}`,
    ].filter(Boolean).join("\n");

    // Deterministic fallback
    let narrative = revenueDelta !== null
      ? `This week brought in ${fmt(revenue)} across ${orderCount} orders, ${revenueDelta >= 0 ? "up" : "down"} ${Math.abs(revenueDelta).toFixed(0)}% from the prior week.`
      : `This week brought in ${fmt(revenue)} across ${orderCount} orders.`;
    let bullets: string[] = [
      bestDay ? `Best day was ${bestDay[0]} at ${fmt(bestDay[1])}.` : "",
      topItems.length ? `Top seller: ${topItems[0][0]} (${topItems[0][1]} sold).` : "",
      laborPct !== null ? `Labor ran ${laborPct.toFixed(1)}% of revenue.` : "",
      voidTotal + compTotal > 0 ? `Voids and comps totaled ${fmt(voidTotal + compTotal)}.` : "",
    ].filter(Boolean);
    let aiPowered = false;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 320,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are Vera, the intelligence inside a restaurant platform, writing the Monday week-in-review for the manager.
Voice: warm, direct, like a sharp GM. Use the real numbers. Lead with the headline, then call out wins and concerns. No hype, no em-dashes, no Oxford commas.
Respond ONLY as JSON: { "narrative": "<2-3 sentences>", "bullets": ["<3 to 5 short bullets, each a specific takeaway>"] }`,
            },
            { role: "user", content: context },
          ],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { narrative?: string; bullets?: string[] };
        if (parsed.narrative) { narrative = parsed.narrative; aiPowered = true; }
        if (parsed.bullets?.length) bullets = parsed.bullets;
      } catch (err) {
        console.error("[weekly-digest] OpenAI failed:", (err as Error)?.message ?? err);
      }
    }

    const body = `${narrative}\n\n${bullets.map(b => `• ${b}`).join("\n")}`;
    const entry = await prisma.managerLogEntry.create({
      data: {
        type: "SHIFT_NOTE",
        title: `Vera Weekly Digest — ${range}`,
        body,
        authorId: author.id,
      },
      select: { id: true },
    });

    return Response.json({ ok: true, entryId: entry.id, aiPowered, revenue, orderCount });
  } catch (err) {
    console.error("[weekly-digest]", (err as Error)?.message ?? err);
    return Response.json({ error: "digest_failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
