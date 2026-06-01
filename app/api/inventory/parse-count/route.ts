import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// POST /api/inventory/parse-count  { transcript, items: [{id,name,unit}] }
// Maps a spoken inventory count to real items + quantities, grounded to the
// provided candidate items so the model can only resolve to things that exist.
// Handles fuzzy quantities ("a case and a half", "two dozen", "half a bag").
// Deterministic fallback: a single candidate + a bare number in the transcript.

interface Item { id: string; name: string; unit: string }
interface CountResult { ingredientId: string; name: string; quantity: number; unit: string }

const WORD: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, half: 0.5,
};

function quickNumber(t: string): number | null {
  const m = t.replace(/[^0-9.]/g, " ").trim().split(/\s+/)[0];
  if (m && !isNaN(parseFloat(m))) return parseFloat(m);
  for (const [w, n] of Object.entries(WORD)) if (new RegExp(`\\b${w}\\b`).test(t.toLowerCase())) return n;
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, items } = await req.json() as { transcript?: string; items?: Item[] };
  if (!transcript?.trim() || !Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "transcript and items required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;

  // Deterministic fallback (also used when AI is unavailable): single candidate + a number.
  function fallback(): CountResult[] {
    if (items!.length === 1) {
      const n = quickNumber(transcript!);
      if (n != null) return [{ ingredientId: items![0].id, name: items![0].name, quantity: n, unit: items![0].unit }];
    }
    return [];
  }

  if (!apiKey) return Response.json({ results: fallback(), aiPowered: false });

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You convert a spoken restaurant inventory count into structured quantities. You are given the ONLY valid items (with ids). Map each quantity the speaker states to the best-matching item id. Resolve fuzzy amounts to numbers (a dozen = 12, a case and a half = 1.5, half a bag = 0.5). Only include items the speaker actually counted. If nothing matches, return an empty array.
Respond ONLY as JSON: { "results": [ { "id": "<item id>", "quantity": <number> } ] }`,
        },
        {
          role: "user",
          content: `Items:\n${items.map((i) => `- ${i.id} :: ${i.name} (${i.unit})`).join("\n")}\n\nSpoken count: "${transcript}"`,
        },
      ],
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { results?: { id: string; quantity: number }[] };
    const byId = new Map(items.map((i) => [i.id, i]));
    const results: CountResult[] = (parsed.results ?? [])
      .map((r) => { const it = byId.get(r.id); return it && typeof r.quantity === "number" ? { ingredientId: it.id, name: it.name, quantity: r.quantity, unit: it.unit } : null; })
      .filter((x): x is CountResult => x !== null);
    return Response.json({ results: results.length ? results : fallback(), aiPowered: true });
  } catch (err) {
    console.error("[/api/inventory/parse-count]", (err as Error)?.message ?? err);
    return Response.json({ results: fallback(), aiPowered: false });
  }
}
