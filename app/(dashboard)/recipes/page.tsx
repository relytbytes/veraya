"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Trash2, Loader2, Check, Sparkles, ChevronRight, X, CheckCircle2, SkipForward, AlertCircle } from "lucide-react";
import { VeraSpark } from "@/components/brand/vera-mark";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { costMenuItem, classifyMenuItem, marginTier, type ItemCosting } from "@/lib/menu-costing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: string;
}

interface RecipeIngredient {
  ingredientId: string;
  quantity: string | number;
  ingredient: Ingredient;
}

interface Category {
  id: string;
  name: string;
}

interface MenuItem {
  id: string;
  name: string;
  price: string;
  categoryId: string;
  category: Category;
  recipe: RecipeIngredient[];
}

interface ReportItem {
  menuItemId: string;
  name: string;
  units: number;
  revenue: number;
}

interface ReportResponse {
  enrichedTopItems: ReportItem[];
}

type EngineeringClass = "star" | "plowhorse" | "puzzle" | "dog" | null;

// ── Vera suggestion types ───────────────────────────────────────────────────────

interface SuggestIngredient {
  ingredientId: string;
  quantity: number;
  unit: string;
  name: string;
  costPerUnit: number;
  lineCost: number;
}

interface SuggestResult {
  ingredients: SuggestIngredient[];
  plateCost: number;
  costPct: number;
  notes: string;
}

// ─── Pure cost helpers ─────────────────────────────────────────────────────────

function plateCost(recipe: RecipeIngredient[]): number {
  return recipe.reduce(
    (sum, r) => sum + Number(r.ingredient.costPerUnit) * Number(r.quantity),
    0
  );
}

// Costing for a menu item. Uses the real recipe when present; otherwise falls
// back to a category-default food-cost % so margins stay honest (never ~100%).
function itemCosting(item: MenuItem): ItemCosting {
  return costMenuItem({
    price: Number(item.price),
    categoryName: item.category?.name ?? "",
    recipeCost: plateCost(item.recipe),
    hasRecipe: item.recipe.length > 0,
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function EngineeringBadge({ cls }: { cls: EngineeringClass }) {
  if (!cls) return null;
  const map: Record<NonNullable<EngineeringClass>, { label: string; className: string }> = {
    star:      { label: "⭐ Star",      className: "bg-green-100 text-green-800 border-green-200" },
    plowhorse: { label: "🐎 Plowhorse", className: "bg-warning-100 text-warning-800 border-warning-200" },
    puzzle:    { label: "🧩 Puzzle",    className: "bg-blue-100 text-blue-800 border-blue-200" },
    dog:       { label: "🐕 Dog",       className: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  const { label, className } = map[cls];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      {label}
    </span>
  );
}

function MarginChip({ pct, estimated }: { pct: number; estimated?: boolean }) {
  const tier = marginTier(pct);
  const color =
    tier === "good" ? "bg-green-100 text-green-800" :
    tier === "watch" ? "bg-warning-100 text-warning-800" :
    "bg-red-100 text-red-800";
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", color)}
      title={estimated ? "Estimated from category default (no costed recipe yet)" : undefined}
    >
      {pct.toFixed(0)}%{estimated ? "*" : ""}
    </span>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function RecipesPage() {
  // Data
  const [items, setItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [salesMap, setSalesMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Right-panel state
  const [localRecipe, setLocalRecipe] = useState<RecipeIngredient[]>([]);
  const [editPrice, setEditPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSaved, setPriceSaved] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeSaved, setRecipeSaved] = useState(false);
  const [addIngId, setAddIngId] = useState("");
  const [addQty, setAddQty] = useState("");

  // ── Vera suggest state ──────────────────────────────────────────────────────
  const [suggestMode, setSuggestMode] = useState(false);
  const [suggestSelected, setSuggestSelected] = useState<Set<string>>(new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestResults, setSuggestResults] = useState<Record<string, SuggestResult>>({});
  const [suggestEdited, setSuggestEdited] = useState<Record<string, SuggestIngredient[]>>({});
  const [suggestApproved, setSuggestApproved] = useState<Set<string>>(new Set());
  const [suggestSkipped, setSuggestSkipped] = useState<Set<string>>(new Set());
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [savingApproved, setSavingApproved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [reviewItemId, setReviewItemId] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setLoading(true);

      const today = new Date();
      const from = new Date(today);
      from.setDate(from.getDate() - 30);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);

      const [menuRes, ingsRes, catsRes, reportsRes] = await Promise.all([
        fetch("/api/menu?active=false"),
        fetch("/api/ingredients"),
        fetch("/api/categories"),
        fetch(`/api/reports?from=${fmt(from)}&to=${fmt(today)}`),
      ]);

      if (menuRes.ok) setItems(await menuRes.json());
      if (ingsRes.ok) setIngredients(await ingsRes.json());
      if (catsRes.ok) setCategories(await catsRes.json());
      if (reportsRes.ok) {
        const data: ReportResponse = await reportsRes.json();
        const m = new Map<string, number>();
        for (const t of data.enrichedTopItems) {
          m.set(t.menuItemId, Number(t.units));
        }
        setSalesMap(m);
      }

      setLoading(false);
    }
    load();
  }, []);

  // ── Engineering classification ────────────────────────────────────────────

  function classify(item: MenuItem): EngineeringClass {
    if (!salesMap.has(item.id)) return null;

    const allWithSales = items.filter((i) => salesMap.has(i.id));
    if (allWithSales.length === 0) return null;

    const unitValues = allWithSales.map((i) => salesMap.get(i.id) ?? 0);
    const marginValues = allWithSales.map((i) => itemCosting(i).marginPct);

    const medUnits = median(unitValues);
    const medMargin = median(marginValues);

    return classifyMenuItem({
      units: salesMap.get(item.id) ?? 0,
      marginPct: itemCosting(item).marginPct,
      medianUnits: medUnits,
      medianMargin: medMargin,
    });
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || i.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  // ── Selection handling ────────────────────────────────────────────────────

  function selectItem(item: MenuItem) {
    setSelectedId(item.id);
    setLocalRecipe(
      item.recipe.map((r) => ({
        ...r,
        quantity: Number(r.quantity),
      }))
    );
    setEditPrice(String(Number(item.price)));
    setRecipeSaved(false);
    setPriceSaved(false);
    setAddIngId("");
    setAddQty("");
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  // ── Price save ────────────────────────────────────────────────────────────

  async function savePrice() {
    if (!selectedItem) return;
    setSavingPrice(true);
    await fetch(`/api/menu/${selectedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: parseFloat(editPrice) }),
    });
    setSavingPrice(false);
    setPriceSaved(true);
    setItems((prev) =>
      prev.map((i) =>
        i.id === selectedItem.id ? { ...i, price: String(parseFloat(editPrice)) } : i
      )
    );
    setTimeout(() => setPriceSaved(false), 2000);
  }

  // ── Recipe save ───────────────────────────────────────────────────────────

  async function saveRecipe() {
    if (!selectedItem) return;
    setSavingRecipe(true);
    const payload = {
      recipe: localRecipe.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: Number(r.quantity),
      })),
    };
    await fetch(`/api/menu/${selectedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSavingRecipe(false);
    setRecipeSaved(true);
    setItems((prev) =>
      prev.map((i) =>
        i.id === selectedItem.id ? { ...i, recipe: localRecipe } : i
      )
    );
    setTimeout(() => setRecipeSaved(false), 2000);
  }

  // ── Add ingredient ────────────────────────────────────────────────────────

  function addIngredient() {
    if (!addIngId || !addQty) return;
    const ing = ingredients.find((i) => i.id === addIngId);
    if (!ing) return;
    setLocalRecipe((prev) => [
      ...prev,
      { ingredientId: addIngId, quantity: parseFloat(addQty), ingredient: ing },
    ]);
    setAddIngId("");
    setAddQty("");
  }

  // ── Computed values for right panel ───────────────────────────────────────

  const cost = selectedItem ? plateCost(localRecipe) : 0;
  const price = selectedItem ? Number(editPrice) : 0;
  const grossMargin = price - cost;
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;

  const usedIngIds = new Set(localRecipe.map((r) => r.ingredientId));
  const availableIngs = ingredients.filter((i) => !usedIngIds.has(i.id));

  // ── Vera suggest handlers ───────────────────────────────────────────────────

  const itemsWithoutRecipes = items.filter(i => i.recipe.length === 0);

  function openSuggestMode() {
    // Pre-select items without recipes
    setSuggestSelected(new Set(itemsWithoutRecipes.map(i => i.id)));
    setSuggestResults({});
    setSuggestEdited({});
    setSuggestApproved(new Set());
    setSuggestSkipped(new Set());
    setSuggestError(null);
    setSavedCount(0);
    setReviewItemId(null);
    setSuggestMode(true);
  }

  const generateSuggestions = useCallback(async () => {
    if (suggestSelected.size === 0) return;
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestResults({});
    setSuggestEdited({});
    setSuggestApproved(new Set());
    setSuggestSkipped(new Set());
    setReviewItemId(null);
    try {
      const res = await fetch("/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menuItemIds: Array.from(suggestSelected) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setSuggestResults(json.suggestions ?? {});
      // Initialise edited state from suggestions
      const edited: Record<string, SuggestIngredient[]> = {};
      for (const [id, s] of Object.entries(json.suggestions as Record<string, SuggestResult>)) {
        edited[id] = [...s.ingredients];
      }
      setSuggestEdited(edited);
      // Auto-select first item for review
      const firstId = Object.keys(json.suggestions ?? {})[0];
      if (firstId) setReviewItemId(firstId);
    } catch (e) {
      setSuggestError((e as Error).message ?? "Something went wrong.");
    } finally {
      setSuggestLoading(false);
    }
  }, [suggestSelected]);

  function updateSuggestQty(itemId: string, ingredientId: string, qty: number) {
    setSuggestEdited(prev => {
      const ings = (prev[itemId] ?? []).map(i =>
        i.ingredientId === ingredientId
          ? { ...i, quantity: qty, lineCost: qty * i.costPerUnit }
          : i
      );
      return { ...prev, [itemId]: ings };
    });
  }

  function removeSuggestIngredient(itemId: string, ingredientId: string) {
    setSuggestEdited(prev => ({
      ...prev,
      [itemId]: (prev[itemId] ?? []).filter(i => i.ingredientId !== ingredientId),
    }));
  }

  function approveItem(itemId: string) {
    setSuggestApproved(prev => new Set([...prev, itemId]));
    setSuggestSkipped(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    // Advance to next un-actioned item
    const pendingIds = Object.keys(suggestResults).filter(
      id => id !== itemId && !suggestApproved.has(id) && !suggestSkipped.has(id)
    );
    if (pendingIds.length > 0) setReviewItemId(pendingIds[0]);
  }

  function skipItem(itemId: string) {
    setSuggestSkipped(prev => new Set([...prev, itemId]));
    setSuggestApproved(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    const pendingIds = Object.keys(suggestResults).filter(
      id => id !== itemId && !suggestApproved.has(id) && !suggestSkipped.has(id)
    );
    if (pendingIds.length > 0) setReviewItemId(pendingIds[0]);
  }

  async function saveAllApproved() {
    if (suggestApproved.size === 0) return;
    setSavingApproved(true);
    let count = 0;
    for (const itemId of suggestApproved) {
      const ings = suggestEdited[itemId] ?? [];
      await fetch(`/api/menu/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe: ings.map(i => ({ ingredientId: i.ingredientId, quantity: i.quantity })),
        }),
      });
      count++;
    }
    // Refresh items list
    const menuRes = await fetch("/api/menu?active=false");
    if (menuRes.ok) setItems(await menuRes.json());
    setSavedCount(count);
    setSavingApproved(false);
  }

  // Computed cost for a suggest-edited recipe
  function editedCost(itemId: string) {
    return (suggestEdited[itemId] ?? []).reduce((s, i) => s + i.lineCost, 0);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Recipe Costing"
        description="Analyze food cost and menu engineering"
        actions={
          !suggestMode && !loading ? (
            <Button
              onClick={openSuggestMode}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white"
              size="sm"
            >
              <VeraSpark className="h-3.5 w-3.5" />
              Suggest with Vera
              {itemsWithoutRecipes.length > 0 && (
                <span className="ml-1 bg-red-600 text-white font-semibold rounded-full px-1.5 py-0.5 text-xs">
                  {itemsWithoutRecipes.length} missing
                </span>
              )}
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>

      ) : suggestMode ? (
        // ── AI Suggest mode ────────────────────────────────────────────────
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Suggest header bar */}
          <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-gray-200 bg-amber-50">
            <div className="flex items-center gap-3">
              <VeraAvatar className="h-7 w-7 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Vera&apos;s Recipe Suggestions</p>
                <p className="text-xs text-gray-500">
                  Vera suggests ingredients from your library. Review, adjust quantities, then approve.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {savedCount > 0 && (
                <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {savedCount} recipe{savedCount !== 1 ? "s" : ""} saved
                </span>
              )}
              {suggestApproved.size > 0 && savedCount === 0 && (
                <Button
                  size="sm"
                  onClick={saveAllApproved}
                  disabled={savingApproved}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {savingApproved
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Saving…</>
                    : <><Check className="h-3.5 w-3.5 mr-1" /> Save {suggestApproved.size} Approved</>
                  }
                </Button>
              )}
              <button
                onClick={() => setSuggestMode(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: item selection + results list */}
            <div className="w-72 shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-white">
              {/* Generate button */}
              <div className="p-3 border-b border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{suggestSelected.size} item{suggestSelected.size !== 1 ? "s" : ""} selected</span>
                  <div className="flex gap-2">
                    <button
                      className="text-amber-600 hover:underline"
                      onClick={() => setSuggestSelected(new Set(items.map(i => i.id)))}
                    >all</button>
                    <button
                      className="text-amber-600 hover:underline"
                      onClick={() => setSuggestSelected(new Set(itemsWithoutRecipes.map(i => i.id)))}
                    >missing only</button>
                    <button
                      className="text-gray-400 hover:underline"
                      onClick={() => setSuggestSelected(new Set())}
                    >none</button>
                  </div>
                </div>
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                  size="sm"
                  disabled={suggestSelected.size === 0 || suggestLoading}
                  onClick={generateSuggestions}
                >
                  {suggestLoading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Generating…</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate {suggestSelected.size} Recipe{suggestSelected.size !== 1 ? "s" : ""}</>
                  }
                </Button>
                {suggestError && (
                  <p className="text-xs text-red-500 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{suggestError}
                  </p>
                )}
              </div>

              {/* Item list */}
              <div className="flex-1 overflow-y-auto">
                {/* If no results yet: show selection checkboxes */}
                {Object.keys(suggestResults).length === 0 && items.map(item => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={suggestSelected.has(item.id)}
                      onChange={e => {
                        setSuggestSelected(prev => {
                          const s = new Set(prev);
                          if (e.target.checked) s.add(item.id); else s.delete(item.id);
                          return s;
                        });
                      }}
                      className="accent-amber-500 h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.category.name}</p>
                    </div>
                    {item.recipe.length === 0 ? (
                      <span className="text-[10px] bg-red-100 text-red-700 font-semibold rounded-full px-1.5 py-0.5 shrink-0">no recipe</span>
                    ) : (
                      <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5 shrink-0">{item.recipe.length} ing.</span>
                    )}
                  </label>
                ))}

                {/* Once results exist: show review list */}
                {Object.keys(suggestResults).length > 0 && Object.keys(suggestResults).map(itemId => {
                  const item = items.find(i => i.id === itemId);
                  if (!item) return null;
                  const approved = suggestApproved.has(itemId);
                  const skipped = suggestSkipped.has(itemId);
                  const isReviewing = reviewItemId === itemId;
                  const ings = suggestEdited[itemId] ?? [];
                  const cost = ings.reduce((s, i) => s + i.lineCost, 0);
                  const mp = Number(item.price) > 0 ? (cost / Number(item.price)) * 100 : 0;

                  return (
                    <button
                      key={itemId}
                      onClick={() => setReviewItemId(itemId)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 border-b border-gray-100 transition-colors hover:bg-gray-50",
                        isReviewing && "bg-amber-50 border-l-2 border-l-amber-500",
                        approved && "bg-emerald-50",
                        skipped && "opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {approved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                        {skipped && <SkipForward className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                        {!approved && !skipped && <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-400">{ings.length} ingredients · {mp.toFixed(0)}% food cost</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Summary footer once results exist */}
              {Object.keys(suggestResults).length > 0 && (
                <div className="border-t border-gray-200 px-3 py-2 bg-gray-50 text-xs text-gray-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Generated</span><span className="font-medium text-gray-700">{Object.keys(suggestResults).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Approved</span><span className="font-medium text-emerald-600">{suggestApproved.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Skipped</span><span className="font-medium text-gray-500">{suggestSkipped.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pending</span>
                    <span className="font-medium text-amber-600">
                      {Object.keys(suggestResults).length - suggestApproved.size - suggestSkipped.size}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: review panel */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {suggestLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                  <p className="text-sm">Asking GPT to build {suggestSelected.size} recipe{suggestSelected.size !== 1 ? "s" : ""} from your ingredient library…</p>
                  <p className="text-xs text-gray-400">This usually takes 5–15 seconds</p>
                </div>
              ) : Object.keys(suggestResults).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
                  <Sparkles className="h-8 w-8 text-amber-300" />
                  <p className="text-sm">Select items and click Generate to get AI recipe suggestions</p>
                  <p className="text-xs">Only ingredients already in your library will be used</p>
                </div>
              ) : !reviewItemId ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  Select an item on the left to review its suggested recipe
                </div>
              ) : (() => {
                const item = items.find(i => i.id === reviewItemId);
                const result = suggestResults[reviewItemId];
                const ings = suggestEdited[reviewItemId] ?? [];
                if (!item || !result) return null;

                const cost = editedCost(reviewItemId);
                const itemPrice = Number(item.price);
                const fp = itemPrice > 0 ? (cost / itemPrice) * 100 : 0;
                const gm = itemPrice - cost;
                const gmPct = itemPrice > 0 ? (gm / itemPrice) * 100 : 0;
                const approved = suggestApproved.has(reviewItemId);
                const skipped  = suggestSkipped.has(reviewItemId);

                return (
                  <div className="p-6 space-y-5 max-w-3xl">
                    {/* Item header */}
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">{item.name}</h2>
                        <p className="text-sm text-gray-500">{item.category.name} · {formatCurrency(itemPrice)}</p>
                      </div>
                      {approved && (
                        <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                          <CheckCircle2 className="h-4 w-4" /> Approved
                        </span>
                      )}
                      {skipped && (
                        <span className="flex items-center gap-1.5 text-sm text-gray-500 font-medium bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5">
                          <SkipForward className="h-4 w-4" /> Skipped
                        </span>
                      )}
                    </div>

                    {/* AI notes */}
                    {result.notes && (
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-sm text-amber-800">
                        <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                        {result.notes}
                      </div>
                    )}

                    {/* Cost summary chips */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Plate Cost", value: formatCurrency(cost) },
                        { label: "Menu Price", value: formatCurrency(itemPrice) },
                        { label: "Food Cost %", value: `${fp.toFixed(1)}%`, color: fp < 30 ? "text-emerald-600" : fp < 38 ? "text-warning-600" : "text-red-600" },
                        { label: "Gross Margin", value: `${gmPct.toFixed(1)}%`, color: gmPct >= 65 ? "text-emerald-600" : gmPct >= 55 ? "text-warning-600" : "text-red-600" },
                      ].map(({ label, value, color }) => (
                        <Card key={label}>
                          <CardContent className="p-3">
                            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                            <p className={cn("text-base font-semibold", color ?? "text-gray-900")}>{value}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {/* Editable ingredient table */}
                    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Suggested Ingredients — edit quantities as needed</p>
                      </div>
                      {ings.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-5">No ingredients suggested (item may not map to your library).</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Ingredient</TableHead>
                              <TableHead>Unit</TableHead>
                              <TableHead className="w-28">Quantity</TableHead>
                              <TableHead className="text-right">Cost/Unit</TableHead>
                              <TableHead className="text-right">Line Cost</TableHead>
                              <TableHead className="w-8" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ings.map(ing => (
                              <TableRow key={ing.ingredientId}>
                                <TableCell className="font-medium text-gray-900">{ing.name}</TableCell>
                                <TableCell className="text-gray-500 text-sm">{ing.unit}</TableCell>
                                <TableCell>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={ing.quantity}
                                    onChange={e => updateSuggestQty(reviewItemId, ing.ingredientId, parseFloat(e.target.value) || 0)}
                                    className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                </TableCell>
                                <TableCell className="text-right text-gray-500 text-sm">
                                  {formatCurrency(ing.costPerUnit)}
                                </TableCell>
                                <TableCell className="text-right font-medium text-gray-900">
                                  {formatCurrency(ing.lineCost)}
                                </TableCell>
                                <TableCell>
                                  <button
                                    onClick={() => removeSuggestIngredient(reviewItemId, ing.ingredientId)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    {/* Approve / Skip */}
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={() => approveItem(reviewItemId)}
                        disabled={approved}
                        className={cn(
                          "flex items-center gap-2",
                          approved
                            ? "bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default"
                            : "bg-emerald-600 hover:bg-emerald-700 text-white"
                        )}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {approved ? "Approved" : "Approve Recipe"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => skipItem(reviewItemId)}
                        disabled={skipped}
                        className="flex items-center gap-2 text-gray-500"
                      >
                        <SkipForward className="h-4 w-4" />
                        {skipped ? "Skipped" : "Skip"}
                      </Button>
                      {(approved || skipped) && (
                        <button
                          onClick={() => {
                            setSuggestApproved(prev => { const s = new Set(prev); s.delete(reviewItemId); return s; });
                            setSuggestSkipped(prev => { const s = new Set(prev); s.delete(reviewItemId); return s; });
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 underline"
                        >
                          undo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

      ) : (
        // ── Normal recipe costing mode ────────────────────────────────────
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left panel ── */}
          <div className="flex w-full flex-col border-r border-gray-200 lg:w-1/3 overflow-hidden">
            {/* Search + category filter */}
            <div className="p-4 space-y-2 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search items..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item list */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-sm text-gray-400">No items found</div>
              ) : (
                filtered.map((item) => {
                  const c = itemCosting(item);
                  const cost = c.cost;
                  const mp = c.marginPct;
                  const cls = classify(item);
                  const isSelected = item.id === selectedId;
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectItem(item)}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b border-gray-100 transition-colors hover:bg-amber-50",
                        isSelected && "bg-amber-50 border-l-2 border-l-amber-500"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{item.category.name}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                              {formatCurrency(cost)}{c.estimated ? "*" : ""}
                            </span>
                            <MarginChip pct={mp} estimated={c.estimated} />
                          </div>
                          {cls && <EngineeringBadge cls={cls} />}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <p className="shrink-0 border-t border-gray-100 px-4 py-2 text-[11px] leading-snug text-gray-400">
              <span className="font-medium">*</span> cost estimated from category average until a recipe is added. Star / Plowhorse / Puzzle / Dog rank each item against your menu median for sales and margin.
            </p>
          </div>

          {/* ── Right panel ── */}
          <div className="hidden lg:flex flex-1 flex-col overflow-y-auto bg-gray-50">
            {!selectedItem ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-400">Select an item to view and edit its recipe</p>
                  {itemsWithoutRecipes.length > 0 && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-red-600 font-medium">
                        {itemsWithoutRecipes.length} item{itemsWithoutRecipes.length !== 1 ? "s" : ""} have no recipe yet
                      </p>
                      <Button
                        size="sm"
                        onClick={openSuggestMode}
                        className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Suggest with Vera
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Header row: name + price edit */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">{selectedItem.name}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{selectedItem.category.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Menu price</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-28 rounded-md border border-gray-300 bg-white pl-7 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={savePrice}
                      disabled={savingPrice}
                      variant="outline"
                    >
                      {savingPrice ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : priceSaved ? (
                        <><Check className="h-3.5 w-3.5 text-green-600" /> Saved</>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Costing summary cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Plate Cost", value: formatCurrency(cost) },
                    { label: "Menu Price", value: formatCurrency(price) },
                    {
                      label: "Gross Margin $",
                      value: formatCurrency(grossMargin),
                      color: grossMargin >= 0 ? "text-green-600" : "text-red-600",
                    },
                    {
                      label: "Margin %",
                      value: `${margin.toFixed(1)}%`,
                      color:
                        margin >= 65
                          ? "text-green-600"
                          : margin >= 55
                          ? "text-warning-600"
                          : "text-red-600",
                    },
                  ].map(({ label, value, color }) => (
                    <Card key={label}>
                      <CardContent className="p-4">
                        <p className="text-xs text-gray-500 mb-1">{label}</p>
                        <p className={cn("text-lg font-semibold", color ?? "text-gray-900")}>
                          {value}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Recipe table */}
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-medium text-gray-900">Recipe</h3>
                  </div>
                  {localRecipe.length === 0 ? (
                    <p className="text-sm text-gray-400 px-4 py-6">No ingredients yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingredient</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead className="w-28">Qty</TableHead>
                          <TableHead className="text-right">Cost/Unit</TableHead>
                          <TableHead className="text-right">Line Cost</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {localRecipe.map((r, i) => {
                          const lineCost =
                            Number(r.ingredient.costPerUnit) * Number(r.quantity);
                          return (
                            <TableRow key={r.ingredientId}>
                              <TableCell className="font-medium text-gray-900">
                                {r.ingredient.name}
                              </TableCell>
                              <TableCell className="text-gray-500 text-sm">
                                {r.ingredient.unit}
                              </TableCell>
                              <TableCell>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={Number(r.quantity)}
                                  onChange={(e) => {
                                    setLocalRecipe((prev) =>
                                      prev.map((row, j) =>
                                        j === i
                                          ? { ...row, quantity: e.target.value }
                                          : row
                                      )
                                    );
                                  }}
                                  className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                              </TableCell>
                              <TableCell className="text-right text-gray-500 text-sm">
                                {formatCurrency(Number(r.ingredient.costPerUnit))}
                              </TableCell>
                              <TableCell className="text-right font-medium text-gray-900">
                                {formatCurrency(lineCost)}
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() =>
                                    setLocalRecipe((prev) => prev.filter((_, j) => j !== i))
                                  }
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  aria-label="Remove ingredient"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}

                  {/* Add ingredient row */}
                  <div className="border-t border-gray-100 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">Add ingredient</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={addIngId}
                        onChange={(e) => setAddIngId(e.target.value)}
                        className="flex-1 min-w-40 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Select ingredient…</option>
                        {availableIngs.map((ing) => (
                          <option key={ing.id} value={ing.id}>
                            {ing.name} ({ing.unit}) — {formatCurrency(Number(ing.costPerUnit))}/{ing.unit}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="Qty"
                        value={addQty}
                        onChange={(e) => setAddQty(e.target.value)}
                        className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <Button
                        size="sm"
                        onClick={addIngredient}
                        disabled={!addIngId || !addQty}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Save recipe button */}
                <div className="flex justify-end">
                  <Button onClick={saveRecipe} disabled={savingRecipe}>
                    {savingRecipe ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : recipeSaved ? (
                      <><Check className="h-4 w-4 text-white" /> Saved ✓</>
                    ) : (
                      "Save Recipe"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
