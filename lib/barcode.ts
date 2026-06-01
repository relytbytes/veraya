// Deep barcode/UPC resolution: validation + a multi-source lookup chain.
// Sources are tried in order until one resolves; the route layer caches results.

export interface ExternalProduct {
  name: string;
  brand: string | null;
  category: string | null;
  quantity: string | null;
  imageUrl: string | null;
}

/** Strip to digits. */
export function normalizeBarcode(raw: string): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Validate a GTIN-8/12/13/14 by length + check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  // From the rightmost data digit, weights alternate 3,1,3,1…
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += digits[i] * w;
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}

function cleanCategory(tag: string | null): string | null {
  if (!tag) return null;
  return tag.replace(/^[a-z]{2}:/, "").replace(/-/g, " ").trim() || null;
}

// ── Sources ─────────────────────────────────────────────────────────────────

async function fromOpenFoodFacts(barcode: string): Promise<ExternalProduct | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,categories_tags,quantity,image_url`,
    { headers: { "User-Agent": "Veraya/1.0 (inventory)" }, signal: AbortSignal.timeout(4500) },
  );
  if (!res.ok) return null;
  const data = await res.json() as { status?: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  const p = data.product as {
    product_name?: string; product_name_en?: string; brands?: string;
    categories_tags?: string[]; quantity?: string; image_url?: string;
  };
  const name = (p.product_name_en || p.product_name || "").trim();
  if (!name) return null;
  return {
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    category: cleanCategory(p.categories_tags?.[0] ?? null),
    quantity: p.quantity ?? null,
    imageUrl: p.image_url ?? null,
  };
}

async function fromUpcItemDb(barcode: string): Promise<ExternalProduct | null> {
  // Free trial endpoint, no key (rate limited). Keyed prod endpoint used if set.
  const key = process.env.UPCITEMDB_KEY;
  const url = key
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(barcode)}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`;
  const res = await fetch(url, {
    headers: key ? { user_key: key, key_type: "3scale" } : {},
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return null;
  const data = await res.json() as { items?: { title?: string; brand?: string; category?: string; images?: string[]; size?: string }[] };
  const item = data.items?.[0];
  if (!item?.title) return null;
  return {
    name: item.title.trim(),
    brand: item.brand?.trim() || null,
    category: item.category ? item.category.split(">").pop()!.trim() : null,
    quantity: item.size?.trim() || null,
    imageUrl: item.images?.[0] ?? null,
  };
}

async function fromGoUpc(barcode: string): Promise<ExternalProduct | null> {
  const key = process.env.GO_UPC_KEY;
  if (!key) return null;
  const res = await fetch(`https://go-upc.com/api/v1/code/${encodeURIComponent(barcode)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(4500),
  });
  if (!res.ok) return null;
  const data = await res.json() as { product?: { name?: string; brand?: string; category?: string; imageUrl?: string } };
  const p = data.product;
  if (!p?.name) return null;
  return { name: p.name.trim(), brand: p.brand?.trim() || null, category: p.category?.trim() || null, quantity: null, imageUrl: p.imageUrl ?? null };
}

/**
 * Resolve a barcode against the source chain. Returns the product + the source
 * that resolved it, or null if every source missed.
 */
export async function lookupBarcodeSources(barcode: string): Promise<{ product: ExternalProduct; source: string } | null> {
  const chain: [string, (b: string) => Promise<ExternalProduct | null>][] = [
    ["off", fromOpenFoodFacts],
    ["upcitemdb", fromUpcItemDb],
    ["go-upc", fromGoUpc],
  ];
  for (const [source, fn] of chain) {
    try {
      const product = await fn(barcode);
      if (product) return { product, source };
    } catch {
      // try the next source
    }
  }
  return null;
}
