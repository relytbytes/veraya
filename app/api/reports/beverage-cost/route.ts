import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const from = fromParam
    ? new Date(fromParam + "T00:00:00")
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);
  const to = toParam ? new Date(toParam + "T23:59:59") : new Date(now);
  to.setHours(23, 59, 59, 999);

  const profiles = await prisma.beverageProfile.findMany({
    include: {
      ingredient: {
        include: {
          inventoryItem: true,
          recipe: {
            include: {
              menuItem: true,
            },
          },
          transactions: {
            where: {
              type: "USED",
              createdAt: { gte: from, lte: to },
            },
          },
        },
      },
    },
    orderBy: [{ category: "asc" }, { ingredient: { name: "asc" } }],
  });

  // Fetch completed order items in date range for theoretical depletion
  const completedOrderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: "COMPLETED",
        createdAt: { gte: from, lte: to },
      },
      voided: false,
    },
    select: {
      menuItemId: true,
      quantity: true,
    },
  });

  // Build a map: menuItemId -> total quantity sold
  const soldQtyMap = new Map<string, number>();
  for (const item of completedOrderItems) {
    soldQtyMap.set(item.menuItemId, (soldQtyMap.get(item.menuItemId) ?? 0) + item.quantity);
  }

  const results = profiles.map((profile) => {
    const ingredient = profile.ingredient;
    const costPerUnit = Number(ingredient.costPerUnit);
    const poursPerBottle = profile.bottleSizeMl / profile.pourSizeMl;
    const costPerPour = costPerUnit / poursPerBottle;

    // Average menu price across items that use this ingredient
    const menuItemPrices = ingredient.recipe.map((ri) => Number(ri.menuItem.price));
    const avgMenuPrice =
      menuItemPrices.length > 0
        ? menuItemPrices.reduce((a, b) => a + b, 0) / menuItemPrices.length
        : 0;

    const pourCostPct = avgMenuPrice > 0 ? (costPerPour / avgMenuPrice) * 100 : 0;

    // Theoretical depletion: sum of (orderItem.quantity * recipeIngredient.quantity)
    // recipeIngredient.quantity is in the ingredient's unit
    let theoreticalDepletedUnits = 0;
    for (const ri of ingredient.recipe) {
      const sold = soldQtyMap.get(ri.menuItemId) ?? 0;
      theoreticalDepletedUnits += sold * Number(ri.quantity);
    }
    // Convert to pours (ingredient unit is bottles or ml — assume unit matches costPerUnit which is per bottle)
    // theoreticalDepleted in pours = theoreticalDepletedUnits * poursPerBottle (if unit is bottles)
    // We report in pours directly
    const theoreticalPours = theoreticalDepletedUnits * poursPerBottle;

    // Actual depletion from USED transactions (in the ingredient's unit = bottles)
    const actualDepletedUnits = ingredient.transactions.reduce(
      (sum, t) => sum + Math.abs(Number(t.quantity)),
      0
    );
    const actualPours = actualDepletedUnits * poursPerBottle;

    const variance = actualPours - theoreticalPours; // positive = over-poured
    const varianceCost = variance * costPerPour;

    const currentQty = ingredient.inventoryItem ? Number(ingredient.inventoryItem.quantity) : 0;
    const currentValueBottles = currentQty * costPerUnit;

    return {
      id: profile.id,
      ingredientId: ingredient.id,
      name: ingredient.name,
      category: profile.category,
      bottleSizeMl: profile.bottleSizeMl,
      pourSizeMl: profile.pourSizeMl,
      producer: profile.producer,
      vintage: profile.vintage,
      abv: profile.abv,
      poursPerBottle,
      costPerBottle: costPerUnit,
      costPerPour,
      pourCostPct,
      avgMenuPrice,
      currentQty,
      currentValueBottles,
      theoreticalPours,
      actualPours,
      variance,
      varianceCost,
      menuItems: ingredient.recipe.map((ri) => ({
        menuItemId: ri.menuItem.id,
        name: ri.menuItem.name,
        price: Number(ri.menuItem.price),
        quantityPerServing: Number(ri.quantity),
      })),
    };
  });

  return Response.json(results);
}
