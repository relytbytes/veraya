"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus, Search, AlertTriangle, ArrowUp, Loader2, Package,
  Camera, Barcode, Sparkles, Check, ChevronRight, AlertCircle, Upload,
} from "lucide-react";
import { VeraAvatar } from "@/components/brand/vera-avatar";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Supplier { id: string; name: string; }

interface InventoryItem {
  id: string;
  ingredientId: string;
  quantity: string;
  minThreshold: string;
  maxThreshold: string | null;
  ingredient: {
    id: string; name: string; unit: string; costPerUnit: string;
    supplier: Supplier | null;
  };
}

interface ExtractedIngredient {
  name: string;
  brand: string | null;
  suggestedUnit: string;
  notes: string | null;
  confidence: "high" | "medium" | "low";
}

interface ImportRow extends ExtractedIngredient {
  selected: boolean;
  costPerUnit: string;
  minThreshold: string;
  supplierId: string;
  // post-save
  savedId?: string;
}

interface RecipeSuggestion {
  ingredientId: string;
  ingredientName: string;
  menuItems: { id: string; name: string; category: string; reason?: string; currentIngredients: string[] }[];
}

const COMMON_UNITS = ["kg", "g", "L", "mL", "oz", "lb", "unit", "dozen", "case", "bag", "box", "bottle", "can", "bunch", "each"];

const TRANSACTION_TYPES = [
  { value: "RECEIVED",  label: "Receive Stock" },
  { value: "WASTED",    label: "Waste / Spoilage" },
  { value: "ADJUSTED",  label: "Manual Adjustment" },
  { value: "RETURNED",  label: "Return to Supplier" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "low" | "ok">("all");

  // Adjust stock dialog
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjItem, setAdjItem] = useState<InventoryItem | null>(null);
  const [adjType, setAdjType] = useState("RECEIVED");
  const [adjQty, setAdjQty] = useState("");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);

  // Add single ingredient dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newIng, setNewIng] = useState({ name: "", unit: "kg", costPerUnit: "", minThreshold: "", supplierId: "" });
  const [addSaving, setAddSaving] = useState(false);

  // ── Import flow state ─────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"choose" | "photo" | "barcode">("choose");

  // Photo import
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importSaved, setImportSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Barcode import
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<{ name: string; brand: string | null; unit: string } | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [barcodeForm, setBarcodeForm] = useState({ name: "", unit: "kg", costPerUnit: "", minThreshold: "", supplierId: "" });

  // Recipe addition suggestions (shown after save)
  const [recipeSuggestions, setRecipeSuggestions] = useState<RecipeSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [invRes, suppRes] = await Promise.all([fetch("/api/inventory"), fetch("/api/suppliers")]);
    if (invRes.ok) setItems(await invRes.json());
    if (suppRes.ok) setSuppliers(await suppRes.json());
    setLoading(false);
  }

  // ── Adjust stock ──────────────────────────────────────────────────────────

  function openAdj(item: InventoryItem) {
    setAdjItem(item); setAdjType("RECEIVED"); setAdjQty(""); setAdjNotes(""); setAdjOpen(true);
  }

  async function saveAdj() {
    if (!adjItem || !adjQty) return;
    setAdjSaving(true);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientId: adjItem.ingredientId, quantity: parseFloat(adjQty), type: adjType, notes: adjNotes }),
    });
    setAdjSaving(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Failed"); return; }
    setAdjOpen(false);
    loadAll();
  }

  // ── Add single ingredient ─────────────────────────────────────────────────

  async function saveNewIngredient() {
    if (!newIng.name || !newIng.unit || !newIng.costPerUnit) return;
    setAddSaving(true);
    const res = await fetch("/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newIng.name, unit: newIng.unit,
        costPerUnit: parseFloat(newIng.costPerUnit),
        supplierId: newIng.supplierId || null,
        minThreshold: newIng.minThreshold ? parseFloat(newIng.minThreshold) : 0,
      }),
    });
    setAddSaving(false);
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error ?? "Failed"); return; }
    const created = await res.json() as { id: string };
    setAddOpen(false);
    setNewIng({ name: "", unit: "kg", costPerUnit: "", minThreshold: "", supplierId: "" });
    loadAll();
    fetchRecipeSuggestions([created.id]);
  }

  // ── Photo import ──────────────────────────────────────────────────────────

  function openImport() {
    setImportOpen(true); setImportMode("choose");
    setPhotoPreview(null); setPhotoError(null); setImportRows([]);
    setImportSaved(false); setBarcodeInput(""); setBarcodeResult(null);
    setBarcodeError(null); setBarcodeForm({ name: "", unit: "kg", costPerUnit: "", minThreshold: "", supplierId: "" });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPhotoPreview(dataUrl);
      extractFromPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function extractFromPhoto(dataUrl: string) {
    setPhotoLoading(true); setPhotoError(null); setImportRows([]);
    try {
      const res = await fetch("/api/ingredients/import-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Extraction failed");
      const rows: ImportRow[] = (json.ingredients as ExtractedIngredient[]).map(i => ({
        ...i,
        selected: i.confidence !== "low",
        costPerUnit: "",
        minThreshold: "",
        supplierId: "",
      }));
      setImportRows(rows);
    } catch (e) {
      setPhotoError((e as Error).message);
    } finally {
      setPhotoLoading(false);
    }
  }

  async function saveImportRows() {
    const toSave = importRows.filter(r => r.selected && r.name.trim());
    if (!toSave.length) return;
    setImportSaving(true);
    const savedIds: string[] = [];
    for (const row of toSave) {
      const res = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          unit: row.suggestedUnit,
          costPerUnit: parseFloat(row.costPerUnit) || 0,
          supplierId: row.supplierId || null,
          minThreshold: parseFloat(row.minThreshold) || 0,
        }),
      });
      if (res.ok) {
        const created = await res.json() as { id: string };
        savedIds.push(created.id);
      }
    }
    setImportSaving(false);
    setImportSaved(true);
    await loadAll();
    if (savedIds.length) fetchRecipeSuggestions(savedIds);
  }

  // ── Barcode import ────────────────────────────────────────────────────────

  async function lookupBarcode() {
    if (!barcodeInput.trim()) return;
    setBarcodeLoading(true); setBarcodeError(null); setBarcodeResult(null);
    try {
      const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(barcodeInput.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Lookup failed");
      if (json.local) {
        setBarcodeError(`"${json.local.name}" is already in your ingredient library.`);
      } else if (json.external) {
        const ext = json.external;
        setBarcodeResult({ name: ext.name, brand: ext.brand, unit: "unit" });
        setBarcodeForm(prev => ({ ...prev, name: ext.name }));
      } else {
        setBarcodeError("No product found for that barcode. Enter details manually.");
        setBarcodeResult({ name: "", brand: null, unit: "unit" });
      }
    } catch (e) {
      setBarcodeError((e as Error).message);
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function saveBarcodeIngredient() {
    if (!barcodeForm.name || !barcodeForm.costPerUnit) return;
    setBarcodeSaving(true);
    const res = await fetch("/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: barcodeForm.name, unit: barcodeForm.unit,
        costPerUnit: parseFloat(barcodeForm.costPerUnit),
        supplierId: barcodeForm.supplierId || null,
        minThreshold: parseFloat(barcodeForm.minThreshold) || 0,
        barcode: barcodeInput.trim() || undefined,
      }),
    });
    setBarcodeSaving(false);
    if (!res.ok) { setBarcodeError((await res.json().catch(() => ({}))).error ?? "Failed"); return; }
    const created = await res.json() as { id: string };
    setImportOpen(false);
    loadAll();
    fetchRecipeSuggestions([created.id]);
  }

  // ── Recipe addition suggestions ───────────────────────────────────────────

  const fetchRecipeSuggestions = useCallback(async (ingredientIds: string[]) => {
    try {
      const res = await fetch("/api/ingredients/suggest-additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientIds }),
      });
      if (!res.ok) return;
      const json = await res.json() as { suggestions: RecipeSuggestion[] };
      if (json.suggestions?.length) {
        setRecipeSuggestions(json.suggestions);
        setSuggestionsOpen(true);
      }
    } catch { /* silent — suggestions are a bonus */ }
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const filtered = items.filter((item) => {
    const matchSearch = item.ingredient.name.toLowerCase().includes(search.toLowerCase());
    const qty = Number(item.quantity), min = Number(item.minThreshold);
    const isLow = qty <= min;
    return matchSearch && (filter === "all" || (filter === "low" && isLow) || (filter === "ok" && !isLow));
  });

  const lowCount  = items.filter(i => Number(i.quantity) <= Number(i.minThreshold)).length;
  const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.ingredient.costPerUnit), 0);
  const selectedCount = importRows.filter(r => r.selected).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <Header
        title="Inventory"
        description={`${items.length} ingredients tracked · Total value ${formatCurrency(totalValue)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={openImport} className="flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Import Ingredients
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Ingredient
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Items", value: items.length, icon: <Package className="h-5 w-5 text-blue-600" />, bg: "bg-blue-50" },
            { label: "Low Stock",   value: lowCount,     icon: <AlertTriangle className="h-5 w-5 text-red-500" />,  bg: "bg-red-50",   color: "text-red-600" },
            { label: "Stock Value", value: formatCurrency(totalValue), icon: <ArrowUp className="h-5 w-5 text-green-600" />, bg: "bg-green-50" },
          ].map(({ label, value, icon, bg, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center`}>{icon}</div>
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-xl font-bold ${color ?? ""}`}>{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1.5">
            {(["all", "low", "ok"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${filter === f ? "bg-amber-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {f === "low" ? `Low Stock (${lowCount})` : f === "ok" ? "OK" : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p className="font-medium">No ingredients found</p>
                <p className="text-sm mt-1">Add your first ingredient to start tracking inventory</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Min Level</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Stock Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => {
                    const qty = Number(item.quantity), min = Number(item.minThreshold);
                    const isLow = qty <= min, isEmpty = qty === 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell><p className="font-medium text-gray-900">{item.ingredient.name}</p></TableCell>
                        <TableCell><span className="text-sm text-gray-500">{item.ingredient.supplier?.name ?? "—"}</span></TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${isEmpty ? "text-red-600" : isLow ? "text-amber-600" : "text-gray-900"}`}>
                            {qty} {item.ingredient.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-gray-500">{min} {item.ingredient.unit}</TableCell>
                        <TableCell className="text-right text-gray-500">{formatCurrency(Number(item.ingredient.costPerUnit))}/{item.ingredient.unit}</TableCell>
                        <TableCell className="text-right text-gray-700 font-medium">{formatCurrency(qty * Number(item.ingredient.costPerUnit))}</TableCell>
                        <TableCell>
                          {isEmpty ? <Badge variant="destructive">Out of Stock</Badge>
                            : isLow ? <Badge variant="warning">Low Stock</Badge>
                            : <Badge variant="success">OK</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openAdj(item)}>Adjust</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Adjust Stock Dialog ─────────────────────────────────────────────── */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adjust Stock — {adjItem?.ingredient.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-md p-3 text-sm">
              <p className="text-gray-500">Current Stock</p>
              <p className="text-lg font-bold">{Number(adjItem?.quantity ?? 0)} {adjItem?.ingredient.unit}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Type *</Label>
              <Select value={adjType} onValueChange={setAdjType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TRANSACTION_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity ({adjItem?.ingredient.unit}) *</Label>
              <Input type="number" step="0.001" placeholder="0" value={adjQty} onChange={e => setAdjQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes..." value={adjNotes} onChange={e => setAdjNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjOpen(false)}>Cancel</Button>
            <Button onClick={saveAdj} disabled={adjSaving || !adjQty}>
              {adjSaving && <Loader2 className="h-4 w-4 animate-spin" />} Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Single Ingredient Dialog ────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Ingredient</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="e.g. Chicken Breast" value={newIng.name} onChange={e => setNewIng({ ...newIng, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Select value={newIng.unit} onValueChange={v => setNewIng({ ...newIng, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMMON_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cost per Unit *</Label>
                <Input type="number" step="0.0001" placeholder="0.00" value={newIng.costPerUnit} onChange={e => setNewIng({ ...newIng, costPerUnit: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Threshold</Label>
                <Input type="number" step="0.001" placeholder="0" value={newIng.minThreshold} onChange={e => setNewIng({ ...newIng, minThreshold: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={newIng.supplierId} onValueChange={v => setNewIng({ ...newIng, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveNewIngredient} disabled={addSaving || !newIng.name || !newIng.costPerUnit}>
              {addSaving && <Loader2 className="h-4 w-4 animate-spin" />} Add Ingredient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Ingredients Dialog ───────────────────────────────────────── */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-amber-500" />
              Import Ingredients
            </DialogTitle>
          </DialogHeader>

          {/* Mode picker */}
          {importMode === "choose" && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <button
                onClick={() => setImportMode("photo")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
              >
                <div className="h-12 w-12 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                  <Camera className="h-6 w-6 text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Photo / Invoice</p>
                  <p className="text-xs text-gray-500 mt-1">Upload a delivery photo, invoice or shelf image and Vera extracts every ingredient at once</p>
                </div>
              </button>
              <button
                onClick={() => setImportMode("barcode")}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-200 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
              >
                <div className="h-12 w-12 rounded-xl bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                  <Barcode className="h-6 w-6 text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">Barcode Lookup</p>
                  <p className="text-xs text-gray-500 mt-1">Scan or enter a product barcode — looks up name and details from Open Food Facts</p>
                </div>
              </button>
            </div>
          )}

          {/* Photo mode */}
          {importMode === "photo" && (
            <div className="space-y-4">
              <button onClick={() => setImportMode("choose")} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                ← Back
              </button>

              {/* Upload area */}
              {!photoPreview && (
                <label className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-gray-300 hover:border-amber-400 cursor-pointer transition-colors">
                  <Upload className="h-8 w-8 text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">Upload a delivery photo, invoice, or pantry shelf</p>
                    <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP · Vera extracts every visible ingredient</p>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              )}

              {/* Preview + re-upload */}
              {photoPreview && (
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Upload preview" className="h-28 w-28 object-cover rounded-lg border border-gray-200 shrink-0" />
                  <div className="flex-1">
                    {photoLoading && (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                        Vera is reading the photo…
                      </div>
                    )}
                    {photoError && (
                      <div className="flex items-start gap-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{photoError}
                      </div>
                    )}
                    {!photoLoading && (
                      <button onClick={() => { setPhotoPreview(null); setImportRows([]); setPhotoError(null); if (fileRef.current) fileRef.current.value = ""; }}
                        className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
                        Upload different image
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Extracted results table */}
              {importRows.length > 0 && !importSaved && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-700">
                      {importRows.length} ingredient{importRows.length !== 1 ? "s" : ""} extracted — review and set costs
                    </p>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setImportRows(r => r.map(x => ({ ...x, selected: true })))} className="text-amber-600 hover:underline">select all</button>
                      <button onClick={() => setImportRows(r => r.map(x => ({ ...x, selected: false })))} className="text-gray-400 hover:underline">none</button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-24">Unit</TableHead>
                          <TableHead className="w-28">Cost / Unit</TableHead>
                          <TableHead className="w-28">Min Level</TableHead>
                          <TableHead className="w-8">Vera</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importRows.map((row, i) => (
                          <TableRow key={i} className={!row.selected ? "opacity-40" : ""}>
                            <TableCell>
                              <input type="checkbox" checked={row.selected}
                                onChange={e => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))}
                                className="accent-amber-500 h-4 w-4" />
                            </TableCell>
                            <TableCell>
                              <input value={row.name}
                                onChange={e => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                                className="w-full text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-amber-400 focus:outline-none py-0.5" />
                              {row.notes && <p className="text-[10px] text-gray-400 mt-0.5">{row.notes}</p>}
                            </TableCell>
                            <TableCell>
                              <select value={row.suggestedUnit}
                                onChange={e => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, suggestedUnit: e.target.value } : r))}
                                className="text-sm bg-transparent border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-amber-400 w-full">
                                {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </TableCell>
                            <TableCell>
                              <input type="number" step="0.0001" placeholder="0.00" value={row.costPerUnit}
                                onChange={e => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, costPerUnit: e.target.value } : r))}
                                className="w-full text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-amber-400 focus:outline-none py-0.5" />
                            </TableCell>
                            <TableCell>
                              <input type="number" step="0.001" placeholder="0" value={row.minThreshold}
                                onChange={e => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, minThreshold: e.target.value } : r))}
                                className="w-full text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-amber-400 focus:outline-none py-0.5" />
                            </TableCell>
                            <TableCell>
                              <span className={cn("text-[10px] font-medium px-1 py-0.5 rounded",
                                row.confidence === "high" ? "bg-emerald-100 text-emerald-700" :
                                row.confidence === "medium" ? "bg-amber-100 text-amber-700" :
                                "bg-gray-100 text-gray-500")}>
                                {row.confidence}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {importSaved && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                  <Check className="h-4 w-4" />
                  {selectedCount} ingredient{selectedCount !== 1 ? "s" : ""} added to your library. Checking for recipe suggestions…
                </div>
              )}
            </div>
          )}

          {/* Barcode mode */}
          {importMode === "barcode" && (
            <div className="space-y-4">
              <button onClick={() => setImportMode("choose")} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>

              <div className="flex gap-2">
                <Input
                  placeholder="Enter barcode (e.g. 0123456789012)"
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && lookupBarcode()}
                  className="flex-1"
                />
                <Button onClick={lookupBarcode} disabled={barcodeLoading || !barcodeInput.trim()}>
                  {barcodeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />}
                  Look Up
                </Button>
              </div>

              {barcodeError && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{barcodeError}
                </p>
              )}

              {barcodeResult !== null && (
                <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {barcodeResult.name ? `Found: ${barcodeResult.brand ? barcodeResult.brand + " — " : ""}${barcodeResult.name}` : "Not found — enter details manually"}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input value={barcodeForm.name} onChange={e => setBarcodeForm(f => ({ ...f, name: e.target.value }))} placeholder="Ingredient name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Unit *</Label>
                      <Select value={barcodeForm.unit} onValueChange={v => setBarcodeForm(f => ({ ...f, unit: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{COMMON_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Cost per Unit *</Label>
                      <Input type="number" step="0.0001" placeholder="0.00" value={barcodeForm.costPerUnit} onChange={e => setBarcodeForm(f => ({ ...f, costPerUnit: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Min Threshold</Label>
                      <Input type="number" step="0.001" placeholder="0" value={barcodeForm.minThreshold} onChange={e => setBarcodeForm(f => ({ ...f, minThreshold: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveBarcodeIngredient} disabled={barcodeSaving || !barcodeForm.name || !barcodeForm.costPerUnit}>
                      {barcodeSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                      Add to Library
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer for photo mode */}
          {importMode === "photo" && importRows.length > 0 && !importSaved && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button onClick={saveImportRows} disabled={importSaving || selectedCount === 0}
                className="bg-amber-500 hover:bg-amber-600 text-white">
                {importSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Saving…</> : <><Check className="h-4 w-4 mr-1" /> Add {selectedCount} Ingredient{selectedCount !== 1 ? "s" : ""}</>}
              </Button>
            </DialogFooter>
          )}
          {importSaved && (
            <DialogFooter>
              <Button onClick={() => setImportOpen(false)}>Done</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Recipe Addition Suggestions Dialog ─────────────────────────────── */}
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <VeraAvatar className="h-6 w-6" />
              Recipe Addition Suggestions
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            These new ingredients could be added to existing recipes. Review them in Recipe Costing.
          </p>
          <div className="space-y-4">
            {recipeSuggestions.map(s => (
              <div key={s.ingredientId} className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                  <p className="text-sm font-semibold text-amber-900">{s.ingredientName}</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {s.menuItems.map(item => (
                    <div key={item.id} className="px-4 py-2.5 flex items-start gap-3">
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.name}
                          <span className="ml-2 text-xs text-gray-400 font-normal">{item.category}</span>
                        </p>
                        {item.reason && <p className="text-xs text-gray-500 mt-0.5">{item.reason}</p>}
                        {item.currentIngredients.length > 0 && (
                          <p className="text-[11px] text-gray-400 mt-0.5">Current: {item.currentIngredients.slice(0, 4).join(", ")}{item.currentIngredients.length > 4 ? "…" : ""}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestionsOpen(false)}>Dismiss</Button>
            <Button onClick={() => { setSuggestionsOpen(false); window.location.href = "/recipes"; }}
              className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Open Recipe Costing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
