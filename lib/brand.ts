import { prisma } from "./prisma";

// Guest-facing brand identity for public pages (waitlist, booking, ordering).
// Driven by RestaurantSettings so each restaurant/group can set their own name,
// accent color, and logo later. Defaults to Tyler's Test Kitchen for now.

export interface PublicBrand {
  name: string;
  color: string;   // accent (hex)
  logoUrl: string; // circle mark
}

export const DEFAULT_BRAND: PublicBrand = {
  name: "Tyler's Test Kitchen",
  color: "#21A090",
  logoUrl: "/veraya-icon.png",
};

export async function getPublicBrand(): Promise<PublicBrand> {
  try {
    const rows = await prisma.restaurantSettings.findMany({
      where: { key: { in: ["restaurantName", "brandColor", "brandLogoUrl"] } },
    });
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value?.trim() || ""]));
    return {
      name: m.restaurantName || DEFAULT_BRAND.name,
      color: m.brandColor || DEFAULT_BRAND.color,
      logoUrl: m.brandLogoUrl || DEFAULT_BRAND.logoUrl,
    };
  } catch {
    return DEFAULT_BRAND;
  }
}
