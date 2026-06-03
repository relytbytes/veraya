import { getPublicBrand } from "@/lib/brand";

// GET /api/public/brand — guest-facing brand identity (no auth) for public
// pages to render the restaurant's name/color/logo.
export async function GET() {
  const brand = await getPublicBrand();
  return Response.json(brand, { headers: { "Cache-Control": "public, max-age=300" } });
}
