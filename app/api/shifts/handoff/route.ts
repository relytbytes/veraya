import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/shifts/handoff
// Body: { hours?: number }  — look-back window in hours (default 8)
//
// Generates an end-of-shift handoff digest:
//   • Revenue & order summary for the window
//   • Staff clocked in right now + anyone who clocked out in the last hour
//   • 86'd items currently active
//   • Low-stock inventory items
//   • Upcoming reservations (next 3 hours)
//   • Open manager log entries from today
//   • AI narrative stitching it all together

export interface HandoffDigest {
  period: { from: string; to: string; hours: number };
  sales: {
    total: number;
    orderCount: number;
    avgCheck: number;
    topItems: { name: string; qty: number }[];
    voids: number;
  };
  labor: {
    clockedIn: { name: string; role: string; since: string }[];
    recentlyOut: { name: string; role: string; duration: string }[];
  };
  kitchen: {
    eightySixed: { item: string; reason: string | null }[];
  };
  inventory: {
    lowStock: { name: string; qty: number; unit: string; par: number }[];
  };
  reservations: {
    upcoming: { time: string; name: string; partySize: number; notes: string | null }[];
  };
  logEntries: {
    type: string;
    shift: string | null;
    title: string;
    severity: string | null;
    followUp: string | null;
  }[];
  watchFor: string[];   // priority items the incoming manager must know
  narrative: string;
  aiPowered: boolean;
}

export async function POST(req: NextRequest) {
  try {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });



  const body = await req.json().catch(() => ({})) as { hours?: number };
  const hours = Math.min(Math.max(Number(body.hours ?? 8), 1), 24);

  const now = new Date();
  const windowStart = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const todayStr = now.toISOString().slice(0, 10);

  // Upcoming reservations window: next 3 hours
  const resWindowEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const nowTimeStr = now.toTimeString().slice(0, 5);
  const resWindowEndStr = resWindowEnd.toTimeString().slice(0, 5);

  const [
    orders,
    clockEntries,
    eightySixed,
    inventoryItems,
    reservations,
    logEntries,
  ] = await Promise.all([
    // Orders completed in the window
    prisma.order.findMany({
      where: {
        status: "COMPLETED",
        createdAt: { gte: windowStart },
      },
      include: {
        items: {
          include: { menuItem: { select: { name: true } } },
        },
        payments: { select: { tip: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // All clock entries active during the window
    prisma.clockEntry.findMany({
      where: {
        OR: [
          { clockOut: null },                             // still clocked in
          { clockOut: { gte: windowStart } },             // clocked out within window
        ],
      },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { clockIn: "asc" },
    }),

    // Currently 86'd items
    prisma.eightySixItem.findMany({
      include: { menuItem: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),

    // Low-stock inventory — fetch all and filter in JS
    // (Prisma/libSQL doesn't support field-to-field comparisons in where)
    prisma.inventoryItem.findMany({
      include: { ingredient: { select: { name: true, unit: true } } },
    }).then(items => items.filter(i => Number(i.quantity) <= Number(i.minThreshold))),

    // Upcoming reservations today (same pattern as /api/vera)
    prisma.reservation.findMany({
      where: {
        date: todayStr,
        status: { in: ["CONFIRMED", "PENDING", "SEATED"] },
      },
      orderBy: { time: "asc" },
      take: 20,
    }).then(rows => rows.filter(r => r.time >= nowTimeStr && r.time <= resWindowEndStr)),

    // Open manager log entries from today
    prisma.managerLogEntry.findMany({
      where: {
        createdAt: { gte: new Date(todayStr + "T00:00:00") },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // ── Build structured data ──────────────────────────────────────────────────

  // Sales
  const salesTotal = orders.reduce((s, o) => s + Number(o.total), 0);
  const orderCount = orders.length;
  const avgCheck = orderCount > 0 ? salesTotal / orderCount : 0;

  // Top items by qty sold
  const itemQtyMap = new Map<string, number>();
  for (const order of orders) {
    for (const oi of order.items) {
      const name = oi.menuItem?.name ?? "Unknown";
      itemQtyMap.set(name, (itemQtyMap.get(name) ?? 0) + oi.quantity);
    }
  }
  const topItems = [...itemQtyMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  // Voids: orders created but discountAmount > 0 as a proxy, or just count
  const voidCount = orders.filter(o => Number(o.discountAmount) > 0).length;

  // Labor: split clocked-in vs recently clocked out
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const clockedIn = clockEntries
    .filter(c => c.clockOut === null)
    .map(c => ({
      name: c.user.name,
      role: c.user.role,
      since: formatTime(c.clockIn),
    }));
  const recentlyOut = clockEntries
    .filter(c => c.clockOut !== null && c.clockOut >= oneHourAgo)
    .map(c => ({
      name: c.user.name,
      role: c.user.role,
      duration: formatDuration(c.clockIn, c.clockOut!),
    }));

  // 86'd
  const eightySixedList = eightySixed.map(e => ({
    item: e.menuItem.name,
    reason: e.reason,
  }));

  // Low stock
  const lowStock = inventoryItems.map(i => ({
    name: i.ingredient.name,
    qty: Number(i.quantity),
    unit: i.ingredient.unit,
    par: Number(i.minThreshold),
  }));

  // Reservations
  const upcomingRes = reservations.map(r => ({
    time: r.time,
    name: r.name,
    partySize: r.partySize,
    notes: r.notes ?? null,
  }));

  // Log entries
  const logs = logEntries.map(l => ({
    type: l.type,
    shift: l.shift,
    title: l.title,
    severity: l.severity,
    followUp: l.followUp,
  }));

  // ── Watch-For list ─────────────────────────────────────────────────────────
  // Surfaces the highest-priority items the incoming manager needs to act on.
  const watchFor: string[] = [];

  // HIGH severity log entries with follow-ups
  for (const l of logs) {
    if (l.severity === "HIGH") {
      const note = l.followUp ? `${l.title} — ${l.followUp}` : l.title;
      watchFor.push(`🔴 ${note}`);
    }
  }

  // Reservations with special notes (allergies, VIPs, etc.)
  for (const r of upcomingRes) {
    if (r.notes && r.notes.trim()) {
      watchFor.push(`📋 ${r.time} reservation for ${r.name} (${r.partySize}): ${r.notes.trim()}`);
    }
  }

  // Critical stock — below 50% of par
  for (const i of lowStock) {
    if (i.par > 0 && i.qty / i.par < 0.5) {
      watchFor.push(`⚠️ ${i.name} critically low: ${i.qty}/${i.par} ${i.unit}`);
    }
  }

  // All 86'd items (if any)
  if (eightySixedList.length > 0) {
    watchFor.push(`🚫 Still 86'd: ${eightySixedList.map(e => e.item).join(", ")}`);
  }

  // ── Build narrative ────────────────────────────────────────────────────────

  function deterministicNarrative(): string {
    const lines: string[] = [];
    lines.push(`Shift summary for the last ${hours} hour${hours === 1 ? "" : "s"}:`);
    lines.push(`Revenue: $${salesTotal.toFixed(2)} across ${orderCount} orders (avg $${avgCheck.toFixed(2)}).`);
    if (eightySixedList.length > 0) {
      lines.push(`Still 86'd: ${eightySixedList.map(e => e.item).join(", ")}.`);
    }
    if (lowStock.length > 0) {
      lines.push(`Low stock: ${lowStock.map(i => `${i.name} (${i.qty}/${i.par} ${i.unit})`).join(", ")}.`);
    }
    if (clockedIn.length > 0) {
      lines.push(`Currently on floor: ${clockedIn.map(c => c.name).join(", ")}.`);
    }
    if (upcomingRes.length > 0) {
      lines.push(`Upcoming reservations: ${upcomingRes.map(r => `${r.time} – ${r.name} (${r.partySize})`).join("; ")}.`);
    }
    return lines.join(" ");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  let narrative = deterministicNarrative();
  let aiPowered = false;

  if (apiKey) {
    const { default: OpenAI } = await import("openai");
    const contextLines: string[] = [
      `SHIFT WINDOW: Last ${hours} hours (${formatTime(windowStart)} → ${formatTime(now)})`,
      ``,
      `SALES`,
      `  Revenue: $${salesTotal.toFixed(2)} | Orders: ${orderCount} | Avg check: $${avgCheck.toFixed(2)}`,
      `  Top sellers: ${topItems.map(i => `${i.name} ×${i.qty}`).join(", ") || "none"}`,
      `  Discounted/voided orders: ${voidCount}`,
      ``,
      `STAFF ON FLOOR RIGHT NOW`,
      clockedIn.length > 0
        ? clockedIn.map(c => `  • ${c.name} (${c.role}) — clocked in ${c.since}`).join("\n")
        : "  None currently clocked in",
      ``,
      `RECENTLY CLOCKED OUT (last 60 min)`,
      recentlyOut.length > 0
        ? recentlyOut.map(c => `  • ${c.name} (${c.role}) — worked ${c.duration}`).join("\n")
        : "  None",
      ``,
      `86'd ITEMS`,
      eightySixedList.length > 0
        ? eightySixedList.map(e => `  • ${e.item}${e.reason ? ` — ${e.reason}` : ""}`).join("\n")
        : "  None",
      ``,
      `LOW STOCK`,
      lowStock.length > 0
        ? lowStock.map(i => `  • ${i.name}: ${i.qty} ${i.unit} (par ${i.par})`).join("\n")
        : "  None below par",
      ``,
      `UPCOMING RESERVATIONS (next 3 hrs)`,
      upcomingRes.length > 0
        ? upcomingRes.map(r => `  • ${r.time} — ${r.name}, party of ${r.partySize}${r.notes ? ` (${r.notes})` : ""}`).join("\n")
        : "  None",
      ``,
      `MANAGER LOG (today)`,
      logs.length > 0
        ? logs.map(l => `  • [${l.type}${l.severity ? ` / ${l.severity}` : ""}] ${l.title}${l.followUp ? ` — follow-up: ${l.followUp}` : ""}`).join("\n")
        : "  No entries today",
      ``,
      `PRIORITY WATCH-FOR ITEMS`,
      watchFor.length > 0
        ? watchFor.map(w => `  ${w}`).join("\n")
        : "  None flagged",
    ];

    try {
      const openai = new OpenAI({ apiKey });
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are a restaurant manager writing a shift handoff note for the incoming manager.
Write a concise, professional 3–5 sentence summary covering: how the shift went (revenue/pace), any HIGH-severity issues or urgent follow-ups first, then 86'd items or low stock, and what to watch for in upcoming reservations.
Write in first person ("We did...", "Watch out for..."). Be direct — no filler. If there are HIGH severity log entries or reservation notes, lead with those. Do NOT repeat every data point verbatim; synthesise into a readable narrative.`,
          },
          {
            role: "user",
            content: contextLines.join("\n"),
          },
        ],
      });

      const text = completion.choices[0]?.message?.content?.trim();
      if (text) {
        narrative = text;
        aiPowered = true;
      }
    } catch (err) {
      console.error("[/api/shifts/handoff]", (err as Error)?.message ?? err);
      // fall through to deterministic narrative
    }
  }

  const digest: HandoffDigest = {
    period: {
      from: windowStart.toISOString(),
      to: now.toISOString(),
      hours,
    },
    sales: { total: salesTotal, orderCount, avgCheck, topItems, voids: voidCount },
    labor: { clockedIn, recentlyOut },
    kitchen: { eightySixed: eightySixedList },
    inventory: { lowStock },
    reservations: { upcoming: upcomingRes },
    logEntries: logs,
    watchFor,
    narrative,
    aiPowered,
  };

  return Response.json(digest);

  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[/api/shifts/handoff]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDuration(start: Date, end: Date): string {
  const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
