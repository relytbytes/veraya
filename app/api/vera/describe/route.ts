import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// Vera writes appetizing, concise menu copy from an item's name, category and
// (when it exists) its recipe ingredients. Returns one short description.

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI not configured" }, { status: 503 });

  try {
    const { name, category, menuItemId } = await req.json() as { name?: string; category?: string; menuItemId?: string };
    if (!name?.trim()) return Response.json({ error: "Item name is required" }, { status: 400 });

    let ingredients: string[] = [];
    if (menuItemId) {
      const item = await prisma.menuItem.findUnique({
        where: { id: menuItemId },
        select: { recipe: { select: { ingredient: { select: { name: true } } } } },
      });
      ingredients = item?.recipe.map((r) => r.ingredient.name) ?? [];
    }

    const ctx = [
      `Item: ${name}`,
      category ? `Category: ${category}` : "",
      ingredients.length ? `Key ingredients: ${ingredients.join(", ")}` : "",
    ].filter(Boolean).join("\n");

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 90,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You write menu descriptions for a restaurant. One sentence, 12 to 22 words, appetizing and concrete, mentioning real ingredients or preparation. No clichés like "mouthwatering" or "to die for". No price. No em-dashes. No Oxford commas. Sentence case.
Respond ONLY as JSON: { "description": "<one sentence>" }`,
        },
        { role: "user", content: ctx },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { description?: string };
    if (!parsed.description) return Response.json({ error: "No description generated" }, { status: 502 });
    return Response.json({ description: parsed.description.trim() });
  } catch (err) {
    console.error("[/api/vera/describe]", (err as Error)?.message ?? err);
    return Response.json({ error: "describe_failed" }, { status: 500 });
  }
}
