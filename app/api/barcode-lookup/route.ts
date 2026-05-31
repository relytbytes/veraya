import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  categories_tags?: string[];
  quantity?: string;
  image_url?: string;
}

interface ExternalProduct {
  name: string;
  brand: string | null;
  category: string | null;
  quantity: string | null;
  imageUrl: string | null;
}

// GET /api/barcode-lookup?barcode=012345678901
// 1. Checks local ingredients DB
// 2. If not found, queries Open Food Facts (free, no key required)
// Returns: { barcode, local: Ingredient | null, external: ExternalProduct | null }
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode");

  if (!barcode) {
    return Response.json({ error: "barcode param required" }, { status: 400 });
  }

  // 1 ── Local DB lookup
  const local = await prisma.ingredient.findFirst({
    where: { barcode, isActive: true },
    include: { supplier: true, inventoryItem: true },
  });

  if (local) {
    return Response.json({ barcode, local, external: null });
  }

  // 2 ── Open Food Facts lookup (free, no API key)
  let external: ExternalProduct | null = null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { "User-Agent": "RestaurantOps/1.0" },
        signal: AbortSignal.timeout(4000),
      }
    );

    if (res.ok) {
      const data = await res.json() as { status: number; product?: OpenFoodFactsProduct };
      if (data.status === 1 && data.product) {
        const p = data.product;
        const rawName = p.product_name_en || p.product_name || "";
        const name = rawName.trim();
        if (name) {
          external = {
            name,
            brand: p.brands?.split(",")[0]?.trim() || null,
            category: cleanCategory(p.categories_tags?.[0] ?? null),
            quantity: p.quantity ?? null,
            imageUrl: p.image_url ?? null,
          };
        }
      }
    }
  } catch {
    // Timeout or network error — just return null external
  }

  // 3 ── If external found, also try to match existing ingredients by name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let suggestions: any[] = [];
  if (external) {
    const terms = [external.name, external.brand].filter(Boolean) as string[];
    const rawSuggestions = await prisma.ingredient.findMany({
      where: {
        isActive: true,
        OR: terms.flatMap((t) => [
          { name: { contains: t } },
        ]),
      },
      include: { supplier: true, inventoryItem: true },
      take: 5,
      orderBy: { name: "asc" },
    });
    suggestions = rawSuggestions;
  }

  return Response.json({ barcode, local: null, external, suggestions });
}

function cleanCategory(tag: string | null): string | null {
  if (!tag) return null;
  // OFF tags look like "en:beverages" — strip prefix and format
  return tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ");
}
