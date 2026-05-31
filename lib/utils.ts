import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function calcFoodCostPercent(cost: number, price: number): number {
  if (price === 0) return 0;
  return (cost / price) * 100;
}
