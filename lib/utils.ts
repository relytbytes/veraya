import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  // Standard accounting format: negatives render in parentheses, e.g. ($505.00).
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  }).format(num);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Display a quantity without floating-point noise (e.g. 2.0000000000004 → "2").
 *  Rounds to `decimals` places (default 1) and strips trailing zeros. */
export function formatQty(value: number | string | null | undefined, decimals = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(decimals)));
}

/** "14:30" → "2:30 PM" */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function calcFoodCostPercent(cost: number, price: number): number {
  if (price === 0) return 0;
  return (cost / price) * 100;
}
