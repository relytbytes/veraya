import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import OpenAI from "openai";

// POST /api/invoices/extract  { image }
// Full supplier-invoice extraction: vendor, invoice #, date, and every line item
// (description, qty, unit, unit cost, line total) via GPT-4o vision. Each line is
// matched to an existing ingredient and the vendor to an existing supplier;
// totals are validated against the summed line items.

interface RawLine { description: string; quantity: number | null; unit: string | null; unitCost: number | null; lineTotal: number | null }
interface RawInvoice {
  vendor: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  items: RawLine[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
}

// Token-overlap score for fuzzy name matching.
function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2));
}
function bestMatch<T extends { id: string; name: string }>(query: string, pool: T[]): T | null {
  const q = tokens(query);
  if (q.size === 0) return null;
  let best: T | null = null;
  let bestScore = 0;
  for (const item of pool) {
    const it = tokens(item.name);
    let overlap = 0;
    for (const t of q) if (it.has(t)) overlap++;
    const score = overlap / Math.max(1, Math.min(q.size, it.size));
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return bestScore >= 0.5 ? best : null;
}

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
    const { image } = await req.json() as { image?: string };
    if (!image) return Response.json({ error: "image required" }, { status: 400 });

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are reading a restaurant supplier invoice or delivery packing slip. Extract the structured data. Read every line item in the items table.

Return ONLY JSON, no markdown:
{
  "vendor": "supplier/company name on the invoice or null",
  "vendorPhone": "supplier phone or null",
  "vendorEmail": "supplier email or null",
  "vendorAddress": "supplier street address or null",
  "invoiceNumber": "invoice or order number or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "items": [
    { "description": "the product description as printed", "quantity": number or null, "unit": "case|lb|kg|ea|... or null", "unitCost": number or null, "lineTotal": number or null }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null
}
Numbers must be plain (no $ or commas). If a value isn't visible, use null. Do not invent line items.`,
            },
            { type: "image_url", image_url: { url: image, detail: "high" } },
          ],
        },
      ],
    });

    let text = completion.choices[0]?.message?.content ?? "{}";
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const raw = JSON.parse(text) as RawInvoice;
    const items = Array.isArray(raw.items) ? raw.items : [];

    // Match against existing data.
    const [ingredients, suppliers] = await Promise.all([
      prisma.ingredient.findMany({ where: { isActive: true }, select: { id: true, name: true, unit: true } }),
      prisma.supplier.findMany({ select: { id: true, name: true } }),
    ]);

    const matchedSupplier = raw.vendor ? bestMatch(raw.vendor, suppliers) : null;

    const lines = items.map((l) => {
      const match = l.description ? bestMatch(l.description, ingredients) : null;
      return {
        description: l.description ?? "",
        quantity: typeof l.quantity === "number" ? l.quantity : null,
        unit: l.unit ?? null,
        unitCost: typeof l.unitCost === "number" ? l.unitCost
          : (typeof l.lineTotal === "number" && typeof l.quantity === "number" && l.quantity > 0 ? l.lineTotal / l.quantity : null),
        lineTotal: typeof l.lineTotal === "number" ? l.lineTotal : null,
        matchedIngredientId: match?.id ?? null,
        matchedIngredientName: match?.name ?? null,
      };
    });

    // Validate totals: summed line totals vs the printed total.
    const summed = lines.reduce((s, l) => s + (l.lineTotal ?? (l.unitCost ?? 0) * (l.quantity ?? 0)), 0);
    const printedTotal = raw.total ?? raw.subtotal ?? null;
    const totalsMatch = printedTotal != null ? Math.abs(summed - printedTotal) <= Math.max(1, printedTotal * 0.02) : null;

    return Response.json({
      vendor: raw.vendor,
      vendorPhone: raw.vendorPhone ?? null,
      vendorEmail: raw.vendorEmail ?? null,
      vendorAddress: raw.vendorAddress ?? null,
      matchedSupplierId: matchedSupplier?.id ?? null,
      matchedSupplierName: matchedSupplier?.name ?? null,
      invoiceNumber: raw.invoiceNumber,
      invoiceDate: raw.invoiceDate,
      lines,
      matchedCount: lines.filter((l) => l.matchedIngredientId).length,
      subtotal: raw.subtotal,
      tax: raw.tax,
      total: raw.total,
      computedTotal: Math.round(summed * 100) / 100,
      totalsMatch,
    });
  } catch (err) {
    console.error("[/api/invoices/extract]", (err as Error)?.message ?? err);
    return Response.json({ error: "extract_failed" }, { status: 500 });
  }
}
