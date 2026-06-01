import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { normalizeBarcode, isValidGtin, lookupBarcodeSources, type ExternalProduct } from "@/lib/barcode";

// GET /api/barcode-lookup?barcode=012345678901
// 1. Local ingredients DB (already-known barcode)
// 2. Cache (BarcodeCache; positive + negative, 30-day TTL)
// 3. Source chain: Open Food Facts → UPCitemdb → Go-UPC (keyed)
// Returns: { barcode, valid, local, external, source, suggestions, aiFallback }
//   aiFallback=true tells the client to offer photo (AI vision) identification.

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("barcode");
  if (!raw) return Response.json({ error: "barcode param required" }, { status: 400 });

  const barcode = normalizeBarcode(raw);
  const valid = isValidGtin(barcode);

  // 1 ── Local DB (a barcode already attached to one of our ingredients)
  const local = await prisma.ingredient.findFirst({
    where: { barcode, isActive: true },
    include: { supplier: true, inventoryItem: true },
  });
  if (local) return Response.json({ barcode, valid, local, external: null, source: "local", suggestions: [] });

  // Don't waste source calls on a malformed scan.
  if (!valid) {
    return Response.json({ barcode, valid: false, local: null, external: null, source: null, suggestions: [], aiFallback: true });
  }

  // 2 ── Cache (positive and negative)
  let external: ExternalProduct | null = null;
  let source: string | null = null;
  const cached = await prisma.barcodeCache.findUnique({ where: { barcode } });
  const fresh = cached && Date.now() - new Date(cached.fetchedAt).getTime() < TTL_MS;

  if (fresh) {
    if (cached!.found) {
      external = { name: cached!.name ?? "", brand: cached!.brand, category: cached!.category, quantity: cached!.quantity, imageUrl: cached!.imageUrl };
      source = cached!.source ?? "cache";
    }
  } else {
    // 3 ── Resolve against the source chain and cache the outcome.
    const hit = await lookupBarcodeSources(barcode);
    external = hit?.product ?? null;
    source = hit?.source ?? null;
    try {
      await prisma.barcodeCache.upsert({
        where: { barcode },
        create: { barcode, found: !!external, name: external?.name, brand: external?.brand, category: external?.category, quantity: external?.quantity, imageUrl: external?.imageUrl, source },
        update: { found: !!external, name: external?.name, brand: external?.brand, category: external?.category, quantity: external?.quantity, imageUrl: external?.imageUrl, source, fetchedAt: new Date() },
      });
    } catch { /* cache write is best-effort */ }
  }

  // 4 ── Suggest existing ingredients that look like the resolved product.
  let suggestions: Awaited<ReturnType<typeof prisma.ingredient.findMany>> = [];
  if (external) {
    const terms = [external.name, external.brand].filter(Boolean) as string[];
    suggestions = await prisma.ingredient.findMany({
      where: { isActive: true, OR: terms.map((t) => ({ name: { contains: t } })) },
      include: { supplier: true, inventoryItem: true },
      take: 5,
      orderBy: { name: "asc" },
    });
  }

  return Response.json({
    barcode,
    valid,
    local: null,
    external,
    source,
    suggestions,
    // When the barcode is valid but no database knew it, the scanner should offer
    // AI photo identification (/api/vision) as the fallback.
    aiFallback: !external,
  });
}
