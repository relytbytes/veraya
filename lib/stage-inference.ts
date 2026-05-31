/**
 * Automatic service-stage inference from fired order items.
 *
 * The POS calls this any time items are sent/fired to the kitchen so the host
 * stand always reflects the actual course without any manual updates.
 *
 * Stage progression (only advances, never retreats):
 *   SEATED → APPS → ENTREES → DESSERT → CHECK_DROPPED → CHECK_PAID → BUSSING
 */

export const STAGE_ORDER = [
  "SEATED", "APPS", "ENTREES", "DESSERT",
  "CHECK_DROPPED", "CHECK_PAID", "BUSSING",
] as const;

export type ServiceStage = typeof STAGE_ORDER[number];

/** Patterns that map category names to a course bucket */
const STARTER_RE  = /app|starter|small\s*plate|snack|soup|salad|share|tapa|antipa|amuse|bread|charcuter/i;
const ENTREE_RE   = /entree|main|burger|pasta|steak|seafood|sandwich|pizza|meat|poultry|chicken|fish|pork|beef|lamb|ribs|chop|grill|roast|noodle|risotto|curry|bbq/i;
const DESSERT_RE  = /dessert|sweet|cake|ice.?cream|gelato|sorbet|pudding|tart|pie|cookie|brownie|fondue/i;

type ItemForInference = {
  heldForFire: boolean;
  voided: boolean;
  menuItem: { category: { name: string } } | null;
};

/**
 * Given all items of an order, return the inferred service stage.
 * Returns null if there are no items to infer from.
 */
export function inferStageFromItems(items: ItemForInference[]): ServiceStage | null {
  // Only consider items that have actually been sent to the kitchen
  const fired = items.filter(i => !i.voided && !i.heldForFire);
  if (fired.length === 0) return null; // Nothing fired yet — keep current stage

  let hasDessert = false;
  let hasEntree  = false;
  let hasStarter = false;

  for (const item of fired) {
    const cat = (item.menuItem?.category?.name ?? "").trim();
    if (DESSERT_RE.test(cat)) { hasDessert = true; break; } // Dessert is highest — short-circuit
    if (ENTREE_RE.test(cat))  hasEntree  = true;
    if (STARTER_RE.test(cat)) hasStarter = true;
  }

  if (hasDessert) return "DESSERT";
  if (hasEntree)  return "ENTREES";
  if (hasStarter) return "APPS";

  // All fired items are drinks, sides, or uncategorised — treat as APPS minimum
  return "APPS";
}

/**
 * Given a current stage and an inferred stage, return the stage we should
 * write to the database (only advances forward in the STAGE_ORDER array).
 * Returns null when no update is needed.
 */
export function advanceStage(
  currentStage: string | null,
  inferred: ServiceStage | null,
): ServiceStage | null {
  if (!inferred) return null;

  const currentIdx = currentStage ? STAGE_ORDER.indexOf(currentStage as ServiceStage) : -1;
  const inferredIdx = STAGE_ORDER.indexOf(inferred);

  // Don't advance past CHECK_DROPPED — that requires a deliberate host action
  if (inferredIdx > currentIdx && inferredIdx <= STAGE_ORDER.indexOf("DESSERT")) {
    return inferred;
  }
  return null;
}
