// One-off data patch: the seeded recipes only model the protein, not the full
// plate build, so costed plates land at an unrealistic 6-20% food cost. Scale
// each costed recipe's line quantities by a single factor so the plate lands at
// a believable, per-item food-cost target (kept varied so the menu-engineering
// matrix has real margin spread). Ingredient proportions are preserved.
//
// Idempotent: re-running converges to the same target (factor -> 1).
// Runs against whatever DATABASE_URL points to (dev.db by default; set
// DATABASE_URL + DATABASE_AUTH_TOKEN to target Turso).

import { prisma } from "@/lib/prisma";

// menu item name -> target food-cost fraction
const TARGETS: Record<string, number> = {
  "Pan-Seared Salmon": 0.36,
  "Grilled Chicken": 0.31,
  "Caesar Salad": 0.27,
  "Pasta Arrabiata": 0.24,
  "Garlic Bread": 0.33,
  "Side Salad": 0.29,
};

async function main() {
  const items = await prisma.menuItem.findMany({
    where: { name: { in: Object.keys(TARGETS) } },
    select: {
      id: true, name: true, price: true,
      recipe: { select: { ingredientId: true, quantity: true, ingredient: { select: { costPerUnit: true } } } },
    },
  });

  for (const item of items) {
    if (item.recipe.length === 0) { console.log(`- ${item.name}: no recipe, skip`); continue; }
    const price = Number(item.price);
    const current = item.recipe.reduce((s, r) => s + Number(r.ingredient.costPerUnit) * Number(r.quantity), 0);
    if (current <= 0) { console.log(`- ${item.name}: zero cost, skip`); continue; }

    const targetCost = price * TARGETS[item.name];
    const factor = targetCost / current;

    for (const line of item.recipe) {
      const newQty = Number(line.quantity) * factor;
      await prisma.recipeIngredient.update({
        where: { menuItemId_ingredientId: { menuItemId: item.id, ingredientId: line.ingredientId } },
        data: { quantity: newQty },
      });
    }

    const newCost = current * factor;
    console.log(`✓ ${item.name.padEnd(20)} $${price.toFixed(2)}  ${current.toFixed(2)} (${((current/price)*100).toFixed(0)}%) -> ${newCost.toFixed(2)} (${(TARGETS[item.name]*100).toFixed(0)}%)  x${factor.toFixed(2)}`);
  }

  await prisma.$disconnect();
}

main();
