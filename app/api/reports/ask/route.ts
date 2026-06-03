import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";
import { startOfLocalDay, endOfLocalDay, localDateStr } from "@/lib/time";
import { getRestaurantTz } from "@/lib/restaurant-tz";

function fmt(n: number) { return `$${n.toFixed(2)}`; }
function fmtPct(n: number) { return `${n.toFixed(1)}%`; }

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { question, from, to } = await req.json() as { question: string; from: string; to: string };

  if (!question?.trim()) return Response.json({ error: "Question is required" }, { status: 400 });

  const tz = await getRestaurantTz();
  const fromDate = startOfLocalDay(from, tz);
  const toDate   = endOfLocalDay(to, tz);

  // Comparison period (same length, immediately before)
  const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  const prevToDate   = new Date(fromDate); prevToDate.setDate(prevToDate.getDate() - 1); prevToDate.setHours(23, 59, 59, 999);
  const prevFromDate = new Date(prevToDate); prevFromDate.setDate(prevFromDate.getDate() - dayCount + 1); prevFromDate.setHours(0, 0, 0, 0);

  // ── Fetch data in parallel ─────────────────────────────────────────────────
  const [
    orders,
    prevOrders,
    clockEntries,
    prevClockEntries,
    orderItems,
    prevOrderItems,
    inventoryItems,
    poItems,
    eightySix,
    reservations,
    voidLogs,
  ] = await Promise.all([
    // Current period orders
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: fromDate, lte: toDate } },
      select: {
        id: true, total: true, type: true, createdAt: true,
        items: { where: { voided: false }, select: { quantity: true, unitPrice: true, menuItem: { select: { name: true, category: { select: { name: true } } } } } },
      },
    }),

    // Previous period orders (for comparisons)
    prisma.order.findMany({
      where: { status: "COMPLETED", createdAt: { gte: prevFromDate, lte: prevToDate } },
      select: { total: true },
    }),

    // Clock entries current period
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: fromDate, lte: toDate } },
      include: { user: { select: { name: true, role: true, hourlyRate: true } } },
    }),

    // Clock entries previous period
    prisma.clockEntry.findMany({
      where: { clockIn: { gte: prevFromDate, lte: prevToDate } },
      include: { user: { select: { name: true, role: true, hourlyRate: true } } },
    }),

    // Top menu items
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { voided: false, order: { status: "COMPLETED", createdAt: { gte: fromDate, lte: toDate } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 20,
    }),

    // Top menu items previous period
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { voided: false, order: { status: "COMPLETED", createdAt: { gte: prevFromDate, lte: prevToDate } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 20,
    }),

    // Inventory snapshot
    prisma.inventoryItem.findMany({
      include: { ingredient: { select: { name: true, unit: true, costPerUnit: true } } },
    }),

    // Purchase orders in period
    prisma.purchaseOrderItem.findMany({
      where: { purchaseOrder: { status: "RECEIVED", receivedAt: { gte: fromDate, lte: toDate } } },
      include: { ingredient: { select: { name: true, unit: true } }, purchaseOrder: { select: { vendor: { select: { name: true } } } } },
    }),

    // Currently 86'd items
    prisma.eightySixItem.findMany({
      include: { menuItem: { select: { name: true } } },
    }),

    // Reservations
    prisma.reservation.findMany({
      where: { date: { gte: from, lte: to } },
      select: { partySize: true, status: true, date: true },
    }),

    // Voids / comps
    prisma.auditLog.findMany({
      where: { action: { in: ["VOID", "COMP"] }, createdAt: { gte: fromDate, lte: toDate } },
      select: { action: true, amount: true },
    }),
  ]);

  // ── Crunch numbers ─────────────────────────────────────────────────────────

  const totalRevenue   = orders.reduce((s, o) => s + Number(o.total), 0);
  const prevRevenue    = prevOrders.reduce((s, o) => s + Number(o.total), 0);
  const revenueDelta   = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const avgCheck       = orders.length > 0 ? totalRevenue / orders.length : 0;

  // Labor
  const laborCost = clockEntries.reduce((s, c) => {
    const hours = ((c.clockOut ?? new Date()).getTime() - c.clockIn.getTime()) / 3600000;
    return s + Math.max(0, hours) * Number(c.user.hourlyRate ?? 0);
  }, 0);
  const prevLaborCost = prevClockEntries.reduce((s, c) => {
    const hours = ((c.clockOut ?? new Date()).getTime() - c.clockIn.getTime()) / 3600000;
    return s + Math.max(0, hours) * Number(c.user.hourlyRate ?? 0);
  }, 0);
  const laborPct = totalRevenue > 0 ? (laborCost / totalRevenue) * 100 : null;
  const laborHours = clockEntries.reduce((s, c) => {
    const hours = ((c.clockOut ?? new Date()).getTime() - c.clockIn.getTime()) / 3600000;
    return s + Math.max(0, hours);
  }, 0);

  // Category breakdown
  const catMap = new Map<string, { revenue: number; qty: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const cat = item.menuItem.category.name;
      const rev = Number(item.unitPrice) * item.quantity;
      const e = catMap.get(cat) ?? { revenue: 0, qty: 0 };
      e.revenue += rev; e.qty += item.quantity;
      catMap.set(cat, e);
    }
  }
  const categories = Array.from(catMap.entries())
    .map(([name, v]) => ({ name, revenue: v.revenue, pct: totalRevenue > 0 ? (v.revenue / totalRevenue) * 100 : 0, qty: v.qty }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top items — enrich with names
  const menuItemIds = orderItems.map(i => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, name: true, price: true, category: { select: { name: true } } },
  });
  const menuMap = new Map(menuItems.map(m => [m.id, m]));
  const topItems = orderItems
    .map(i => ({ name: menuMap.get(i.menuItemId)?.name ?? "Unknown", qty: i._sum.quantity ?? 0, category: menuMap.get(i.menuItemId)?.category.name ?? "" }))
    .slice(0, 10);

  // Previous top items
  const prevMenuItemIds = prevOrderItems.map(i => i.menuItemId);
  const prevMenuItems = await prisma.menuItem.findMany({
    where: { id: { in: prevMenuItemIds } },
    select: { id: true, name: true },
  });
  const prevMenuMap = new Map(prevMenuItems.map(m => [m.id, m]));
  const prevTopItems = prevOrderItems
    .map(i => ({ name: prevMenuMap.get(i.menuItemId)?.name ?? "Unknown", qty: i._sum.quantity ?? 0 }))
    .slice(0, 10);

  // Inventory snapshot
  const lowStock = inventoryItems.filter(i => Number(i.quantity) > 0 && Number(i.quantity) <= Number(i.minThreshold));
  const outOfStock = inventoryItems.filter(i => Number(i.quantity) <= 0);

  // COGS estimate from PO receiving
  const cogsPeriod = poItems.reduce((s, i) => s + Number(i.unitCost) * Number(i.quantity), 0);
  const cogsEstPct = totalRevenue > 0 ? (cogsPeriod / totalRevenue) * 100 : null;

  // Voids / comps
  const voidTotal = voidLogs.filter(l => l.action === "VOID").reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const compTotal = voidLogs.filter(l => l.action === "COMP").reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const voidPct   = totalRevenue > 0 ? (voidTotal / totalRevenue) * 100 : 0;

  // Reservations
  const confirmedRes = reservations.filter(r => ["CONFIRMED", "SEATED", "COMPLETED"].includes(r.status));
  const totalCovers  = confirmedRes.reduce((s, r) => s + r.partySize, 0);

  // Daily breakdown for trends
  const dailyMap = new Map<string, number>();
  for (const o of orders) {
    const d = localDateStr(new Date(o.createdAt), tz);
    dailyMap.set(d, (dailyMap.get(d) ?? 0) + Number(o.total));
  }
  const dailySales = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const bestDay  = dailySales.reduce((a, b) => b[1] > a[1] ? b : a, ["", 0]);
  const worstDay = dailySales.reduce((a, b) => b[1] < a[1] ? b : a, ["", Infinity]);

  // ── Build context ──────────────────────────────────────────────────────────

  const contextBlock = [
    `REPORT PERIOD: ${from} to ${to} (${dayCount} days)`,
    `COMPARISON PERIOD: ${localDateStr(prevFromDate, tz)} to ${localDateStr(prevToDate, tz)} (previous ${dayCount} days)`,
    ``,
    `REVENUE & ORDERS:`,
    `  Total revenue: ${fmt(totalRevenue)} (${orders.length} completed orders)`,
    `  Average check: ${fmt(avgCheck)}`,
    prevRevenue > 0
      ? `  vs prior period: ${fmt(prevRevenue)} (${revenueDelta !== null ? (revenueDelta >= 0 ? "+" : "") + fmtPct(revenueDelta) : "N/A"} change)`
      : `  No prior period data available`,
    bestDay[0]  ? `  Best day: ${bestDay[0]} (${fmt(bestDay[1])})` : "",
    worstDay[0] && dayCount > 1 ? `  Weakest day: ${worstDay[0]} (${fmt(worstDay[1] as number)})` : "",
    ``,
    `CATEGORY BREAKDOWN:`,
    ...categories.map(c => `  ${c.name}: ${fmt(c.revenue)} (${fmtPct(c.pct)}) — ${c.qty} items`),
    ``,
    `TOP 10 ITEMS BY QUANTITY:`,
    ...topItems.map((i, idx) => `  ${idx + 1}. ${i.name} (${i.category}): ${i.qty} sold`),
    ``,
    `TOP 10 ITEMS PRIOR PERIOD:`,
    ...prevTopItems.map((i, idx) => `  ${idx + 1}. ${i.name}: ${i.qty} sold`),
    ``,
    `LABOR:`,
    `  Labor cost: ${fmt(laborCost)} over ${laborHours.toFixed(1)} hours`,
    laborPct !== null ? `  Labor %: ${fmtPct(laborPct)}` : `  Labor % unavailable`,
    prevLaborCost > 0 ? `  Prior period labor cost: ${fmt(prevLaborCost)}` : "",
    ``,
    `FOOD COST (from PO receiving in period):`,
    `  PO spend received: ${fmt(cogsPeriod)}`,
    cogsEstPct !== null ? `  As % of revenue: ${fmtPct(cogsEstPct)}` : "",
    ``,
    `VOIDS & COMPS:`,
    `  Void total: ${fmt(voidTotal)} (${fmtPct(voidPct)} of revenue)`,
    `  Comp total: ${fmt(compTotal)}`,
    ``,
    `RESERVATIONS:`,
    `  ${totalCovers} total covers from ${confirmedRes.length} confirmed reservations`,
    ``,
    `INVENTORY (current snapshot):`,
    `  Low stock: ${lowStock.length} items — ${lowStock.slice(0, 5).map(i => i.ingredient.name).join(", ")}`,
    `  Out of stock: ${outOfStock.length} items`,
    ``,
    `86 BOARD (currently active):`,
    eightySix.length > 0
      ? eightySix.map(e => `  - ${e.menuItem.name}`).join("\n")
      : "  None currently 86'd",
  ].filter(l => l !== undefined).join("\n");

  // ── Ask GPT ────────────────────────────────────────────────────────────────

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({
      answer: "AI analysis is not configured. Please set OPENAI_API_KEY to use this feature.",
      dataPoints: [],
      followUps: [],
      aiPowered: false,
    });
  }

  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a restaurant analytics AI. You answer questions about restaurant performance using actual data.

Be direct, specific, and use real numbers from the data. Never say "based on the data provided" — just answer.
Reference percentages, dollar amounts, and trends. If the data doesn't support the question, say what you can see and what's missing.

Respond ONLY with valid JSON:
{
  "answer": "<2-4 sentences directly answering the question with specific numbers>",
  "dataPoints": [
    { "label": "<metric name>", "value": "<formatted value>", "context": "<1 short phrase of context, e.g. 'above 30% target'>", "positive": true|false }
  ],
  "followUps": ["<suggested follow-up question 1>", "<suggested follow-up question 2>", "<suggested follow-up question 3>"]
}

Generate 2-5 data points most relevant to the question. Follow-ups should be natural next questions a manager would ask.`,
        },
        {
          role: "user",
          content: `Here is the restaurant data for the period:\n\n${contextBlock}\n\nQuestion: ${question}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      answer?: string;
      dataPoints?: { label: string; value: string; context: string; positive: boolean }[];
      followUps?: string[];
    };

    return Response.json({
      answer: parsed.answer ?? "Unable to generate an answer.",
      dataPoints: parsed.dataPoints ?? [],
      followUps: parsed.followUps ?? [],
      aiPowered: true,
      period: { from, to, dayCount },
    });

  } catch (err) {
    console.error("[/api/reports/ask]", (err as Error)?.message ?? err);
    return Response.json({ error: "AI analysis failed. Please try again." }, { status: 500 });
  }
}
