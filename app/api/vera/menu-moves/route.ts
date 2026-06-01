import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// Vera's Menu Moves — turns the menu-engineering matrix (popularity x margin)
// into prioritized, specific actions. Deterministic classification + rule-based
// moves; AI phrases/prioritizes when available, with a deterministic fallback.

type Klass = "star" | "plowhorse" | "puzzle" | "dog";

export interface MenuMove {
  item: string;
  klass: Klass;
  marginPct: number;
  units: number;
  action: string;
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const RULE: Record<Klass, string> = {
  star:      "Protect it. Keep it prominent and hold the price; this is a high-margin favorite.",
  plowhorse: "Popular but thin margin. Re-engineer the recipe or nudge the price; small gains scale here.",
  puzzle:    "High margin but undersold. Reposition it on the menu, feature it, or train staff to suggest it.",
  dog:       "Low volume and low margin. Rework it or cut it to simplify the line.",
};

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const since = new Date(Date.now() - 30 * 86400_000);
    const [items, sales] = await Promise.all([
      prisma.menuItem.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true, price: true,
          category: { select: { name: true } },
          recipe: { select: { quantity: true, ingredient: { select: { costPerUnit: true } } } },
        },
      }),
      prisma.orderItem.groupBy({
        by: ["menuItemId"],
        where: { voided: false, order: { status: "COMPLETED", createdAt: { gte: since } } },
        _sum: { quantity: true },
      }),
    ]);

    const unitsById = new Map(sales.map((s) => [s.menuItemId, Number(s._sum.quantity ?? 0)]));

    const enriched = items.map((m) => {
      const price = Number(m.price);
      const cost = m.recipe.reduce((s, r) => s + Number(r.ingredient.costPerUnit) * Number(r.quantity), 0);
      const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
      const units = unitsById.get(m.id) ?? 0;
      return { name: m.name, category: m.category.name, price, cost, marginPct, units, hasRecipe: m.recipe.length > 0 };
    });

    // Classify against medians (only items with a costed recipe are actionable).
    const costed = enriched.filter((e) => e.hasRecipe);
    const sold = costed.filter((e) => e.units > 0);
    const medUnits = median(sold.map((e) => e.units));
    const medMargin = median(costed.map((e) => e.marginPct));

    function classify(e: typeof enriched[number]): Klass {
      const popular = e.units >= medUnits;
      const highMargin = e.marginPct >= medMargin;
      return popular ? (highMargin ? "star" : "plowhorse") : (highMargin ? "puzzle" : "dog");
    }

    // Prioritize the most actionable: plowhorses (volume x thin margin), then
    // dogs, then puzzles; stars are "hold".
    const PRIORITY: Record<Klass, number> = { plowhorse: 0, dog: 1, puzzle: 2, star: 3 };
    const ranked = costed
      .map((e) => ({ e, klass: classify(e) }))
      .sort((a, b) => {
        const p = PRIORITY[a.klass] - PRIORITY[b.klass];
        if (p !== 0) return p;
        // within plowhorse: highest volume first; within others: by margin gap
        return b.e.units - a.e.units;
      })
      .slice(0, 6);

    let moves: MenuMove[] = ranked.map(({ e, klass }) => ({
      item: e.name,
      klass,
      marginPct: Math.round(e.marginPct),
      units: e.units,
      action: RULE[klass],
    }));

    const counts = costed.reduce((acc, e) => {
      const k = classify(e); acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {} as Record<Klass, number>);

    let aiPowered = false;
    const cacheHeaders = { headers: { "Cache-Control": "private, max-age=1800, stale-while-revalidate=300" } };

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && moves.length > 0) {
      try {
        const context = ranked.map(({ e, klass }) =>
          `${e.name} (${e.category}): ${klass}, margin ${e.marginPct.toFixed(0)}%, ${e.units} sold in 30d, price $${e.price.toFixed(2)}, cost $${e.cost.toFixed(2)}`,
        ).join("\n");
        const client = new OpenAI({ apiKey });
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are Vera, restaurant menu-engineering intelligence. For each item, give ONE specific, concrete move a manager can act on this week. Use the numbers. Voice: warm, direct, like a sharp GM. No hype, no em-dashes, no Oxford commas.
Respond ONLY as JSON: { "moves": [ { "item": "<exact name>", "action": "<one specific sentence>" } ] }`,
            },
            { role: "user", content: `Menu-engineering classes (star=keep, plowhorse=popular/thin, puzzle=high-margin/undersold, dog=weak):\n\n${context}` },
          ],
        });
        const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { moves?: { item: string; action: string }[] };
        if (parsed.moves?.length) {
          const actionByItem = new Map(parsed.moves.map((m) => [m.item, m.action]));
          moves = moves.map((m) => ({ ...m, action: actionByItem.get(m.item) ?? m.action }));
          aiPowered = true;
        }
      } catch (err) {
        console.error("[/api/vera/menu-moves] OpenAI failed:", (err as Error)?.message ?? err);
      }
    }

    return Response.json({ moves, counts, aiPowered }, cacheHeaders);
  } catch (err) {
    console.error("[/api/vera/menu-moves]", (err as Error)?.message ?? err);
    return Response.json({ error: "menu_moves_unavailable" }, { status: 503 });
  }
}
