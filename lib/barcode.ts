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

/** GTIN check digit for a body of data digits (no check digit included). */
function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = body.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(body[i]) * w;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate a GTIN-8/12/13/14 by length + check digit. */
export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13, 14].includes(code.length)) return false;
  const body = code.slice(0, -1);
  return gtinCheckDigit(body) === Number(code.slice(-1));
}

/**
 * Expand a UPC-E (compressed) barcode to its 12-digit UPC-A form. Small retail
 * items (spice jars, small bottles) use UPC-E, and scanners return the short
 * code — which fails plain GTIN validation. Accepts 6/7/8-digit UPC-E forms.
 * Returns null if it isn't a UPC-E we can expand.
 */
export function upcEToUpcA(code: string): string | null {
  let s = code;
  if (s.length === 8) s = s.slice(1, 7);        // strip number-system + check digit
  else if (s.length === 7) s = s.slice(1);      // strip number-system
  else if (s.length !== 6) return null;
  if (!/^\d{6}$/.test(s)) return null;
  const [a, b, c, d, e, f] = s.split("");
  let mid: string;
  switch (f) {
    case "0": case "1": case "2": mid = `${a}${b}${f}0000${c}${d}${e}`; break;
    case "3": mid = `${a}${b}${c}00000${d}${e}`; break;
    case "4": mid = `${a}${b}${c}${d}00000${e}`; break;
    default:  mid = `${a}${b}${c}${d}${e}0000${f}`; break; // 5–9
  }
  const body = `0${mid}`;                        // number system 0 + 10 digits = 11
  return body + gtinCheckDigit(body);
}

/**
 * Best-effort canonical barcode for lookup: strip to digits, and if it looks
 * like a UPC-E that doesn't already validate as a GTIN, expand it to UPC-A.
 */
export function canonicalBarcode(raw: string): string {
  const digits = normalizeBarcode(raw);
  if (isValidGtin(digits)) return digits;
  // 8-digit could be EAN-8 (already handled above) or UPC-E; 6/7 are UPC-E-ish.
  if ([6, 7, 8].includes(digits.length)) {
    const expanded = upcEToUpcA(digits);
    if (expanded && isValidGtin(expanded)) return expanded;
  }
  return digits;
}

/** Plausible enough to bother hitting the product databases. */
export function isLookupableBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
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
  // Order: Open Food Facts (free, food/beverage) → Go-UPC (keyed, broad retail)
  // → UPCItemDB (keyed prod, or rate-limited trial as a last resort). Go-UPC is
  // ahead of the trial so a keyed lookup resolves fast instead of waiting on the
  // trial's frequent timeouts/429s.
  const chain: [string, (b: string) => Promise<ExternalProduct | null>][] = [
    ["off", fromOpenFoodFacts],
    ["go-upc", fromGoUpc],
    ["upcitemdb", fromUpcItemDb],
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
