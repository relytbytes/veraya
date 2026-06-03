import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { getOpenAI, OPENAI_MODEL } from "@/lib/openai";

// POST /api/beverage-profiles/scan-label
// Body: { image: "data:image/jpeg;base64,..." }
//
// Vision extraction of a single bottle/can label into beverage-profile fields.
// Used by the Add Beverage Item screen's "Scan label" capture so staff can
// photograph a bottle instead of typing producer / vintage / ABV / size.
//
// Returns: { ok: true, data: ScannedBeverage } | { ok: false, error }

export interface ScannedBeverage {
  name: string;                 // clean product name (producer + varietal/expression)
  category: "WINE" | "LIQUOR" | "BEER" | "NA_BEVERAGE";
  producer: string | null;      // winery / distillery / brewery
  vintage: string | null;       // year for wine; null otherwise
  abv: number | null;           // alcohol % by volume
  bottleSizeMl: number | null;  // 375 / 750 / 1000 / 1750 etc.
  pourSizeMl: number | null;    // sensible default pour for the category
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `You read a photo of a single beverage container (wine/liquor/beer/non-alcoholic) and return structured data for a bar inventory system. Respond ONLY with JSON matching:
{"name":string,"category":"WINE"|"LIQUOR"|"BEER"|"NA_BEVERAGE","producer":string|null,"vintage":string|null,"abv":number|null,"bottleSizeMl":number|null,"pourSizeMl":number|null,"confidence":"high"|"medium"|"low"}
Rules:
- name: clean and human ("Caymus Cabernet Sauvignon", "Tito's Handmade Vodka"). No marketing text.
- category: WINE for still/sparkling wine; LIQUOR for spirits; BEER for beer/cider/seltzer; NA_BEVERAGE for non-alcoholic.
- vintage: 4-digit year only for wine if printed, else null.
- abv: number only (13.5 not "13.5%"); null if not visible.
- bottleSizeMl: read the printed volume; if absent, best standard guess (wine/spirits 750, beer 355).
- pourSizeMl: typical service pour — wine 148, beer 355, liquor 44, NA 355.
- confidence reflects how clearly you could read the label.`;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const openai = getOpenAI();
  if (!openai) return Response.json({ ok: false, error: "AI scanning is not configured (no OPENAI_API_KEY)." }, { status: 503 });

  const { image } = await req.json() as { image?: string };
  if (!image?.startsWith("data:image/")) {
    return Response.json({ ok: false, error: "image must be a base64 data URL" }, { status: 400 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL.includes("mini") ? "gpt-4o" : OPENAI_MODEL, // need a vision-capable model
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the beverage fields from this label." },
            { type: "image_url", image_url: { url: image, detail: "low" } },
          ],
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return Response.json({ ok: false, error: "No response from model" }, { status: 502 });
    const data = JSON.parse(raw) as ScannedBeverage;
    return Response.json({ ok: true, data });
  } catch (err) {
    console.error("[scan-label] failed:", (err as Error)?.message ?? err);
    return Response.json({ ok: false, error: "Could not read the label. Try a clearer photo or enter details manually." }, { status: 502 });
  }
}
