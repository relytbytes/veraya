"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, GlassWater, Pencil, Trash2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BeverageProfile {
  id: string;
  ingredientId: string;
  category: string;
  bottleSizeMl: number;
  pourSizeMl: number;
  producer: string | null;
  vintage: string | null;
  abv: number | null;
  ingredient: {
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
    inventoryItem: {
      quantity: number;
    } | null;
  };
}

interface BeverageReport {
  id: string;
  ingredientId: string;
  name: string;
  category: string;
  bottleSizeMl: number;
  pourSizeMl: number;
  producer: string | null;
  vintage: string | null;
  abv: number | null;
  poursPerBottle: number;
  costPerBottle: number;
  costPerPour: number;
  pourCostPct: number;
  avgMenuPrice: number;
  currentQty: number;
  currentValueBottles: number;
  theoreticalPours: number;
  actualPours: number;
  variance: number;
  varianceCost: number;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = ["WINE", "LIQUOR", "BEER", "NA_BEVERAGE"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  WINE: "Wine",
  LIQUOR: "Liquor",
  BEER: "Beer",
  NA_BEVERAGE: "N/A Beverage",
};
const BOTTLE_SIZES = [
  { label: "375 mL (Half)", value: 375 },
  { label: "750 mL (Standard)", value: 750 },
  { label: "1000 mL (Liter)", value: 1000 },
  { label: "1750 mL (Handle)", value: 1750 },
];
const POUR_SIZES = [
  { label: "1 oz (30 mL)", value: 30 },
  { label: "1.5 oz (44 mL) — Standard", value: 44 },
  { label: "2 oz (59 mL)", value: 59 },
  { label: "5 oz (148 mL) — Wine", value: 148 },
  { label: "12 oz (355 mL) — Beer", value: 355 },
  { label: "16 oz (473 mL) — Pint", value: 473 },
];

const POUR_COST_COLOR = (pct: number) =>
  pct < 20
    ? "text-green-700 bg-green-50"
    : pct < 30
    ? "text-amber-700 bg-amber-50"
    : "text-red-700 bg-red-50";

function toISO(d: Date) { return d.toISOString().slice(0, 10); }
const PRESETS = [
  { label: "Last 30d", getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 29); return { from: toISO(s), to: toISO(d) }; } },
  { label: "Last 90d", getRange: () => { const d = new Date(); const s = new Date(d); s.setDate(d.getDate() - 89); return { from: toISO(s), to: toISO(d) }; } },
  { label: "This Month", getRange: () => { const d = new Date(); return { from: toISO(new Date(d.getFullYear(), d.getMonth(), 1)), to: toISO(d) }; } },
];

const EMPTY_FORM = {
  ingredientId: "",
  category: "WINE",
  bottleSizeMl: 750,
  pourSizeMl: 44,
  producer: "",
  vintage: "",
  abv: "",
  bottleSizeCustom: "",
  pourSizeCustom: "",
  useCustomBottle: false,
  useCustomPour: false,
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BeveragePage() {
  const [tab, setTab] = useState<"overview" | "variance" | "manage">("overview");
  const [preset, setPreset] = useState("Last 30d");
  const [range, setRange] = useState(() => PRESETS[0].getRange());

  const [profiles, setProfiles] = useState<BeverageProfile[]>([]);
  const [report, setReport] = useState<BeverageReport[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<BeverageProfile | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const loadProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    const res = await fetch("/api/beverage-profiles");
    if (res.ok) setProfiles(await res.json());
    setLoadingProfiles(false);
  }, []);

  const loadReport = useCallback(async (from: string, to: string) => {
    setLoadingReport(true);
    const res = await fetch(`/api/reports/beverage-cost?from=${from}&to=${to}`);
    if (res.ok) setReport(await res.json());
    setLoadingReport(false);
  }, []);

  const loadIngredients = useCallback(async () => {
    const res = await fetch("/api/ingredients");
    if (res.ok) setIngredients(await res.json());
  }, []);

  useEffect(() => { loadProfiles(); loadIngredients(); }, [loadProfiles, loadIngredients]);
  useEffect(() => { loadReport(range.from, range.to); }, [range, loadReport]);

  // Ingredients not yet profiled
  const profiledIds = new Set(profiles.map((p) => p.ingredientId));
  const availableIngredients = ingredients.filter((i) => !profiledIds.has(i.id));

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError("");
    setAddOpen(true);
  }

  function openEdit(profile: BeverageProfile) {
    setForm({
      ingredientId: profile.ingredientId,
      category: profile.category,
      bottleSizeMl: profile.bottleSizeMl,
      pourSizeMl: profile.pourSizeMl,
      producer: profile.producer ?? "",
      vintage: profile.vintage ?? "",
      abv: profile.abv != null ? String(profile.abv) : "",
      bottleSizeCustom: "",
      pourSizeCustom: "",
      useCustomBottle: !BOTTLE_SIZES.find((b) => b.value === profile.bottleSizeMl),
      useCustomPour: !POUR_SIZES.find((p) => p.value === profile.pourSizeMl),
    });
    setFormError("");
    setEditProfile(profile);
  }

  async function save() {
    setSaving(true);
    setFormError("");
    const payload = {
      ingredientId: form.ingredientId,
      category: form.category,
      bottleSizeMl: form.useCustomBottle ? Number(form.bottleSizeCustom) : form.bottleSizeMl,
      pourSizeMl: form.useCustomPour ? Number(form.pourSizeCustom) : form.pourSizeMl,
      producer: form.producer || null,
      vintage: form.vintage || null,
      abv: form.abv ? Number(form.abv) : null,
    };

    let res: Response;
    if (editProfile) {
      res = await fetch(`/api/beverage-profiles/${editProfile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch("/api/beverage-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const data = await res.json();
      setFormError(data.error ?? "Failed to save");
    } else {
      setAddOpen(false);
      setEditProfile(null);
      loadProfiles();
      loadReport(range.from, range.to);
    }
    setSaving(false);
  }

  async function deleteProfile(id: string) {
    if (!confirm("Delete this beverage profile?")) return;
    await fetch(`/api/beverage-profiles/${id}`, { method: "DELETE" });
    loadProfiles();
    loadReport(range.from, range.to);
  }

  const filteredReport = categoryFilter === "ALL"
    ? report
    : report.filter((r) => r.category === categoryFilter);

  // Summary stats
  const totalSKUs = report.length;
  const totalBottleValue = report.reduce((s, r) => s + r.currentValueBottles, 0);
  const avgPourCostPct = report.length > 0
    ? report.filter((r) => r.avgMenuPrice > 0).reduce((s, r) => s + r.pourCostPct, 0) /
      (report.filter((r) => r.avgMenuPrice > 0).length || 1)
    : 0;
  const topVariance = report.sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost))[0];

  const sortedByVariance = [...report].sort(
    (a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost)
  );

  return (
    <div>
      <Header
        title="Bar Program"
        description="Beverage costing and variance tracking"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadProfiles(); loadReport(range.from, range.to); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Beverage Item
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6">
        {(["overview", "variance", "manage"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "pb-3 mr-6 text-sm font-medium border-b-2 capitalize transition-colors",
              tab === t
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t === "overview" ? "Overview" : t === "variance" ? "Variance Report" : "Manage Items"}
          </button>
        ))}
      </div>

      {/* Date range */}
      <div className="px-6 pt-4 flex flex-wrap gap-2 items-center">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={preset === p.label ? "default" : "outline"}
            className="h-7 text-xs px-3"
            onClick={() => { setPreset(p.label); setRange(p.getRange()); }}
          >
            {p.label}
          </Button>
        ))}
        <Input
          type="date"
          value={range.from}
          onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, from: e.target.value })); }}
          className="h-7 text-xs w-36"
        />
        <span className="text-gray-400 text-xs">–</span>
        <Input
          type="date"
          value={range.to}
          onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, to: e.target.value })); }}
          className="h-7 text-xs w-36"
        />
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="p-6 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Total SKUs</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{totalSKUs}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Total Bottle Value</p>
                <p className="text-2xl font-bold text-gray-900 mt-0.5">{formatCurrency(totalBottleValue)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Avg Pour Cost %</p>
                <p className={cn("text-2xl font-bold mt-0.5",
                  avgPourCostPct < 20 ? "text-green-600" : avgPourCostPct < 30 ? "text-amber-600" : "text-red-600"
                )}>
                  {avgPourCostPct.toFixed(1)}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Top Variance Item</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">
                  {topVariance ? topVariance.name : "—"}
                </p>
                {topVariance && (
                  <p className={cn("text-xs font-medium mt-0.5",
                    topVariance.varianceCost > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {topVariance.varianceCost > 0 ? "+" : ""}{formatCurrency(topVariance.varianceCost)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Category filter pills */}
          <div className="flex flex-wrap gap-2">
            {["ALL", ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                  categoryFilter === cat
                    ? "bg-amber-500 text-white border-amber-500"
                    : "bg-white text-gray-600 border-gray-200 hover:border-amber-300"
                )}
              >
                {cat === "ALL" ? "All" : CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Bottle Size</TableHead>
                  <TableHead className="text-right">Pour Size</TableHead>
                  <TableHead className="text-right">Pours/Bottle</TableHead>
                  <TableHead className="text-right">Cost/Bottle</TableHead>
                  <TableHead className="text-right">Cost/Pour</TableHead>
                  <TableHead className="text-right">Pour Cost %</TableHead>
                  <TableHead className="text-right">Avg Menu Price</TableHead>
                  <TableHead className="text-right">Stock (bottles)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReport ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredReport.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-10 text-gray-400">
                      No beverage items found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReport.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.producer && (
                            <p className="text-xs text-gray-400">{item.producer}{item.vintage ? ` · ${item.vintage}` : ""}</p>
                          )}
                          {item.abv != null && (
                            <p className="text-xs text-gray-400">{item.abv}% ABV</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.bottleSizeMl} mL</TableCell>
                      <TableCell className="text-right tabular-nums">{item.pourSizeMl} mL</TableCell>
                      <TableCell className="text-right tabular-nums">{item.poursPerBottle.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.costPerBottle)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.costPerPour)}</TableCell>
                      <TableCell className="text-right">
                        {item.avgMenuPrice > 0 ? (
                          <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", POUR_COST_COLOR(item.pourCostPct))}>
                            {item.pourCostPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.avgMenuPrice > 0 ? formatCurrency(item.avgMenuPrice) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{item.currentQty.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Legend */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 inline-block" />Below 20% — excellent</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 inline-block" />20–30% — acceptable</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-100 inline-block" />Above 30% — over target</span>
          </div>
        </div>
      )}

      {/* ── VARIANCE REPORT TAB ───────────────────────────────────────────────── */}
      {tab === "variance" && (
        <div className="p-6 space-y-5">
          {/* Summary */}
          {!loadingReport && report.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Total Variance Cost</p>
                  <p className={cn("text-2xl font-bold mt-0.5",
                    sortedByVariance.reduce((s, r) => s + r.varianceCost, 0) > 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {formatCurrency(Math.abs(sortedByVariance.reduce((s, r) => s + r.varianceCost, 0)))}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sortedByVariance.reduce((s, r) => s + r.varianceCost, 0) > 0 ? "Over-poured" : "Under-poured"}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Items with Positive Variance</p>
                  <p className="text-2xl font-bold text-red-600 mt-0.5">
                    {sortedByVariance.filter((r) => r.variance > 0.5).length}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Over-poured items</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500">Largest Single Variance</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5 truncate">
                    {sortedByVariance[0]?.name ?? "—"}
                  </p>
                  {sortedByVariance[0] && (
                    <p className={cn("text-xs font-medium mt-0.5",
                      sortedByVariance[0].varianceCost > 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {formatCurrency(Math.abs(sortedByVariance[0].varianceCost))}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 overflow-x-auto bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Theoretical Pours</TableHead>
                  <TableHead className="text-right">Actual Pours</TableHead>
                  <TableHead className="text-right">Variance (pours)</TableHead>
                  <TableHead className="text-right">Variance (bottles)</TableHead>
                  <TableHead className="text-right">Variance Cost</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReport ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400 mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : sortedByVariance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-gray-400">
                      No data for selected period
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedByVariance.map((item) => {
                    const variancePct =
                      item.theoreticalPours > 0
                        ? (item.variance / item.theoreticalPours) * 100
                        : 0;
                    const varianceBottles = item.variance / item.poursPerBottle;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {Math.abs(item.varianceCost) > 50 && (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                            <div>
                              <p className="font-medium text-gray-900">{item.name}</p>
                              <p className="text-xs text-gray-400">{CATEGORY_LABELS[item.category]}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.theoreticalPours.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.actualPours.toFixed(1)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium",
                          item.variance > 0.5 ? "text-red-600" : item.variance < -0.5 ? "text-green-600" : "text-gray-600"
                        )}>
                          {item.variance > 0 ? "+" : ""}{item.variance.toFixed(1)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums",
                          item.variance > 0 ? "text-red-500" : item.variance < 0 ? "text-green-500" : "text-gray-500"
                        )}>
                          {varianceBottles > 0 ? "+" : ""}{varianceBottles.toFixed(2)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums font-semibold",
                          item.varianceCost > 0 ? "text-red-600" : item.varianceCost < 0 ? "text-green-600" : "text-gray-600"
                        )}>
                          {item.varianceCost > 0 ? "+" : ""}{formatCurrency(item.varianceCost)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums",
                          Math.abs(variancePct) > 10 ? "text-red-600" : "text-gray-600"
                        )}>
                          {variancePct > 0 ? "+" : ""}{variancePct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ── MANAGE ITEMS TAB ─────────────────────────────────────────────────── */}
      {tab === "manage" && (
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{profiles.length} beverage item{profiles.length !== 1 ? "s" : ""}</p>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Beverage Item
            </Button>
          </div>

          {loadingProfiles ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="py-24 text-center text-gray-400">
              <GlassWater className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No beverage items yet</p>
              <p className="text-sm mt-1">Add items from your ingredient list to get started</p>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Bottle Size</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Pour Size</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">ABV</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Cost/Bottle</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {profiles.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.ingredient.name}</p>
                        {p.producer && (
                          <p className="text-xs text-gray-400">{p.producer}{p.vintage ? ` · ${p.vintage}` : ""}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-xs">
                          {CATEGORY_LABELS[p.category] ?? p.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{p.bottleSizeMl} mL</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{p.pourSizeMl} mL</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                        {p.abv != null ? `${p.abv}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                        {formatCurrency(Number(p.ingredient.costPerUnit))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-400 hover:text-red-600"
                            onClick={() => deleteProfile(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ADD / EDIT DIALOG ──────────────────────────────────────────────────── */}
      <Dialog
        open={addOpen || !!editProfile}
        onOpenChange={(open) => {
          if (!open) { setAddOpen(false); setEditProfile(null); }
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GlassWater className="h-4 w-4 text-amber-500" />
              {editProfile ? "Edit Beverage Item" : "Add Beverage Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Ingredient */}
            {!editProfile && (
              <div className="space-y-1.5">
                <Label>Ingredient *</Label>
                <Select value={form.ingredientId} onValueChange={(v) => setForm({ ...form, ingredientId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ingredient…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableIngredients.length === 0 ? (
                      <SelectItem value="__none__" disabled>All ingredients already profiled</SelectItem>
                    ) : (
                      availableIngredients.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Category */}
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bottle size */}
            <div className="space-y-1.5">
              <Label>Bottle Size</Label>
              {!form.useCustomBottle ? (
                <div className="flex gap-2">
                  <Select
                    value={String(form.bottleSizeMl)}
                    onValueChange={(v) => setForm({ ...form, bottleSizeMl: Number(v) })}
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BOTTLE_SIZES.map((b) => (
                        <SelectItem key={b.value} value={String(b.value)}>{b.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="shrink-0 text-xs"
                    onClick={() => setForm({ ...form, useCustomBottle: true, bottleSizeCustom: "" })}
                  >
                    Custom
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="mL"
                    value={form.bottleSizeCustom}
                    onChange={(e) => setForm({ ...form, bottleSizeCustom: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500">mL</span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="text-xs"
                    onClick={() => setForm({ ...form, useCustomBottle: false })}
                  >
                    Preset
                  </Button>
                </div>
              )}
            </div>

            {/* Pour size */}
            <div className="space-y-1.5">
              <Label>Pour Size</Label>
              {!form.useCustomPour ? (
                <div className="flex gap-2">
                  <Select
                    value={String(form.pourSizeMl)}
                    onValueChange={(v) => setForm({ ...form, pourSizeMl: Number(v) })}
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POUR_SIZES.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="shrink-0 text-xs"
                    onClick={() => setForm({ ...form, useCustomPour: true, pourSizeCustom: "" })}
                  >
                    Custom
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    placeholder="mL"
                    value={form.pourSizeCustom}
                    onChange={(e) => setForm({ ...form, pourSizeCustom: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500">mL</span>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    className="text-xs"
                    onClick={() => setForm({ ...form, useCustomPour: false })}
                  >
                    Preset
                  </Button>
                </div>
              )}
            </div>

            {/* Producer */}
            <div className="space-y-1.5">
              <Label>Producer <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. Château Margaux"
                value={form.producer}
                onChange={(e) => setForm({ ...form, producer: e.target.value })}
              />
            </div>

            {/* Vintage */}
            <div className="space-y-1.5">
              <Label>Vintage <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input
                placeholder="e.g. 2020"
                value={form.vintage}
                onChange={(e) => setForm({ ...form, vintage: e.target.value })}
              />
            </div>

            {/* ABV */}
            <div className="space-y-1.5">
              <Label>ABV % <span className="text-gray-400 text-xs">(optional)</span></Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="e.g. 13.5"
                value={form.abv}
                onChange={(e) => setForm({ ...form, abv: e.target.value })}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setEditProfile(null); }}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving || (!editProfile && !form.ingredientId) || !form.category}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editProfile ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React from "react";
