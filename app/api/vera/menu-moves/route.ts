import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { costMenuItem, classifyMenuItem, type EngineeringKlass } from "@/lib/menu-costing";
import OpenAI from "openai";

// Vera's Menu Moves — turns the menu-engineering matrix (popularity x margin)
// into prioritized, specific actions. Deterministic classification + rule-based
// moves; AI phrases/prioritizes when available, with a deterministic fallback.

type Klass = EngineeringKlass;

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

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Sales window from the reports period selector. Same convention as
    // /api/reports (YYYY-MM-DD, inclusive). Defaults to the last 30 days.
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const now = new Date();
    const from = fromParam ? new Date(fromParam + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    const to = toParam ? new Date(toParam + "T23:59:59") : new Date(now);
    to.setHours(23, 59, 59, 999);

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
        where: { voided: false, order: { status: "COMPLETED", createdAt: { gte: from, lte: to } } },
        _sum: { quantity: true },
      }),
    ]);

    const unitsById = new Map(sales.map((s) => [s.menuItemId, Number(s._sum.quantity ?? 0)]));

    const enriched = items.map((m) => {
      const price = Number(m.price);
      const recipeCost = m.recipe.reduce((s, r) => s + Number(r.ingredient.costPerUnit) * Number(r.quantity), 0);
      const c = costMenuItem({ price, categoryName: m.category.name, recipeCost, hasRecipe: m.recipe.length > 0 });
      const units = unitsById.get(m.id) ?? 0;
      return { name: m.name, category: m.category.name, price, cost: c.cost, marginPct: c.marginPct, estimated: c.estimated, units };
    });

    // Every item now has an honest margin (real recipe or category-default
    // estimate), so the whole menu participates in the matrix. Medians split
    // popularity over items that actually sold and margin over the full menu.
    const sold = enriched.filter((e) => e.units > 0);
    const medUnits = median(sold.map((e) => e.units));
    const medMargin = median(enriched.map((e) => e.marginPct));

    function classify(e: typeof enriched[number]): Klass {
      return classifyMenuItem({ units: e.units, marginPct: e.marginPct, medianUnits: medUnits, medianMargin: medMargin });
    }

    // Surface moves for items with sales this week (actionable now); count every
    // item for the matrix summary.
    // Prioritize the most actionable: plowhorses (volume x thin margin), then
    // dogs, then puzzles; stars are "hold".
    const PRIORITY: Record<Klass, number> = { plowhorse: 0, dog: 1, puzzle: 2, star: 3 };
    const ranked = sold
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

    const counts = enriched.reduce((acc, e) => {
      const k = classify(e); acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {} as Record<Klass, number>);

    let aiPowered = false;
    const cacheHeaders = { headers: { "Cache-Control": "private, max-age=1800, stale-while-revalidate=300" } };

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && moves.length > 0) {
      try {
        const context = ranked.map(({ e, klass }) =>
          `${e.name} (${e.category}): ${klass}, margin ${e.marginPct.toFixed(0)}%, ${e.units} sold in the selected period, price $${e.price.toFixed(2)}, cost $${e.cost.toFixed(2)}`,
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
