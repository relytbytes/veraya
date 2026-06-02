import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/beverage-profiles/assign-bins
// Auto-number the bar/cellar BIN list. Two sequences: bottle-service items get a
// "B###" bin, glass-only items get a "G###" bin (BTG vs BTB). Ordering follows
// physical space when storage areas are set (customizable to space), otherwise
// falls back to category + producer (basic shelves). Idempotent: re-running
// renumbers cleanly from the current ordering.
const CATEGORY_ORDER: Record<string, number> = { WINE: 0, BEER: 1, LIQUOR: 2, NA_BEVERAGE: 3 };

export async function POST() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as { role?: string })?.role ?? "";
  if (!["ADMIN", "MANAGER"].includes(role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const profiles = await prisma.beverageProfile.findMany({
    include: { ingredient: { select: { name: true, inventoryItem: { select: { storageArea: true, shelfOrder: true } } } } },
  });

  const ordered = [...profiles].sort((a, b) => {
    const areaA = a.ingredient.inventoryItem?.storageArea ?? "~"; // unplaced sorts last
    const areaB = b.ingredient.inventoryItem?.storageArea ?? "~";
    if (areaA !== areaB) return areaA.localeCompare(areaB);
    const shA = a.ingredient.inventoryItem?.shelfOrder ?? 9999;
    const shB = b.ingredient.inventoryItem?.shelfOrder ?? 9999;
    if (shA !== shB) return shA - shB;
    const catA = CATEGORY_ORDER[a.category] ?? 9; const catB = CATEGORY_ORDER[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    return (a.ingredient.name ?? "").localeCompare(b.ingredient.name ?? "");
  });

  let glass = 0, bottle = 0;
  const pad = (n: number) => String(n).padStart(3, "0");
  const updates = ordered.map((p) => {
    // Bottle service is the primary BIN list; glass-only items get the G series.
    const bin = p.offerBottle ? `B${pad(++bottle)}` : p.offerGlass ? `G${pad(++glass)}` : `B${pad(++bottle)}`;
    return prisma.beverageProfile.update({ where: { id: p.id }, data: { binNumber: bin } });
  });

  await prisma.$transaction(updates);
  return Response.json({ assigned: updates.length, bottle, glass });
}
