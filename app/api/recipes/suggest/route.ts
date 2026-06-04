import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { menuItemIds } = await req.json() as { menuItemIds: string[] };
  if (!menuItemIds?.length) return Response.json({ error: "menuItemIds required" }, { status: 400 });

  // ── Fetch menu items + full ingredient library ─────────────────────────────
  const [menuItems, ingredients] = await Promise.all([
    prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: { category: { select: { name: true } } },
    }),
    prisma.ingredient.findMany({
      where: { isActive: true },
      select: { id: true, name: true, unit: true, costPerUnit: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!ingredients.length) {
    return Response.json({ error: "No ingredients in the system yet. Add ingredients first." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY not configured." }, { status: 500 });
  }

  // ── Build prompt ───────────────────────────────────────────────────────────

  const ingredientList = ingredients
    .map(i => `  { "id": "${i.id}", "name": "${i.name}", "unit": "${i.unit}", "costPerUnit": ${Number(i.costPerUnit).toFixed(4)} }`)
    .join(",\n");

  const itemList = menuItems
    .map(m => `  { "id": "${m.id}", "name": "${m.name}", "category": "${m.category.name}", "price": ${Number(m.price).toFixed(2)} }`)
    .join(",\n");

  const systemPrompt = `You are a culinary consultant helping a restaurant build recipe costing.

Given a list of menu items and an ingredient library, suggest realistic recipes for each item.
Use ONLY ingredients from the provided library — do not invent ingredients.
Choose quantities that make sense for a single serving in a restaurant context.
Aim for a food cost of 28–35% of the selling price where possible.
ALWAYS attempt a recipe for every food and beverage item using the closest matching
ingredients available — a partial recipe is far more useful than none. Only return an
empty "ingredients" array for genuine non-food items (gift cards, merchandise, service
fees). When the library is missing ingredients this dish clearly needs, still build the
best recipe you can from what exists and use the "notes" field to list the ingredients
the restaurant should add (e.g. "Add buns and cheddar to your ingredient library for a
complete recipe").

Respond ONLY with valid JSON in this exact shape:
{
  "suggestions": {
    "<menuItemId>": {
      "ingredients": [
        { "ingredientId": "<id from library>", "quantity": <number>, "unit": "<unit>", "name": "<ingredient name>" }
      ],
      "plateCost": <total cost as number>,
      "costPct": <cost as % of selling price>,
      "notes": "<1 sentence about this recipe or any assumptions>"
    }
  }
}`;

  const userPrompt = `INGREDIENT LIBRARY (use only these):
[\n${ingredientList}\n]

MENU ITEMS TO BUILD RECIPES FOR:
[\n${itemList}\n]

Suggest a recipe for each menu item using ingredients from the library above.`;

  // ── Call GPT ───────────────────────────────────────────────────────────────
  const client = new OpenAI({ apiKey });

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      suggestions: Record<string, {
        ingredients: { ingredientId: string; quantity: number; unit: string; name: string }[];
        plateCost: number;
        costPct: number;
        notes: string;
      }>;
    };

    // Enrich with full ingredient data and recalculate costs server-side for accuracy
    const ingredientMap = new Map(ingredients.map(i => [i.id, i]));
    const enriched: Record<string, {
      ingredients: { ingredientId: string; quantity: number; unit: string; name: string; costPerUnit: number; lineCost: number }[];
      plateCost: number;
      costPct: number;
      notes: string;
    }> = {};

    for (const [menuItemId, suggestion] of Object.entries(parsed.suggestions ?? {})) {
      const item = menuItems.find(m => m.id === menuItemId);
      if (!item) continue;

      const validIngredients = (suggestion.ingredients ?? [])
        .filter(i => ingredientMap.has(i.ingredientId))
        .map(i => {
          const ing = ingredientMap.get(i.ingredientId)!;
          const qty = Math.max(0, Number(i.quantity) || 0);
          return {
            ingredientId: i.ingredientId,
            quantity: qty,
            unit: ing.unit,
            name: ing.name,
            costPerUnit: Number(ing.costPerUnit),
            lineCost: qty * Number(ing.costPerUnit),
          };
        });

      const plateCost = validIngredients.reduce((s, i) => s + i.lineCost, 0);
      const price = Number(item.price);
      const costPct = price > 0 ? (plateCost / price) * 100 : 0;

      enriched[menuItemId] = {
        ingredients: validIngredients,
        plateCost,
        costPct,
        notes: suggestion.notes ?? "",
      };
    }

    return Response.json({ suggestions: enriched, ingredientCount: ingredients.length });

  } catch (err) {
    console.error("[/api/recipes/suggest]", (err as Error)?.message ?? err);
    return Response.json({ error: "AI suggestion failed. Please try again." }, { status: 500 });
  }
}
