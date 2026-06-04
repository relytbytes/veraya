import { prisma } from "@/lib/prisma";

/**
 * Deplete ingredient inventory for a set of order items that were just fired
 * to the kitchen/bar. This is the single source of truth for consumption:
 * call it wherever items transition to fired (order creation, fire-held,
 * add-items). Items with no costed recipe simply contribute nothing.
 *
 * Best-effort and never throws — inventory tracking must not be able to break
 * order entry. Aggregates per ingredient so one transaction covers the batch,
 * and writes a USED InventoryTransaction for the audit/variance trail.
 */
export async function depleteForFiredItems(
  firedItems: { menuItemId: string; quantity: number }[],
  opts: { orderId: string; userId?: string | null },
): Promise<void> {
  try {
    if (!firedItems.length) return;

    const menuItemIds = [...new Set(firedItems.map((i) => i.menuItemId))];
    const recipes = await prisma.recipeIngredient.findMany({
      where: { menuItemId: { in: menuItemIds } },
      select: { menuItemId: true, ingredientId: true, quantity: true },
    });
    if (!recipes.length) return;

    // Sum the deduction per ingredient across every fired item.
    const byIngredient = new Map<string, number>();
    for (const item of firedItems) {
      for (const r of recipes) {
        if (r.menuItemId !== item.menuItemId) continue;
        const add = Number(r.quantity) * item.quantity;
        byIngredient.set(r.ingredientId, (byIngredient.get(r.ingredientId) ?? 0) + add);
      }
    }
    const deductions = [...byIngredient.entries()]
      // Round to 4 dp so stock doesn't accumulate float artifacts (…9999999).
      .map(([ingredientId, qty]) => ({ ingredientId, qty: Math.round(qty * 10000) / 10000 }))
      .filter((d) => d.qty > 0);
    if (!deductions.length) return;

    const tag = `Fired — Order #${opts.orderId.slice(-6).toUpperCase()}`;
    await prisma.$transaction([
      ...deductions.map(({ ingredientId, qty }) =>
        prisma.inventoryItem.updateMany({
          where: { ingredientId },
          data: { quantity: { decrement: qty } },
        }),
      ),
      ...deductions.map(({ ingredientId, qty }) =>
        prisma.inventoryTransaction.create({
          data: {
            ingredientId,
            quantity: -qty,
            type: "USED",
            notes: tag,
            userId: opts.userId ?? null,
          },
        }),
      ),
    ]);
  } catch (err) {
    console.error("[depleteForFiredItems] non-fatal:", (err as Error)?.message ?? err);
  }
}

/**
 * Inverse of depleteForFiredItems — return recipe ingredients to stock when a
 * FIRED item is voided (rung in error / double ring, so it shouldn't have been
 * made). Writes a RETURNED InventoryTransaction for the variance trail.
 *
 * NOTE: only for VOIDs, not comps. A comped item WAS made and given away, so its
 * ingredients are genuinely consumed and must stay in COGS.
 *
 * Best-effort and never throws.
 */
export async function restoreForVoidedItems(
  items: { menuItemId: string; quantity: number }[],
  opts: { orderId: string; userId?: string | null },
): Promise<void> {
  try {
    if (!items.length) return;

    const menuItemIds = [...new Set(items.map((i) => i.menuItemId))];
    const recipes = await prisma.recipeIngredient.findMany({
      where: { menuItemId: { in: menuItemIds } },
      select: { menuItemId: true, ingredientId: true, quantity: true },
    });
    if (!recipes.length) return;

    const byIngredient = new Map<string, number>();
    for (const item of items) {
      for (const r of recipes) {
        if (r.menuItemId !== item.menuItemId) continue;
        const add = Number(r.quantity) * item.quantity;
        byIngredient.set(r.ingredientId, (byIngredient.get(r.ingredientId) ?? 0) + add);
      }
    }
    const additions = [...byIngredient.entries()]
      .map(([ingredientId, qty]) => ({ ingredientId, qty: Math.round(qty * 10000) / 10000 }))
      .filter((d) => d.qty > 0);
    if (!additions.length) return;

    const tag = `Voided — Order #${opts.orderId.slice(-6).toUpperCase()}`;
    await prisma.$transaction([
      ...additions.map(({ ingredientId, qty }) =>
        prisma.inventoryItem.updateMany({
          where: { ingredientId },
          data: { quantity: { increment: qty } },
        }),
      ),
      ...additions.map(({ ingredientId, qty }) =>
        prisma.inventoryTransaction.create({
          data: { ingredientId, quantity: qty, type: "RETURNED", notes: tag, userId: opts.userId ?? null },
        }),
      ),
    ]);
  } catch (err) {
    console.error("[restoreForVoidedItems] non-fatal:", (err as Error)?.message ?? err);
  }
}
