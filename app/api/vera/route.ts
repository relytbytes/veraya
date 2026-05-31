import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayWindow(d: Date) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Current-hour window: midnight → now (used for same-hour pacing)
function toNowWindow(d: Date) {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  return { start, end: new Date(d) };
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }

// Compute health score from the resolved alerts — guarantees score and alerts are always consistent.
// HIGH = -15, MEDIUM = -8, LOW = -2
function computeHealthScore(alerts: { severity: string }[]): number {
  let score = 100;
  for (const alert of alerts) {
    if (alert.severity === "HIGH")        score -= 15;
    else if (alert.severity === "MEDIUM") score -= 8;
    else if (alert.severity === "LOW")    score -= 2;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
  const now = new Date();
  const todayStr = localDateStr(now);
  const { start: todayStart, end: todayEnd } = dayWindow(now);
  const { start: toNowStart } = toNowWindow(now);

  // Reference windows for pacing: yesterday and same-DOW last week
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek  = new Date(now); lastWeek.setDate(lastWeek.getDate() - 7);
  const { start: yestStart } = toNowWindow(yesterday);
  const { start: lwStart   } = toNowWindow(lastWeek);
  const { end:   yestHourEnd } = toNowWindow(yesterday);
  const { end:   lwHourEnd   } = toNowWindow(lastWeek);
  // Fix: make "yesterday at same hour" window correct
  yestHourEnd.setDate(yestHourEnd.getDate());
  lwHourEnd.setDate(lwHourEnd.getDate());

  const [
    // Today's completed sales (to now)
    todaySales,
    // Yesterday same-hour sales
    yestSales,
    // Last-week same-DOW same-hour sales
    lwSales,
    // Tonight's reservations
    tonightReservations,
    // Current clock-ins (still active: clockOut is null)
    activeClock,
    // Tonight's scheduled shifts
    tonightShifts,
    // 86 board
    eightySix,
    // Inventory items
    inventoryItems,
    // Today's audit log (voids + comps)
    todayAuditLog,
    // Open orders right now
    openOrders,
    // Recent price changes: last 60 days PO items with ingredient
    recentPOs,
    // Top-selling items by order count last 14 days (for 86-risk context)
    recentOrderItems,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: todayStart, lte: now } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: yestStart, lte: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), now.getHours(), now.getMinutes()) } },
      _sum: { total: true },
    }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", createdAt: { gte: lwStart, lte: new Date(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate(), now.getHours(), now.getMinutes()) } },
      _sum: { total: true },
    }),
    prisma.reservation.findMany({
      where: { date: todayStr, status: { in: ["CONFIRMED", "PENDING", "SEATED"] } },
      include: { table: { select: { number: true } } },
      orderBy: { time: "asc" },
    }),
    prisma.clockEntry.findMany({
      where: { clockOut: null },
      include: { user: { select: { name: true, role: true, hourlyRate: true } } },
    }),
    prisma.shift.findMany({
      where: { date: todayStr },
      include: { user: { select: { name: true, role: true, hourlyRate: true } } },
    }),
    prisma.eightySixItem.findMany({
      include: { menuItem: { select: { name: true, price: true } } },
    }),
    // Capped at 200 rows to prevent full-scan lock on SQLite
    prisma.inventoryItem.findMany({
      include: { ingredient: { select: { name: true, unit: true } } },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: todayStart, lte: todayEnd } },
      include: { user: { select: { name: true } } },
    }),
    prisma.order.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS", "READY"] } },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: "RECEIVED", receivedAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
      include: { items: { include: { ingredient: { select: { id: true, name: true, unit: true } } } }, vendor: { select: { name: true } } },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { voided: false, order: { createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, status: "COMPLETED" } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 20,
    }),
  ]);

  // ── Compute signals ──────────────────────────────────────────────────────────

  const salesToday = Number(todaySales._sum?.total ?? 0);
  const salesYest  = Number(yestSales._sum?.total ?? 0);
  const salesLW    = Number(lwSales._sum?.total ?? 0);

  // Use the better of yesterday or last-week as reference (max is the "normal" baseline)
  const refSales = Math.max(salesYest, salesLW);
  const pacingRatio: number | null = refSales > 10 ? salesToday / refSales : null;

  // Low stock
  const lowStock = inventoryItems.filter(i => Number(i.quantity) <= Number(i.minThreshold) && Number(i.quantity) > 0);
  const outOfStock = inventoryItems.filter(i => Number(i.quantity) <= 0);

  // 86 items
  const active86 = eightySix;

  // Voids & comps
  const voids = todayAuditLog.filter(l => l.action === "VOID");
  const comps  = todayAuditLog.filter(l => l.action === "COMP");
  const voidTotal = voids.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);
  const compTotal  = comps.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);

  // Labor projection
  // For each clocked-in staff, calculate hours so far today × rate
  let laborSoFar = 0;
  for (const c of activeClock) {
    const hours = (now.getTime() - new Date(c.clockIn).getTime()) / (1000 * 60 * 60);
    laborSoFar += hours * Number(c.user.hourlyRate ?? 0);
  }
  // Project for full day: hours so far / fraction of day elapsed
  const dayFraction = (now.getHours() + now.getMinutes() / 60) / 24;
  const projectedLaborCost = dayFraction > 0.05 ? laborSoFar / dayFraction : null;
  const projectedLaborPct = (projectedLaborCost !== null && salesToday > 0)
    ? (projectedLaborCost / (salesToday / dayFraction)) * 100
    : null;

  // Price changes: compare same ingredient across last two POs
  const priceByIngredient = new Map<string, { name: string; unit: string; prices: { date: Date; unitCost: number; vendor: string }[] }>();
  for (const po of recentPOs) {
    if (!po.receivedAt) continue;
    for (const item of po.items) {
      const key = item.ingredientId;
      if (!priceByIngredient.has(key)) {
        priceByIngredient.set(key, { name: item.ingredient.name, unit: item.ingredient.unit, prices: [] });
      }
      priceByIngredient.get(key)!.prices.push({ date: po.receivedAt, unitCost: Number(item.unitCost), vendor: po.vendor.name });
    }
  }
  const priceChanges: { name: string; unit: string; oldPrice: number; newPrice: number; changePct: number; vendor: string }[] = [];
  for (const [, data] of priceByIngredient) {
    if (data.prices.length < 2) continue;
    const sorted = [...data.prices].sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = sorted[0];
    const previous = sorted[1];
    const changePct = ((latest.unitCost - previous.unitCost) / previous.unitCost) * 100;
    if (Math.abs(changePct) >= 5) {  // only surface meaningful changes (≥5%)
      priceChanges.push({ name: data.name, unit: data.unit, oldPrice: previous.unitCost, newPrice: latest.unitCost, changePct, vendor: latest.vendor });
    }
  }
  priceChanges.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  // Reservations summary
  const confirmedCovers = tonightReservations.reduce((sum, r) => sum + r.partySize, 0);
  const seatedNow = tonightReservations.filter(r => r.status === "SEATED").length;
  const upcomingRes = tonightReservations.filter(r => r.status === "CONFIRMED" || r.status === "PENDING");

  // Health score is computed later, after the final alerts are resolved,
  // so the score and alerts are always consistent with each other.

  // ── Build AI context ─────────────────────────────────────────────────────────

  const dayName = now.toLocaleDateString("en-US", { weekday: "long" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const contextLines: string[] = [
    `Current time: ${timeStr} on ${dayName}, ${todayStr}`,
    `Health score: (computed from final alerts)`,
    ``,
    `SALES PACING:`,
    `  Today so far: ${fmt(salesToday)} (${todaySales._count} completed orders)`,
    pacingRatio !== null
      ? `  vs reference period (best of yesterday/last week same time): ${fmt(refSales)} → pacing ${(pacingRatio * 100).toFixed(1)}% of normal`
      : `  No historical baseline available yet`,
    `  Open orders right now: ${openOrders}`,
    ``,
    `TONIGHT'S RESERVATIONS:`,
    `  Total covers booked: ${confirmedCovers} across ${tonightReservations.length} parties`,
    `  Currently seated: ${seatedNow}`,
    `  Upcoming: ${upcomingRes.length} parties still to arrive`,
    ``,
    `LABOR:`,
    `  Currently clocked in: ${activeClock.length} staff`,
    activeClock.length > 0
      ? `  Roles: ${activeClock.map(c => c.user.role).join(", ")}`
      : `  No staff currently clocked in`,
    projectedLaborCost !== null
      ? `  Labor cost so far today: ${fmt(laborSoFar)}, projected full-day: ${fmt(projectedLaborCost)}`
      : `  Labor data insufficient for projection`,
    projectedLaborPct !== null
      ? `  Projected labor %: ${projectedLaborPct.toFixed(1)}%`
      : ``,
    tonightShifts.length > 0
      ? `  Scheduled for today: ${tonightShifts.length} shifts`
      : `  No shifts scheduled in system for today`,
    ``,
    `INVENTORY:`,
    `  Low stock alerts: ${lowStock.length} items`,
    lowStock.slice(0, 5).map(i => `    - ${i.ingredient.name}: ${Number(i.quantity).toFixed(1)} ${i.ingredient.unit} (min: ${Number(i.minThreshold).toFixed(1)})`).join("\n"),
    `  Out of stock: ${outOfStock.length} items`,
    outOfStock.slice(0, 3).map(i => `    - ${i.ingredient.name}`).join("\n"),
    ``,
    `86 BOARD:`,
    `  Active 86s: ${active86.length}`,
    active86.map(e => `    - ${e.menuItem.name}`).join("\n"),
    ``,
    `VOIDS & COMPS TODAY:`,
    `  Voids: ${voids.length} (${fmt(voidTotal)} total)`,
    `  Comps: ${comps.length} (${fmt(compTotal)} total)`,
    ``,
    `PRICE CHANGES (last 60 days, ≥5% swings):`,
    priceChanges.length > 0
      ? priceChanges.slice(0, 6).map(p =>
          `    - ${p.name}: ${fmt(p.oldPrice)}/${p.unit} → ${fmt(p.newPrice)}/${p.unit} (${p.changePct > 0 ? "+" : ""}${p.changePct.toFixed(1)}%) from ${p.vendor}`
        ).join("\n")
      : `    None detected`,
  ].filter(l => l !== undefined);

  const contextBlock = contextLines.join("\n");

  // ── Always build a deterministic narrative (AI enhances, not replaces) ──────

  const fallbackAlerts = buildFallbackAlerts({
    pacingRatio, lowStock, outOfStock, active86, voids, comps,
    voidTotal, compTotal, priceChanges, projectedLaborPct, confirmedCovers,
  });

  const deterministicNarrative = buildNarrative({
    now, salesToday, refSales, pacingRatio, todayOrderCount: todaySales._count,
    activeClock: activeClock.length, projectedLaborPct, lowStockCount: lowStock.length,
    outOfStockCount: outOfStock.length, active86Count: active86.length,
    confirmedCovers,
  });

  const rawSignals = {
    salesToday, refSales, pacingRatio, laborSoFar, projectedLaborPct,
    lowStockCount: lowStock.length, active86Count: active86.length,
    voidTotal, confirmedCovers,
  };

  // ── Try AI to enhance narrative + alerts ─────────────────────────────────

  const apiKey = process.env.OPENAI_API_KEY;

  const cacheHeaders = { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" } };

  if (!apiKey) {
    return Response.json({
      healthScore: computeHealthScore(fallbackAlerts),
      narrative: deterministicNarrative,
      alerts: fallbackAlerts,
      rawSignals,
    }, cacheHeaders);
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      temperature: 0.3,
      // Force a valid JSON object so parsing can't silently fail and drop us to
      // the generic fallback. (The prompt already specifies the JSON shape.)
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the operations intelligence layer for a restaurant management system.
Your job: analyze the restaurant's current operational data and give the manager a concise, specific, actionable briefing.

Be direct. Use actual numbers. No filler phrases like "it's important to" or "you should consider."
Every alert must reference a specific number from the data.

Respond ONLY with valid JSON in this exact shape:
{
  "narrative": "<2 sentences. What is the story of today so far? Reference actual numbers.>",
  "alerts": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "category": "SALES" | "LABOR" | "INVENTORY" | "COSTS" | "RESERVATIONS" | "OPERATIONS",
      "message": "<specific, actionable, one sentence with actual numbers>",
      "link": "/reports" | "/inventory" | "/purchasing" | "/pos" | "/staff" | "/manager-log" | "/host"
    }
  ]
}

Generate 4–7 alerts. Only generate an alert if the data actually supports it. Do not invent issues.
Sort by severity descending (HIGH first).`,
        },
        {
          role: "user",
          content: contextBlock,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonStr = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonStr) as { narrative: string; alerts: { severity: string; category: string; message: string; link: string }[] };

    const finalAlerts = parsed.alerts?.length ? parsed.alerts : fallbackAlerts;
    return Response.json({
      healthScore: computeHealthScore(finalAlerts),
      narrative: parsed.narrative || deterministicNarrative,
      alerts: finalAlerts,
      rawSignals,
    }, cacheHeaders);

  } catch (err) {
    // AI failed — log it server-side and return deterministic data (fully functional without AI)
    console.error("[/api/vera] OpenAI call failed:", (err as Error)?.message ?? err);
    return Response.json({
      healthScore: computeHealthScore(fallbackAlerts),
      narrative: deterministicNarrative,
      alerts: fallbackAlerts,
      rawSignals,
    }, cacheHeaders);
  }
  } catch (err) {
    // Transient failure (e.g. brief SQLite contention) — return a clean 503 the
    // client retries, rather than an unhandled 500 that flashes an error.
    console.error("[/api/vera] data load failed:", (err as Error)?.message ?? err);
    return Response.json({ error: "analysis_unavailable" }, { status: 503 });
  }
}

// ── Deterministic narrative (always shown, AI optionally replaces it) ────────

function buildNarrative(d: {
  now: Date;
  salesToday: number;
  refSales: number;
  pacingRatio: number | null;
  todayOrderCount: number;
  activeClock: number;
  projectedLaborPct: number | null;
  lowStockCount: number;
  outOfStockCount: number;
  active86Count: number;
  confirmedCovers: number;
}): string {
  const timeStr = d.now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayName = d.now.toLocaleDateString("en-US", { weekday: "long" });

  const parts: string[] = [];

  // Sales sentence
  if (d.salesToday === 0 && d.todayOrderCount === 0) {
    parts.push(`It's ${timeStr} on ${dayName} — no completed orders yet.`);
  } else if (d.pacingRatio !== null) {
    const pctStr = (d.pacingRatio * 100).toFixed(0) + "%";
    const pace = d.pacingRatio >= 1.05 ? "ahead of" : d.pacingRatio >= 0.93 ? "on pace with" : d.pacingRatio >= 0.80 ? "slightly behind" : "well below";
    parts.push(`It's ${timeStr} on ${dayName}: $${d.salesToday.toFixed(0)} across ${d.todayOrderCount} orders, ${pctStr} and ${pace} the comparable period.`);
  } else {
    parts.push(`It's ${timeStr} on ${dayName}: $${d.salesToday.toFixed(0)} across ${d.todayOrderCount} order${d.todayOrderCount !== 1 ? "s" : ""} completed so far.`);
  }

  // Ops sentence
  const opsParts: string[] = [];
  if (d.outOfStockCount > 0) opsParts.push(`${d.outOfStockCount} ingredient${d.outOfStockCount > 1 ? "s" : ""} out of stock`);
  else if (d.lowStockCount > 0) opsParts.push(`${d.lowStockCount} item${d.lowStockCount > 1 ? "s" : ""} low on stock`);
  if (d.active86Count > 0) opsParts.push(`${d.active86Count} item${d.active86Count > 1 ? "s" : ""} 86'd`);
  if (d.confirmedCovers > 0) opsParts.push(`${d.confirmedCovers} covers booked tonight`);
  if (d.activeClock > 0) opsParts.push(`${d.activeClock} staff clocked in`);
  if (d.projectedLaborPct !== null) opsParts.push(`labor tracking ${d.projectedLaborPct.toFixed(1)}%`);

  if (opsParts.length > 0) {
    parts.push(opsParts.join(", ") + ".");
  } else {
    parts.push("All systems looking good — nothing flagged at this time.");
  }

  return parts.join(" ");
}

// ── Deterministic fallback alerts (used when AI is unavailable) ───────────────

function buildFallbackAlerts(data: {
  pacingRatio: number | null;
  lowStock: { ingredient: { name: string; unit: string }; quantity: { toString(): string }; minThreshold: { toString(): string } }[];
  outOfStock: { ingredient: { name: string } }[];
  active86: { menuItem: { name: string } }[];
  voids: unknown[];
  comps: unknown[];
  voidTotal: number;
  compTotal: number;
  priceChanges: { name: string; changePct: number; oldPrice: number; newPrice: number; unit: string }[];
  projectedLaborPct: number | null;
  confirmedCovers: number;
}) {
  const alerts: { severity: string; category: string; message: string; link: string }[] = [];

  if (data.pacingRatio !== null && data.pacingRatio < 0.85) {
    alerts.push({
      severity: data.pacingRatio < 0.70 ? "HIGH" : "MEDIUM",
      category: "SALES",
      message: `Sales pacing ${(data.pacingRatio * 100).toFixed(0)}% of the comparable period — ${((1 - data.pacingRatio) * 100).toFixed(0)}% below normal pace.`,
      link: "/reports",
    });
  }
  if (data.outOfStock.length > 0) {
    alerts.push({ severity: "HIGH", category: "INVENTORY", message: `${data.outOfStock.length} item${data.outOfStock.length > 1 ? "s" : ""} out of stock: ${data.outOfStock.slice(0, 3).map(i => i.ingredient.name).join(", ")}.`, link: "/inventory" });
  }
  if (data.lowStock.length > 0) {
    alerts.push({ severity: "MEDIUM", category: "INVENTORY", message: `${data.lowStock.length} inventory item${data.lowStock.length > 1 ? "s" : ""} below par — check before service: ${data.lowStock.slice(0, 2).map(i => i.ingredient.name).join(", ")}.`, link: "/inventory" });
  }
  if (data.active86.length > 0) {
    alerts.push({ severity: "MEDIUM", category: "OPERATIONS", message: `${data.active86.length} item${data.active86.length > 1 ? "s are" : " is"} currently 86'd: ${data.active86.map(e => e.menuItem.name).join(", ")}.`, link: "/pos" });
  }
  if (data.projectedLaborPct !== null && data.projectedLaborPct > 35) {
    alerts.push({ severity: data.projectedLaborPct > 42 ? "HIGH" : "MEDIUM", category: "LABOR", message: `Labor tracking at ${data.projectedLaborPct.toFixed(1)}% of sales — review scheduling.`, link: "/staff" });
  }
  if (data.voidTotal > 50) {
    alerts.push({ severity: "MEDIUM", category: "OPERATIONS", message: `${data.voids.length} void${data.voids.length !== 1 ? "s" : ""} totaling $${data.voidTotal.toFixed(2)} today.`, link: "/reports" });
  }
  if (data.priceChanges.length > 0) {
    const top = data.priceChanges[0];
    alerts.push({ severity: "LOW", category: "COSTS", message: `${top.name} price changed ${top.changePct > 0 ? "+" : ""}${top.changePct.toFixed(1)}% — $${top.oldPrice.toFixed(2)} → $${top.newPrice.toFixed(2)} per ${top.unit}.`, link: "/purchasing" });
  }
  if (data.confirmedCovers > 0) {
    alerts.push({ severity: "LOW", category: "RESERVATIONS", message: `${data.confirmedCovers} covers booked tonight. Check staffing levels.`, link: "/host" });
  }

  return alerts.sort((a, b) => {
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
  });
}
