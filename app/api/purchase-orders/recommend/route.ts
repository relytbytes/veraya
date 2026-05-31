import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// GET /api/purchase-orders/recommend
//
// Analyses inventory levels + recent usage to suggest what to order and how much.
// Groups suggestions by supplier so the manager can create POs with one tap.
//
// Algorithm:
//   1. Find items at or below par, or that will hit par within `daysAhead` days
//      based on their average daily burn rate (last 30 days of USAGE transactions)
//   2. Recommended qty = maxThreshold - currentQty  (or par * 3 if no max set)
//   3. Skip items that already have an open/pending PO line

export interface RecommendedItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentQty: number;
  parQty: number;
  maxQty: number | null;
  recommendedOrderQty: number;
  dailyUsage: number | null;      // avg daily burn over last 30 days
  daysUntilOut: number | null;    // null = no usage data
  urgency: "OUT" | "CRITICAL" | "LOW" | "UPCOMING";
  supplierId: string | null;
  supplierName: string | null;
  lastUnitCost: number | null;
  estimatedCost: number | null;
}

export interface RecommendResult {
  suggestions: RecommendedItem[];
  bySupplier: {
    supplierId: string | null;
    supplierName: string;
    items: RecommendedItem[];
    totalEstimatedCost: number;
  }[];
  totalEstimatedCost: number;
  aiPowered: boolean;
  summary: string;
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const daysAhead = Math.min(Number(url.searchParams.get("daysAhead") ?? 7), 30);
    const lookbackDays = 30;
    const lookbackDate = new Date(Date.now() - lookbackDays * 86400_000);

    const [inventoryItems, recentTransactions, openPOLines, ingredients] = await Promise.all([
      prisma.inventoryItem.findMany({
        include: { ingredient: { include: { supplier: true } } },
      }),

      prisma.inventoryTransaction.findMany({
        where: {
          type: "USED",
          createdAt: { gte: lookbackDate },
        },
        select: { ingredientId: true, quantity: true, createdAt: true },
      }),

      // Items already on open/pending POs — skip these
      prisma.purchaseOrderItem.findMany({
        where: {
          purchaseOrder: { status: { in: ["DRAFT", "ORDERED"] } },
        },
        select: { ingredientId: true },
      }),

      prisma.ingredient.findMany({
        select: { id: true, costPerUnit: true },
      }),
    ]);

    // Index recent usage by ingredient
    const usageMap = new Map<string, number>(); // ingredientId -> total used in 30d
    for (const tx of recentTransactions) {
      const prev = usageMap.get(tx.ingredientId) ?? 0;
      usageMap.set(tx.ingredientId, prev + Math.abs(Number(tx.quantity)));
    }

    // Items already on open POs
    const onOpenPO = new Set(openPOLines.map(l => l.ingredientId));

    // Cost index
    const costMap = new Map(ingredients.map(i => [i.id, Number(i.costPerUnit ?? 0)]));

    const suggestions: RecommendedItem[] = [];

    for (const item of inventoryItems) {
      const currentQty = Number(item.quantity);
      const parQty = Number(item.minThreshold);
      const maxQty = item.maxThreshold != null ? Number(item.maxThreshold) : null;
      const { ingredient } = item;

      // Daily burn rate
      const totalUsed = usageMap.get(ingredient.id) ?? 0;
      const dailyUsage = totalUsed > 0 ? totalUsed / lookbackDays : null;

      // Days until hitting par
      const daysUntilPar = dailyUsage && dailyUsage > 0
        ? (currentQty - parQty) / dailyUsage
        : null;

      // Determine if this item needs ordering
      const atOrBelowPar = currentQty <= parQty;
      const approachingPar = daysUntilPar != null && daysUntilPar <= daysAhead;

      if (!atOrBelowPar && !approachingPar) continue;
      if (onOpenPO.has(ingredient.id)) continue;

      // Recommended order qty
      const targetQty = maxQty ?? parQty * 3;
      const recommendedOrderQty = Math.max(Math.ceil(targetQty - currentQty), 1);

      // Urgency
      let urgency: RecommendedItem["urgency"];
      if (currentQty <= 0) urgency = "OUT";
      else if (currentQty <= parQty * 0.5) urgency = "CRITICAL";
      else if (atOrBelowPar) urgency = "LOW";
      else urgency = "UPCOMING";

      const unitCost = costMap.get(ingredient.id) ?? null;
      const estimatedCost = unitCost ? unitCost * recommendedOrderQty : null;

      suggestions.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        currentQty,
        parQty,
        maxQty,
        recommendedOrderQty,
        dailyUsage,
        daysUntilOut: dailyUsage && dailyUsage > 0
          ? Math.floor(currentQty / dailyUsage)
          : null,
        urgency,
        supplierId: ingredient.supplier?.id ?? null,
        supplierName: ingredient.supplier?.name ?? null,
        lastUnitCost: unitCost,
        estimatedCost,
      });
    }

    // Sort: OUT first, then CRITICAL, LOW, UPCOMING
    const urgencyOrder = { OUT: 0, CRITICAL: 1, LOW: 2, UPCOMING: 3 };
    suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    // Group by supplier
    const supplierMap = new Map<string, typeof suggestions>();
    for (const s of suggestions) {
      const key = s.supplierId ?? "__none__";
      if (!supplierMap.has(key)) supplierMap.set(key, []);
      supplierMap.get(key)!.push(s);
    }

    const bySupplier = [...supplierMap.entries()].map(([key, items]) => ({
      supplierId: key === "__none__" ? null : key,
      supplierName: items[0].supplierName ?? "No Supplier",
      items,
      totalEstimatedCost: items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0),
    }));

    const totalEstimatedCost = suggestions.reduce((s, i) => s + (i.estimatedCost ?? 0), 0);

    // ── AI summary ────────────────────────────────────────────────────────────
    let summary = buildDeterministicSummary(suggestions, daysAhead);
    let aiPowered = false;

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && suggestions.length > 0) {
      try {
        const { default: OpenAI } = await import("openai");
        const openai = new OpenAI({ apiKey });
        const lines = [
          `${suggestions.length} items need ordering (${daysAhead}-day horizon).`,
          `OUT: ${suggestions.filter(s => s.urgency === "OUT").map(s => s.ingredientName).join(", ") || "none"}`,
          `CRITICAL: ${suggestions.filter(s => s.urgency === "CRITICAL").map(s => s.ingredientName).join(", ") || "none"}`,
          `Estimated total: $${totalEstimatedCost.toFixed(2)}`,
          `Suppliers involved: ${[...new Set(suggestions.map(s => s.supplierName).filter(Boolean))].join(", ") || "unassigned"}`,
        ];
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 120,
          messages: [
            { role: "system", content: "You are a restaurant manager reviewing ordering needs. Write 1-2 direct sentences summarising what needs to be ordered and why it's urgent. Be specific about the most critical items. No filler." },
            { role: "user", content: lines.join("\n") },
          ],
        });
        const text = completion.choices[0]?.message?.content?.trim();
        if (text) { summary = text; aiPowered = true; }
      } catch { /* fall through */ }
    }

    return Response.json({ suggestions, bySupplier, totalEstimatedCost, aiPowered, summary } satisfies RecommendResult);
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[/api/purchase-orders/recommend]", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

function buildDeterministicSummary(suggestions: RecommendedItem[], daysAhead: number): string {
  if (suggestions.length === 0) return "All inventory items are well-stocked — no orders needed right now.";
  const out = suggestions.filter(s => s.urgency === "OUT");
  const critical = suggestions.filter(s => s.urgency === "CRITICAL");
  const parts: string[] = [];
  if (out.length) parts.push(`${out.map(s => s.ingredientName).join(", ")} ${out.length === 1 ? "is" : "are"} completely out`);
  if (critical.length) parts.push(`${critical.map(s => s.ingredientName).join(", ")} ${critical.length === 1 ? "is" : "are"} critically low`);
  if (!parts.length) parts.push(`${suggestions.length} item${suggestions.length > 1 ? "s" : ""} will need restocking within ${daysAhead} days`);
  return parts.join("; ") + ".";
}
