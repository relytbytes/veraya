import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Optional OpenAI — gracefully falls back to structured summary if unavailable
let openai: import("openai").default | null = null;
try {
  const OpenAI = (await import("openai")).default;
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch { /* openai not installed */ }

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { date } = await req.json() as { date?: string };
  const targetDate = date ?? localISO(new Date());

  const dayStart = new Date(targetDate + "T00:00:00");
  const dayEnd   = new Date(targetDate + "T23:59:59");

  // ── Gather shift data in parallel ─────────────────────────────────────────
  const [orders, clockEntries, logEntries, reservations, voidItems, active86s] = await Promise.all([
    // Completed orders for the day
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: dayStart, lte: dayEnd } },
      select: {
        id: true,
        total: true,
        type: true,
        createdAt: true,
        items: {
          where: { voided: false },
          select: { quantity: true, unitPrice: true },
        },
      },
    }),

    // Staff clock entries
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: dayStart, lte: dayEnd } },
      include: { user: { select: { name: true, role: true } } },
    }),

    // Existing manager log entries for the day
    prisma.managerLogEntry.findMany({
      where: { createdAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { createdAt: "asc" },
      select: { type: true, body: true, createdAt: true, author: { select: { name: true } } },
    }),

    // Reservations for the day
    prisma.reservation.findMany({
      where: { date: targetDate },
      select: { partySize: true, status: true, time: true },
    }),

    // Void/comp audit items
    prisma.auditLog.findMany({
      where: {
        action: { in: ["VOID", "COMP"] },
        createdAt: { gte: dayStart, lte: dayEnd },
      },
      select: { action: true, reason: true },
    }),

    // Items currently 86'd
    prisma.eightySixItem.findMany({
      select: { menuItem: { select: { name: true } }, reason: true },
    }),
  ]);

  // ── Compute key metrics ────────────────────────────────────────────────────
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const orderCount = orders.length;
  const avgCheck = orderCount > 0 ? totalRevenue / orderCount : 0;

  // Labor
  const laborHours = clockEntries.reduce((s, c) => {
    const out = c.clockOut ?? new Date();
    const hrs = (out.getTime() - c.clockIn.getTime()) / 3600000;
    return s + Math.max(0, hrs);
  }, 0);
  const staffWorked = [...new Set(clockEntries.map(c => c.user.name))];
  // ClockEntry has no hourlyRate — use $15/hr default estimate
  const laborCostEst = clockEntries.reduce((s, c) => {
    const out = c.clockOut ?? new Date();
    const hrs = (out.getTime() - c.clockIn.getTime()) / 3600000;
    return s + Math.max(0, hrs) * 15;
  }, 0);

  // Reservations
  const confirmedRes = reservations.filter(r => r.status === "CONFIRMED" || r.status === "SEATED");
  const totalCovers = confirmedRes.reduce((s, r) => s + r.partySize, 0);

  // Voids / comps
  const voidCount = voidItems.filter(v => v.action === "VOID").length;
  const compCount = voidItems.filter(v => v.action === "COMP").length;

  // ── Build context block ────────────────────────────────────────────────────
  const contextLines: string[] = [
    `Date: ${targetDate} (${new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })})`,
    `Revenue: $${totalRevenue.toFixed(2)} from ${orderCount} completed orders (avg check: $${avgCheck.toFixed(2)})`,
    `Reservations: ${reservations.length} booked, ${confirmedRes.length} confirmed, ${totalCovers} total covers`,
    `Staff: ${staffWorked.length} team members worked — ${staffWorked.join(", ")}`,
    `Labor: ${laborHours.toFixed(1)} hours, estimated cost $${laborCostEst.toFixed(2)}`,
    laborCostEst > 0 && totalRevenue > 0
      ? `Labor %: ${((laborCostEst / totalRevenue) * 100).toFixed(1)}%`
      : "",
    voidCount > 0 ? `Voids: ${voidCount} item void${voidCount !== 1 ? "s" : ""}` : "",
    compCount > 0 ? `Comps: ${compCount} comp${compCount !== 1 ? "s" : ""}` : "",
    active86s.length > 0
      ? `Currently 86'd: ${active86s.map(e => e.menuItem.name + (e.reason ? ` (${e.reason})` : "")).join(", ")}`
      : "",
    logEntries.length > 0
      ? `Log entries today (${logEntries.length}):\n${logEntries.map(e =>
          `  [${e.type}] ${new Date(e.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} — ${e.body.slice(0, 150)}`
        ).join("\n")}`
      : "No prior log entries today",
  ].filter(Boolean);

  const contextBlock = contextLines.join("\n");

  // ── Generate AI narrative or build fallback ────────────────────────────────
  let narrative = "";
  let bullets: string[] = [];

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a restaurant operations AI writing a manager's end-of-shift log entry.
Write a brief, professional narrative (2-4 sentences) summarizing the shift, and 3-5 bullet points of key highlights or action items.
Respond only with valid JSON: { "narrative": string, "bullets": string[] }
Be specific with numbers. Highlight concerns (high voids/comps, low revenue, 86'd items, overtime).`,
          },
          {
            role: "user",
            content: `Here is today's shift data:\n\n${contextBlock}\n\nWrite the manager log summary.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { narrative?: string; bullets?: string[] };
      narrative = parsed.narrative ?? "";
      bullets = parsed.bullets ?? [];
    } catch { /* fall through to manual */ }
  }

  // Fallback: build structured summary without AI
  if (!narrative) {
    const laborPct = laborCostEst > 0 && totalRevenue > 0
      ? `${((laborCostEst / totalRevenue) * 100).toFixed(1)}%`
      : null;

    narrative = orderCount === 0
      ? `No completed orders recorded for ${targetDate}.`
      : `${new Date(targetDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })} shift: ${orderCount} orders totaling $${totalRevenue.toFixed(2)} (avg $${avgCheck.toFixed(2)}/check). ${staffWorked.length} staff worked ${laborHours.toFixed(1)} total hours.${laborPct ? ` Labor at ${laborPct}.` : ""}`;

    bullets = [
      `Revenue: $${totalRevenue.toFixed(2)} · ${orderCount} orders · avg $${avgCheck.toFixed(2)}`,
      totalCovers > 0 ? `${totalCovers} covers from ${confirmedRes.length} reservations` : null,
      `${staffWorked.length} staff · ${laborHours.toFixed(1)} hrs` + (laborPct ? ` · ${laborPct} labor` : ""),
      voidCount > 0 || compCount > 0 ? `${voidCount} void${voidCount !== 1 ? "s" : ""}${compCount > 0 ? `, ${compCount} comp${compCount !== 1 ? "s" : ""}` : ""}` : null,
      active86s.length > 0 ? `86'd: ${active86s.map(e => e.menuItem.name).join(", ")}` : null,
    ].filter(Boolean) as string[];
  }

  return Response.json({
    date: targetDate,
    narrative,
    bullets,
    metrics: {
      totalRevenue,
      orderCount,
      avgCheck,
      laborHours,
      laborCostEst,
      laborPct: totalRevenue > 0 ? (laborCostEst / totalRevenue) * 100 : null,
      staffCount: staffWorked.length,
      covers: totalCovers,
      reservationCount: reservations.length,
      voidCount,
      compCount,
      active86Count: active86s.length,
    },
    aiPowered: !!openai && narrative !== "",
  });
}
