import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// POST /api/ingredients/import-photo
// Body: { image: "data:image/jpeg;base64,..." }
//
// PURPOSE: Extract a LIST of new ingredients from a delivery photo, invoice photo,
// pantry shelf, or product labels. This is distinct from /api/vision which identifies
// a SINGLE product for PO receiving/matching.
//
// Returns: { ingredients: ExtractedIngredient[] }

export interface ExtractedIngredient {
  name: string;          // clean, generic name (e.g. "Chicken Breast" not "Tyson Chicken")
  brand: string | null;  // brand if visible
  suggestedUnit: string; // best unit for this ingredient (kg, L, unit, etc.)
  notes: string | null;  // any useful notes (e.g. "appears to be 5lb bags")
  confidence: "high" | "medium" | "low";
}

const COMMON_UNITS = ["kg", "g", "L", "mL", "oz", "lb", "unit", "dozen", "case", "bag", "box", "bottle", "can", "bunch", "each"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  const { image } = await req.json() as { image?: string };
  if (!image?.startsWith("data:image/")) {
    return Response.json({ error: "image must be a base64 data URL" }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are helping a restaurant build its ingredient library by scanning delivery photos, invoices, pantry shelves, and product labels.

Read EVERY line of text on each label, including small print. Identify ALL distinct food/beverage products visible in this image. For each one:
- For FOOD: use a clean, generic ingredient name (e.g. "Chicken Breast" not "Tyson Fresh Chicken Tenders"), suggestedUnit from the list, brand if visible.
- For WINE / SPIRITS / BEER: do NOT collapse to a bare varietal. Use the FULL specific name a sommelier would list — producer + vintage + varietal/expression + vineyard, e.g. "Foxen 2018 Pinot Noir Block 8 Bien Nacido Vineyard", "Caymus Cabernet Sauvignon". Put producer in brand, and put the vintage, region/appellation, and ABV in notes (e.g. "2018 · Santa Maria Valley · 14.1%"). suggestedUnit "bottle".
- Note any helpful context (pack size, format, vintage, region).

Do NOT list the same product twice. Do NOT include non-food items (packaging materials, cleaning supplies, etc.). If you can read multiple labeled cases/boxes, list each distinct product.

Return ONLY valid JSON — no markdown, no explanation:
{
  "ingredients": [
    {
      "name": "clean generic name",
      "brand": "brand name or null",
      "suggestedUnit": "one of the unit list",
      "notes": "brief note or null",
      "confidence": "high|medium|low"
    }
  ]
}`,
            },
            {
              type: "image_url",
              image_url: { url: image, detail: "high" },
            },
          ],
        },
      ],
    });

    let text = completion.choices[0]?.message?.content ?? "{}";
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    const parsed = JSON.parse(text) as { ingredients?: ExtractedIngredient[] };
    const ingredients = (parsed.ingredients ?? []).filter(
      i => i.name && COMMON_UNITS.includes(i.suggestedUnit)
    );

    return Response.json({ ingredients, count: ingredients.length });

  } catch (err) {
    console.error("[/api/ingredients/import-photo]", (err as Error)?.message ?? err);
    return Response.json({ error: "AI extraction failed. Please try again." }, { status: 500 });
  }
}
