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
  varietal: string | null;      // grape / expression / style (Pinot Noir, Blanco, IPA)
  vintage: string | null;       // year for wine; null otherwise
  region: string | null;        // appellation / region (Santa Maria Valley, Napa)
  vineyard: string | null;      // single-vineyard / block designation if printed
  country: string | null;       // country of origin if inferable
  abv: number | null;           // alcohol % by volume
  bottleSizeMl: number | null;  // 375 / 750 / 1000 / 1750 etc.
  pourSizeMl: number | null;    // sensible default pour for the category
  confidence: "high" | "medium" | "low";
}

const SYSTEM = `You are a sommelier reading a photo of a single beverage container (wine/liquor/beer/non-alcoholic) OR a case/box label, returning structured data for a bar inventory system. Read EVERY line of text on the label, including small print. Respond ONLY with JSON matching:
{"name":string,"category":"WINE"|"LIQUOR"|"BEER"|"NA_BEVERAGE","producer":string|null,"varietal":string|null,"vintage":string|null,"region":string|null,"vineyard":string|null,"country":string|null,"abv":number|null,"bottleSizeMl":number|null,"pourSizeMl":number|null,"confidence":"high"|"medium"|"low"}
Rules:
- name: the full, human product name combining producer + vintage + varietal/expression as a sommelier would list it, e.g. "Foxen 2018 Pinot Noir Block 8 Bien Nacido Vineyard", "Caymus Cabernet Sauvignon", "Tito's Handmade Vodka". No marketing taglines.
- producer: the winery / distillery / brewery brand (e.g. "Foxen").
- varietal: the grape or style (e.g. "Pinot Noir", "Cabernet Sauvignon", "IPA", "Blanco"). null if not shown.
- vintage: 4-digit year for wine if printed anywhere on the label, else null. Look carefully — it is often small.
- region: appellation / AVA / region printed (e.g. "Santa Maria Valley", "Napa Valley"). null if absent.
- vineyard: single-vineyard or block name if printed (e.g. "Bien Nacido Vineyard", "Block 8"). null if absent.
- country: country of origin if shown or clearly inferable from the region, else null.
- category: WINE for still/sparkling wine; LIQUOR for spirits; BEER for beer/cider/seltzer; NA_BEVERAGE for non-alcoholic.
- abv: number only (13.5 not "13.5%"); null if not visible.
- bottleSizeMl: read the printed volume; if absent, best standard guess (wine/spirits 750, beer 355).
- pourSizeMl: typical service pour — wine 148, beer 355, liquor 44, NA 355.
- confidence reflects how clearly you could read the label. Never invent details you cannot see — use null.`;

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
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this beverage label carefully — including the small print — and extract every field." },
            // "high" detail keeps full resolution so fine print (vintage, vineyard, region) is legible.
            { type: "image_url", image_url: { url: image, detail: "high" } },
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
