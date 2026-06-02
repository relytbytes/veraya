"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Loader2, CheckCircle2, ShoppingCart, AlertTriangle,
  TrendingDown, Eye,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReorderSuggestion {
  ingredientId: string;
  inventoryItemId: string;
  ingredientName: string;
  unit: string;
  supplierId: string | null;
  supplierName: string | null;
  currentQty: number;
  minThreshold: number;
  maxThreshold: number | null;
  dailyBurnRate: number;
  suggestedQty: number;
  lastCost: number;
  urgency: "critical" | "low" | "watch";
}

interface SuggestionRow extends ReorderSuggestion {
  editedQty: string;
  included: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const URGENCY_CONFIG = {
  critical: {
    label: "Critical",
    cls: "bg-red-100 text-red-800 border-red-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  low: {
    label: "Low Stock",
    cls: "bg-yellow-100 text-yellow-800 border-yellow-200",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  watch: {
    label: "Watch",
    cls: "bg-blue-100 text-blue-800 border-blue-200",
    icon: <Eye className="h-3 w-3" />,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReorderPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/inventory/reorder-suggestions");
    if (res.ok) {
      const data: ReorderSuggestion[] = await res.json();
      setRows(
        data.map((s) => ({
          ...s,
          editedQty: String(s.suggestedQty),
          included: true,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const criticalCount = rows.filter((r) => r.urgency === "critical").length;
  const lowCount = rows.filter((r) => r.urgency === "low").length;
  const watchCount = rows.filter((r) => r.urgency === "watch").length;

  const selectedRows = rows.filter((r) => r.included);

  const estTotal = selectedRows.reduce((sum, r) => {
    const qty = parseFloat(r.editedQty) || 0;
    return sum + qty * r.lastCost;
  }, 0);

  function toggleAll(checked: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, included: checked })));
  }

  async function createDraftPOs() {
    setCreating(true);
    const items = selectedRows
      .filter((r) => r.supplierId)
      .map((r) => ({
        ingredientId: r.ingredientId,
        qty: parseFloat(r.editedQty) || r.suggestedQty,
        supplierId: r.supplierId!,
        unitCost: r.lastCost,
      }));

    if (items.length === 0) {
      setCreating(false);
      return;
    }

    const res = await fetch("/api/purchase-orders/from-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
    });

    if (res.ok) {
      router.push("/purchasing");
    }
    setCreating(false);
  }

  // Group rows by supplier for display
  const grouped = new Map<string, SuggestionRow[]>();
  for (const row of rows) {
    const key = row.supplierName ?? "No Supplier";
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return (
    <div>
      <Header
        title="Smart Reorder"
        description="Reorder suggestions from Vera, demand-weighted by day-of-week sales"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              disabled={creating || selectedRows.length === 0}
              onClick={createDraftPOs}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Create Draft POs
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-24 text-center text-gray-400">
          <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-400 opacity-80" />
          <p className="font-semibold text-gray-700 text-lg">All stock levels healthy</p>
          <p className="text-sm mt-1">No items need reordering right now.</p>
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Summary bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {criticalCount > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-xl font-bold text-red-700">{criticalCount}</p>
                  <p className="text-xs text-red-500">Critical</p>
                </div>
              </div>
            )}
            {lowCount > 0 && (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-yellow-500 shrink-0" />
                <div>
                  <p className="text-xl font-bold text-yellow-700">{lowCount}</p>
                  <p className="text-xs text-yellow-500">Low Stock</p>
                </div>
              </div>
            )}
            {watchCount > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex items-center gap-3">
                <Eye className="h-5 w-5 text-blue-500 shrink-0" />
                <div>
                  <p className="text-xl font-bold text-blue-700">{watchCount}</p>
                  <p className="text-xs text-blue-500">Watch</p>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-gray-700">{formatCurrency(estTotal)}</p>
                <p className="text-xs text-gray-400">Est. order total</p>
              </div>
            </div>
          </div>

          {/* Select all / deselect */}
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rows.every((r) => r.included)}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded"
              />
              Select all ({rows.length} items)
            </label>
            <span className="text-gray-300">·</span>
            <span>{selectedRows.length} selected</span>
          </div>

          {/* Grouped table */}
          {Array.from(grouped.entries()).map(([supplierName, supplierRows]) => (
            <div key={supplierName} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-gray-700 text-sm">{supplierName}</h3>
                <span className="text-xs text-gray-400">{supplierRows.length} item{supplierRows.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="w-8 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Ingredient</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Current</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Par Level</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Daily Burn</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Suggest</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Last Cost</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-500">Est. Cost</th>
                      <th className="px-3 py-2 font-medium text-gray-500">Urgency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierRows.map((row) => {
                      const urgConfig = URGENCY_CONFIG[row.urgency];
                      const qty = parseFloat(row.editedQty) || 0;
                      const estCost = qty * row.lastCost;
                      return (
                        <tr
                          key={row.ingredientId}
                          className={cn(
                            "border-b border-gray-50 last:border-0",
                            !row.included && "opacity-40"
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={row.included}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.ingredientId === row.ingredientId
                                      ? { ...r, included: e.target.checked }
                                      : r
                                  )
                                )
                              }
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{row.ingredientName}</p>
                            <p className="text-xs text-gray-400">{row.unit}</p>
                          </td>
                          <td className={cn("px-3 py-2.5 text-right font-mono", row.currentQty <= 0 ? "text-red-600 font-bold" : "text-gray-700")}>
                            {row.currentQty.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                            {row.minThreshold.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-gray-500">
                            {row.dailyBurnRate > 0 ? row.dailyBurnRate.toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              value={row.editedQty}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.ingredientId === row.ingredientId
                                      ? { ...r, editedQty: e.target.value }
                                      : r
                                  )
                                )
                              }
                              className="w-20 text-right text-sm h-7 ml-auto"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600">
                            {formatCurrency(row.lastCost)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-700">
                            {formatCurrency(estCost)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium w-fit", urgConfig.cls)}>
                              {urgConfig.icon}
                              {urgConfig.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Bottom action bar */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              {selectedRows.length} item{selectedRows.length !== 1 ? "s" : ""} selected · Est. total: <span className="font-semibold text-gray-700">{formatCurrency(estTotal)}</span>
            </p>
            <Button
              disabled={creating || selectedRows.length === 0}
              onClick={createDraftPOs}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Create Draft POs
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
