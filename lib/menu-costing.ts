// ─── Menu costing & engineering classification ─────────────────────────────────
//
// One source of truth for how a plate's cost, food-cost %, and gross margin are
// derived, plus the menu-engineering matrix (star / plowhorse / puzzle / dog).
//
// Why this exists: when a menu item has no costed recipe, a naive "cost = sum of
// recipe lines" returns $0, which inflates margin to ~100% and makes the matrix
// meaningless. Real plates run roughly 20-40% food cost. So when a recipe is
// missing we estimate cost from a sensible per-category food-cost %. A real
// recipe always overrides the estimate.

// Healthy gross margin floor. An item at or above this margin (food cost at or
// below ~35%) is objectively profitable and must never be labeled low-profit,
// regardless of where the menu median lands. This is the guardrail that keeps a
// genuinely strong item (say an 83% margin) from being branded a "dog" just for
// sitting in the bottom half of an already-healthy menu.
export const HEALTHY_MARGIN_PCT = 65;

// Default food-cost % by category, used only when an item has no costed recipe.
// Beverages cost the least to pour; entrees the most to plate.
export function defaultFoodCostPct(categoryName: string): number {
  const n = (categoryName ?? "").toLowerCase();
  if (/(beverage|drink|\bbar\b|wine|beer|cocktail|soda|coffee|tea|juice)/.test(n)) return 0.22;
  if (/(dessert|sweet|pastr|cake|gelato|ice cream)/.test(n)) return 0.25;
  if (/(app|starter|small|side|salad|soup|snack)/.test(n)) return 0.30;
  if (/(entree|entrée|main|dinner|plate|special|pasta|steak|seafood|fish)/.test(n)) return 0.33;
  return 0.32;
}

export interface ItemCosting {
  /** Dollar cost of the plate. */
  cost: number;
  /** Food cost as a percent of price (0-100). */
  costPct: number;
  /** Gross margin as a percent of price (0-100). */
  marginPct: number;
  /** True when cost was inferred from the category default (no costed recipe). */
  estimated: boolean;
}

/**
 * Compute a menu item's cost / food-cost % / gross margin. Uses the real recipe
 * cost when present; otherwise estimates from the category default so margins
 * stay honest (never a fake ~100%).
 */
export function costMenuItem(args: {
  price: number;
  categoryName: string;
  /** Sum of recipe line costs (costPerUnit * quantity). 0 or undefined if none. */
  recipeCost?: number;
  /** Whether the item has any recipe lines at all. */
  hasRecipe: boolean;
}): ItemCosting {
  const price = Number(args.price) || 0;
  const recipeCost = Number(args.recipeCost) || 0;

  let cost: number;
  let estimated: boolean;
  if (args.hasRecipe && recipeCost > 0) {
    cost = recipeCost;
    estimated = false;
  } else {
    cost = price * defaultFoodCostPct(args.categoryName);
    estimated = true;
  }

  const costPct = price > 0 ? (cost / price) * 100 : 0;
  const marginPct = price > 0 ? ((price - cost) / price) * 100 : 0;
  return { cost, costPct, marginPct, estimated };
}

export type EngineeringKlass = "star" | "plowhorse" | "puzzle" | "dog";

/**
 * Menu-engineering matrix: popularity x profitability, split at the menu median
 * (the standard Kasavana-Smith approach), with one guardrail: an item at or
 * above HEALTHY_MARGIN_PCT always counts as high-profit even if it sits below
 * the median, so an objectively profitable item is never called a dog/plowhorse.
 */
export function classifyMenuItem(args: {
  units: number;
  marginPct: number;
  medianUnits: number;
  medianMargin: number;
}): EngineeringKlass {
  const popular = args.units >= args.medianUnits;
  const highMargin = args.marginPct >= args.medianMargin || args.marginPct >= HEALTHY_MARGIN_PCT;
  if (popular && highMargin) return "star";
  if (popular && !highMargin) return "plowhorse";
  if (!popular && highMargin) return "puzzle";
  return "dog";
}

export type MarginTier = "good" | "watch" | "low";

/**
 * Bucket a gross margin into a health tier for coloring. Tuned to realistic
 * food-cost bands: <=35% food cost (>=65% margin) is good, 35-45% is watch,
 * >45% food cost is low.
 */
export function marginTier(marginPct: number): MarginTier {
  if (marginPct >= HEALTHY_MARGIN_PCT) return "good";
  if (marginPct >= 55) return "watch";
  return "low";
}
