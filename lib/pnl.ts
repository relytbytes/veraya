// ─────────────────────────────────────────────────────────────────────────────
// P&L statement model — Capital Grille-style line-item hierarchy.
//
// The statement is a fixed, ordered list of rows. Each row is one of:
//   - header:   a section title (no value)
//   - line:     a value row, either `auto` (derived from POS/inventory/labor data)
//               or `manual` (typed in by a manager and stored in settings JSON)
//   - subtotal: computed by summing other row keys
//   - metric:   a non-dollar operational figure (guest counts, labor hours)
//
// `buildStatement` resolves every row to a dollar value + a % of Net Sales, so
// the API and the page render from one source of truth.
// ─────────────────────────────────────────────────────────────────────────────

export type RowKind = "header" | "line" | "subtotal" | "metric";

export interface PnlRowDef {
  key: string;
  label: string;
  indent: 0 | 1 | 2;
  kind: RowKind;
  input?: "auto" | "manual";   // for `line` rows
  sum?: string[];              // for `subtotal` rows (keys to add)
  subtract?: string[];         // for `subtotal` rows (keys to subtract)
  emphasize?: boolean;         // bold headline subtotal
  isPercentOfSelf?: boolean;   // metric rows aren't %-of-net-sales
}

// Ordered statement definition. Keys are stable identifiers used for storage.
export const PNL_ROWS: PnlRowDef[] = [
  { key: "h_sales", label: "SALES", indent: 0, kind: "header" },
  { key: "food", label: "Food", indent: 1, kind: "line", input: "auto" },
  { key: "appetizers", label: "Appetizers", indent: 1, kind: "line", input: "auto" },
  { key: "desserts", label: "Desserts", indent: 1, kind: "line", input: "auto" },
  { key: "liquor", label: "Liquor", indent: 2, kind: "line", input: "auto" },
  { key: "beer", label: "Beer", indent: 2, kind: "line", input: "auto" },
  { key: "wine", label: "Wine", indent: 2, kind: "line", input: "auto" },
  { key: "naBev", label: "Non-Alcoholic Beverage", indent: 1, kind: "line", input: "auto" },
  { key: "otherSales", label: "Other (merchandise / retail)", indent: 1, kind: "line", input: "manual" },
  { key: "totalGrossSales", label: "TOTAL GROSS SALES", indent: 0, kind: "subtotal",
    sum: ["food", "appetizers", "desserts", "liquor", "beer", "wine", "naBev", "otherSales"] },

  { key: "h_discounts", label: "DISCOUNTS", indent: 0, kind: "header" },
  { key: "comps", label: "Comps", indent: 1, kind: "line", input: "auto" },
  { key: "voids", label: "Voids / Returns", indent: 1, kind: "line", input: "auto" },
  { key: "promoDiscounts", label: "Promotions / Loyalty / Coupons", indent: 1, kind: "line", input: "manual" },
  { key: "totalDiscounts", label: "TOTAL DISCOUNTS", indent: 0, kind: "subtotal",
    sum: ["comps", "voids", "promoDiscounts"] },

  { key: "netSales", label: "NET SALES", indent: 0, kind: "subtotal", emphasize: true,
    sum: ["totalGrossSales"], subtract: ["totalDiscounts"] },

  { key: "h_food_cost", label: "FOOD COST", indent: 0, kind: "header" },
  { key: "foodCost", label: "Food Cost (theoretical)", indent: 1, kind: "line", input: "auto" },
  { key: "totalFoodCost", label: "TOTAL FOOD COST", indent: 0, kind: "subtotal", sum: ["foodCost"] },

  { key: "h_bev_cost", label: "BEVERAGE COST", indent: 0, kind: "header" },
  { key: "bevCost", label: "Beverage Cost (theoretical)", indent: 1, kind: "line", input: "auto" },
  { key: "totalBevCost", label: "TOTAL BEVERAGE COST", indent: 0, kind: "subtotal", sum: ["bevCost"] },

  { key: "costOfSales", label: "COST OF SALES", indent: 0, kind: "subtotal", emphasize: true,
    sum: ["totalFoodCost", "totalBevCost"] },

  { key: "h_direct_labor", label: "DIRECT LABOR", indent: 0, kind: "header" },
  { key: "laborService", label: "Service", indent: 1, kind: "line", input: "auto" },
  { key: "laborBar", label: "Bar", indent: 1, kind: "line", input: "auto" },
  { key: "laborKitchen", label: "Kitchen", indent: 1, kind: "line", input: "auto" },
  { key: "laborOther", label: "Training / Other", indent: 1, kind: "line", input: "manual" },
  { key: "totalDirectLabor", label: "TOTAL DIRECT LABOR", indent: 0, kind: "subtotal", emphasize: true,
    sum: ["laborService", "laborBar", "laborKitchen", "laborOther"] },

  { key: "h_variable", label: "VARIABLE RESTAURANT EXPENSES", indent: 0, kind: "header" },
  { key: "smallwares", label: "Smallwares", indent: 1, kind: "line", input: "manual" },
  { key: "linen", label: "Linen", indent: 1, kind: "line", input: "manual" },
  { key: "cleaning", label: "Cleaning Supplies", indent: 1, kind: "line", input: "manual" },
  { key: "cardFees", label: "Credit / Gift Card Fees", indent: 1, kind: "line", input: "manual" },
  { key: "variableOther", label: "Other Variable", indent: 1, kind: "line", input: "manual" },
  { key: "totalVariable", label: "TOTAL VARIABLE EXPENSES", indent: 0, kind: "subtotal",
    sum: ["smallwares", "linen", "cleaning", "cardFees", "variableOther"] },

  { key: "h_other_rest", label: "OTHER RESTAURANT EXPENSES", indent: 0, kind: "header" },
  { key: "officeSupplies", label: "Office Supplies / Postage", indent: 1, kind: "line", input: "manual" },
  { key: "insurance", label: "Workers Comp / Liability", indent: 1, kind: "line", input: "manual" },
  { key: "employeeIncentives", label: "Employee Incentives", indent: 1, kind: "line", input: "manual" },
  { key: "otherRest", label: "Other", indent: 1, kind: "line", input: "manual" },
  { key: "totalOtherRest", label: "TOTAL OTHER RESTAURANT EXPENSES", indent: 0, kind: "subtotal",
    sum: ["officeSupplies", "insurance", "employeeIncentives", "otherRest"] },

  { key: "h_maint", label: "SITE / BUILDING / EQUIPMENT", indent: 0, kind: "header" },
  { key: "utilities", label: "Utilities", indent: 1, kind: "line", input: "manual" },
  { key: "buildingRepairs", label: "Building / Site Repairs", indent: 1, kind: "line", input: "manual" },
  { key: "equipmentRepairs", label: "Equipment Repairs", indent: 1, kind: "line", input: "manual" },
  { key: "contractServices", label: "Contract Services", indent: 1, kind: "line", input: "manual" },
  { key: "depreciation", label: "Depreciation", indent: 1, kind: "line", input: "manual" },
  { key: "totalMaint", label: "TOTAL SITE / BLDG / EQUIP", indent: 0, kind: "subtotal",
    sum: ["utilities", "buildingRepairs", "equipmentRepairs", "contractServices", "depreciation"] },

  { key: "h_indirect_labor", label: "INDIRECT LABOR", indent: 0, kind: "header" },
  { key: "salary", label: "Management Salary", indent: 1, kind: "line", input: "auto" },
  { key: "bonus", label: "Management Bonus", indent: 1, kind: "line", input: "auto" },
  { key: "indirectOther", label: "Other (taxes, benefits)", indent: 1, kind: "line", input: "manual" },
  { key: "totalIndirectLabor", label: "TOTAL INDIRECT LABOR", indent: 0, kind: "subtotal",
    sum: ["salary", "bonus", "indirectOther"] },

  { key: "otherIndirectOpex", label: "Other Indirect Operating Expenses", indent: 0, kind: "line", input: "manual" },
  { key: "marketing", label: "Marketing Expenses", indent: 0, kind: "line", input: "manual" },

  { key: "performanceEarnings", label: "PERFORMANCE EARNINGS", indent: 0, kind: "subtotal", emphasize: true,
    sum: ["netSales"],
    subtract: ["costOfSales", "totalDirectLabor", "totalVariable", "totalOtherRest", "totalMaint", "totalIndirectLabor", "otherIndirectOpex", "marketing"] },

  { key: "m_guestCounts", label: "Guest Counts", indent: 0, kind: "metric", input: "auto", isPercentOfSelf: true },
  { key: "m_laborHours", label: "Labor Hours", indent: 0, kind: "metric", input: "auto", isPercentOfSelf: true },
  { key: "m_ppa", label: "Per-Person Average ($)", indent: 0, kind: "metric", input: "auto", isPercentOfSelf: true },
];

export interface PnlResolvedRow extends PnlRowDef {
  value: number;
  pct: number | null; // % of net sales (null for headers/metrics)
}

/** Keys that the API auto-fills from operational data. */
export const AUTO_KEYS = PNL_ROWS.filter((r) => r.input === "auto").map((r) => r.key);
/** Keys a manager types in (stored in settings JSON). */
export const MANUAL_KEYS = PNL_ROWS.filter((r) => r.input === "manual").map((r) => r.key);

/**
 * Resolve every row to a value. `values` supplies all leaf (line) numbers —
 * auto values merged with manual entries. Subtotals are computed from `sum`/
 * `subtract`. Percentages are vs Net Sales.
 */
export function buildStatement(values: Record<string, number>): PnlResolvedRow[] {
  const resolved: Record<string, number> = { ...values };

  // First pass: compute subtotals in declaration order (definitions are ordered
  // so every referenced key is resolved before the subtotal that uses it).
  for (const row of PNL_ROWS) {
    if (row.kind === "subtotal") {
      const add = (row.sum ?? []).reduce((s, k) => s + (resolved[k] ?? 0), 0);
      const sub = (row.subtract ?? []).reduce((s, k) => s + (resolved[k] ?? 0), 0);
      resolved[row.key] = add - sub;
    } else if (resolved[row.key] === undefined) {
      resolved[row.key] = 0;
    }
  }

  const netSales = resolved["netSales"] ?? 0;
  return PNL_ROWS.map((row) => {
    const value = resolved[row.key] ?? 0;
    let pct: number | null = null;
    if (row.kind !== "header" && !row.isPercentOfSelf && netSales > 0) {
      pct = value / netSales;
    }
    return { ...row, value, pct };
  });
}
