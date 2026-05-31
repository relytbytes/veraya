import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// POST /api/vision
// Body: { image: "data:image/jpeg;base64,..." }
// Returns: { identified: { name, brand, type, confidence }, matches: Ingredient[] }
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });
    }

    const body = await req.json();
    const { image } = body as { image: string }; // data URL

    if (!image) {
      return Response.json({ error: "Image required" }, { status: 400 });
    }

    // Validate it's a data URL we can send to OpenAI
    if (!image.startsWith("data:image/")) {
      return Response.json({ error: "Image must be a data URL" }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });

    let completion: Awaited<ReturnType<typeof openai.chat.completions.create>>;
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are helping identify food/beverage products for a restaurant inventory system.
Analyze this image and identify the product. Focus on any visible text, labels, or branding.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "name": "primary product name (e.g. 'Cabernet Sauvignon', 'Chicken Breast', 'Olive Oil')",
  "brand": "brand or winery name if visible, else null",
  "type": "product category (e.g. 'red wine', 'poultry', 'condiment')",
  "searchTerms": ["2-4 short terms to search for this item in a database"],
  "confidence": "high|medium|low"
}`,
              },
              {
                type: "image_url",
                image_url: { url: image, detail: "low" },
              },
            ],
          },
        ],
      });
    } catch (openaiErr: unknown) {
      const msg = openaiErr instanceof Error ? openaiErr.message : String(openaiErr);
      console.error("OpenAI API error:", msg);
      return Response.json({ error: `OpenAI error: ${msg}` }, { status: 502 });
    }

    let identified: {
      name: string;
      brand: string | null;
      type: string;
      searchTerms: string[];
      confidence: string;
    };

    try {
      let text = completion.choices[0]?.message?.content ?? "{}";
      // Strip markdown code fences if GPT wraps the response
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      identified = JSON.parse(text);
    } catch {
      const raw = completion.choices[0]?.message?.content ?? "";
      console.error("Could not parse AI response:", raw);
      return Response.json({ error: "Could not parse AI response", raw }, { status: 422 });
    }

    // Search our ingredients DB with the identified terms
    const searchTerms = [
      identified.name,
      ...(identified.searchTerms ?? []),
      ...(identified.brand ? [identified.brand] : []),
    ].filter(Boolean);

    const matches = await prisma.ingredient.findMany({
      where: {
        isActive: true,
        OR: searchTerms.map((term) => ({
          name: { contains: term },
        })),
      },
      include: { supplier: true, inventoryItem: true },
      orderBy: { name: "asc" },
      take: 8,
    });

    return Response.json({ identified, matches });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Vision route unhandled error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
