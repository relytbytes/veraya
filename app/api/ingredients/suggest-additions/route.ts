import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// POST /api/ingredients/suggest-additions
// Body: { ingredientIds: string[] }
//
// Given a set of newly-added ingredients, find existing menu items whose recipes
// could plausibly be enhanced or completed with these ingredients.
// Uses GPT to reason about which items each ingredient logically belongs in.

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { ingredientIds } = await req.json() as { ingredientIds?: string[] };
  if (!ingredientIds?.length) return Response.json({ suggestions: [] });

  const [newIngredients, menuItems] = await Promise.all([
    prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
      select: { id: true, name: true, unit: true },
    }),
    prisma.menuItem.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true } },
        recipe: { include: { ingredient: { select: { name: true } } } },
      },
    }),
  ]);

  if (!newIngredients.length || !menuItems.length) return Response.json({ suggestions: [] });

  const apiKey = process.env.OPENAI_API_KEY;

  // ── Deterministic fallback: simple name-match heuristic ───────────────────
  // Even without AI, suggest items whose name shares words with the ingredient
  function deterministicSuggestions() {
    const results: {
      ingredientId: string;
      ingredientName: string;
      menuItems: { id: string; name: string; category: string; currentIngredients: string[] }[];
    }[] = [];

    for (const ing of newIngredients) {
      const words = ing.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matched = menuItems.filter(item => {
        const itemText = (item.name + " " + item.category.name).toLowerCase();
        return words.some(w => itemText.includes(w));
      });

      if (matched.length > 0) {
        results.push({
          ingredientId: ing.id,
          ingredientName: ing.name,
          menuItems: matched.slice(0, 5).map(m => ({
            id: m.id,
            name: m.name,
            category: m.category.name,
            currentIngredients: m.recipe.map(r => r.ingredient.name),
          })),
        });
      }
    }
    return results;
  }

  if (!apiKey) {
    return Response.json({ suggestions: deterministicSuggestions(), aiPowered: false });
  }

  // ── AI suggestions ─────────────────────────────────────────────────────────
  const ingList = newIngredients.map(i => `- ${i.name} (${i.unit})`).join("\n");
  const itemList = menuItems.map(m =>
    `{ "id": "${m.id}", "name": "${m.name}", "category": "${m.category.name}", "currentIngredients": [${m.recipe.map(r => `"${r.ingredient.name}"`).join(", ")}] }`
  ).join(",\n");

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are a culinary consultant helping a restaurant identify which menu items could use newly-added ingredients.

For each new ingredient, identify menu items from the list that would logically use it in their recipe — either because the item isn't costed yet, or because the ingredient is likely missing from an existing recipe.

Only suggest pairings that make genuine culinary sense. Do not force matches.

Respond ONLY with valid JSON:
{
  "suggestions": [
    {
      "ingredientId": "<id>",
      "ingredientName": "<name>",
      "menuItems": [
        { "id": "<menuItemId>", "name": "<name>", "category": "<category>", "reason": "<one sentence why this ingredient belongs here>" }
      ]
    }
  ]
}`,
        },
        {
          role: "user",
          content: `NEW INGREDIENTS JUST ADDED:\n${ingList}\n\nMENU ITEMS:\n[\n${itemList}\n]`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      suggestions: {
        ingredientId: string;
        ingredientName: string;
        menuItems: { id: string; name: string; category: string; reason: string }[];
      }[];
    };

    // Enrich with currentIngredients from our data
    const menuMap = new Map(menuItems.map(m => [m.id, m]));
    const enriched = (parsed.suggestions ?? []).map(s => ({
      ...s,
      menuItems: s.menuItems.map(mi => ({
        ...mi,
        currentIngredients: menuMap.get(mi.id)?.recipe.map(r => r.ingredient.name) ?? [],
      })),
    }));

    return Response.json({ suggestions: enriched, aiPowered: true });

  } catch (err) {
    console.error("[/api/ingredients/suggest-additions]", (err as Error)?.message ?? err);
    return Response.json({ suggestions: deterministicSuggestions(), aiPowered: false });
  }
}
