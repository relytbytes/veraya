"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Plus, Truck, Loader2, Pencil, CheckCircle2,
  ChevronDown, ChevronRight, ClipboardList, X, Search,
  FlaskConical, Hash, ScanBarcode, Sparkles,
  TrendingUp, TrendingDown, Minus, AlertTriangle, BarChart2,
} from "lucide-react";
import { IngredientCombobox } from "@/components/purchasing/ingredient-combobox";
import { ScanDialog, type ScannedIngredient } from "@/components/purchasing/scan-dialog";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatQty } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  _count: { ingredients: number };
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  supplierId: string | null;
  barcode: string | null;
  isActive: boolean;
  supplier: { id: string; name: string } | null;
  inventoryItem: { quantity: number; minThreshold: number; maxThreshold: number | null } | null;
}

interface POItem {
  id: string;
  ingredientId: string;
  quantity: number;
  unitCost: number;
  ingredient: { id: string; name: string; unit: string };
}

interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: string;
  totalAmount: number;
  invoiceNumber: string | null;
  notes: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  vendor: { id: string; name: string };
  items: POItem[];
}

type Tab = "orders" | "ingredients" | "suppliers" | "prices" | "reorder";

// ── Price History Types ────────────────────────────────────────────────────────

interface PriceSupplier {
  supplierId: string;
  name: string;
  lastCost: number;
  ordersCount: number;
  totalQty: number;
}

interface PriceRow {
  ingredientId: string;
  name: string;
  unit: string;
  currentCostPerUnit: number;
  firstCost: number;
  lastCost: number;
  minCost: number;
  maxCost: number;
  avgCost: number;
  changePct: number;
  trend: "up" | "down" | "stable";
  totalOrders: number;
  suppliers: PriceSupplier[];
  bestSupplierId: string | null;
  bestSupplierName: string | null;
  bestSupplierPrice: number | null;
  savingsVsBest: number;
  pricePoints: { date: string; cost: number; supplier: string }[];
}

interface PriceHistoryData {
  lookbackDays: number;
  summary: {
    totalIngredients: number;
    risingCount: number;
    fallingCount: number;
    alertCount: number;
  };
  rows: PriceRow[];
}

// ── Suggestion Types ──────────────────────────────────────────────────────────

interface SuggestionItem {
  ingredientId: string;
  name: string;
  unit: string;
  currentQty: number;
  minThreshold: number;
  maxThreshold: number;
  orderQty: number;
  dailyUsage: number;
  daysUntilMin: number | null;
  urgency: "critical" | "high" | "medium";
  unitCost: number;
  estimatedCost: number;
  supplierId: string | null;
  supplierName: string | null;
  hasVelocityData: boolean;
}

interface SuggestionsBySupplier {
  supplierId: string;
  supplierName: string;
  items: SuggestionItem[];
  total: number;
}

interface SuggestionsData {
  velocityDays: number;
  leadDays: number;
  summary: {
    totalSuggestions: number;
    criticalCount: number;
    highCount: number;
    totalEstimatedCost: number;
  };
  suggestions: SuggestionItem[];
  bySupplier: SuggestionsBySupplier[];
  unassigned: SuggestionItem[];
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "warning" | "success" | "destructive"> = {
  DRAFT: "secondary",
  ORDERED: "warning",
  PARTIAL: "warning",
  PENDING_APPROVAL: "warning",
  RECEIVED: "success",
  CANCELLED: "destructive",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Pending Approval",
};

const EMPTY_SUPPLIER = { name: "", contactName: "", email: "", phone: "", address: "", notes: "" };
const EMPTY_ING = { name: "", unit: "", costPerUnit: "", supplierId: "", barcode: "", minThreshold: "", maxThreshold: "" };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PurchasingPage() {
  const { data: session } = useSession();
  const isManager = ["ADMIN", "MANAGER"].includes((session?.user as { role?: string } | undefined)?.role ?? "");
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ingSearch, setIngSearch] = useState("");

  // PO dialog
  const [poDialogOpen, setPODialogOpen] = useState(false);
  const [poSupplierId, setPOSupplierId] = useState("");
  const [poNotes, setPONotes] = useState("");
  const [poInvoice, setPOInvoice] = useState("");
  const [poItems, setPOItems] = useState<{ ingredientId: string; quantity: string; unitCost: string }[]>([
    { ingredientId: "", quantity: "", unitCost: "" },
  ]);
  const [poSaving, setPOSaving] = useState(false);

  // Scan dialog
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTargetLine, setScanTargetLine] = useState<number | null>(null); // which PO line is being scanned
  const [scanMode, setScanMode] = useState<"select" | "inventory">("select");

  // Invoice edit (inline on list)
  const [editingInvoice, setEditingInvoice] = useState<string | null>(null);
  const [invoiceInput, setInvoiceInput] = useState("");

  // Ingredient dialog
  const [ingDialogOpen, setIngDialogOpen] = useState(false);
  const [editIng, setEditIng] = useState<Ingredient | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ingForm, setIngForm] = useState<any>(EMPTY_ING);
  const [ingSaving, setIngSaving] = useState(false);

  // Manual cost adjustment (#3) — manager-only, reason required for the ledger.
  const [adjustIng, setAdjustIng] = useState<Ingredient | null>(null);
  const [adjustCost, setAdjustCost] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Supplier dialog
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER);
  const [supplierSaving, setSupplierSaving] = useState(false);

  // Price intelligence
  const [priceData, setPriceData] = useState<PriceHistoryData | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceLookback, setPriceLookback] = useState(180);

  // Smart reorder
  const [suggestionsData, setSuggestionsData] = useState<SuggestionsData | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [reorderCreating, setReorderCreating] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (tab === "prices") loadPrices(priceLookback);
    if (tab === "reorder") loadSuggestions();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    setLoading(true);
    const [ordersRes, suppliersRes, ingredientsRes] = await Promise.all([
      fetch("/api/purchase-orders"),
      fetch("/api/suppliers"),
      fetch("/api/ingredients"),
    ]);
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (suppliersRes.ok) setSuppliers(await suppliersRes.json());
    if (ingredientsRes.ok) setIngredients(await ingredientsRes.json());
    setLoading(false);
  }

  async function loadPrices(days: number) {
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/reports/price-history?days=${days}`);
      if (res.ok) setPriceData(await res.json());
    } catch { /* silent */ } finally {
      setPriceLoading(false);
    }
  }

  async function loadSuggestions() {
    setSuggestionsLoading(true);
    try {
      const res = await fetch("/api/purchasing/suggestions");
      if (res.ok) setSuggestionsData(await res.json());
    } catch { /* silent */ } finally {
      setSuggestionsLoading(false);
    }
  }

  async function createPOsFromSuggestions(items: { ingredientId: string; qty: number; supplierId: string; unitCost: number }[]) {
    setReorderCreating(true);
    try {
      const res = await fetch("/api/purchase-orders/from-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });
      if (res.ok) {
        await loadAll();
        setTab("orders");
      }
    } catch { /* silent */ } finally {
      setReorderCreating(false);
    }
  }

  // ── PO actions ──

  function resetPOForm() {
    setPOSupplierId(""); setPONotes(""); setPOInvoice("");
    setPOItems([{ ingredientId: "", quantity: "", unitCost: "" }]);
  }

  async function createPO() {
    setPOSaving(true);
    const validItems = poItems.filter((i) => i.ingredientId && i.quantity && i.unitCost);
    await fetch("/api/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        supplierId: poSupplierId,
        notes: poNotes || undefined,
        invoiceNumber: poInvoice || undefined,
        items: validItems.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: parseFloat(i.quantity),
          unitCost: parseFloat(i.unitCost),
        })),
      }),
    });
    setPOSaving(false);
    setPODialogOpen(false);
    resetPOForm();
    loadAll();
  }

  async function updatePOStatus(id: string, status: string) {
    await fetch(`/api/purchase-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadAll();
  }

  // Approve & receive (#1): surface price-swing flags before committing cost+stock.
  async function approveAndReceive(id: string) {
    let flagNote = "";
    try {
      const res = await fetch(`/api/purchase-orders/${id}`);
      if (res.ok) {
        const detail = await res.json();
        const flags: { name: string; oldCost: number; newCost: number; pct: number }[] = detail.reviewFlags?.priceFlags ?? [];
        if (flags.length) {
          flagNote = " Review price changes: " + flags
            .map((f) => `${f.name} $${f.oldCost.toFixed(2)}→$${f.newCost.toFixed(2)} (${f.pct > 0 ? "+" : ""}${f.pct}%)`)
            .join(", ") + ".";
        }
      }
    } catch { /* proceed without flags */ }
    const ok = await confirmDialog({
      title: "Approve & receive order?",
      message: `This commits inventory and updates ingredient costs (weighted average).${flagNote}`,
      confirmText: "Approve & Receive",
    });
    if (!ok) return;
    await updatePOStatus(id, "RECEIVED");
    toast.success("Order received — inventory and costs updated.");
  }

  function openAdjustCost(ing: Ingredient) {
    setAdjustIng(ing);
    setAdjustCost(String(ing.costPerUnit));
    setAdjustReason("");
  }

  async function saveAdjustCost() {
    if (!adjustIng) return;
    const newCost = parseFloat(adjustCost);
    if (!Number.isFinite(newCost) || newCost < 0) {
      toast.error("Enter a valid cost.");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("A reason is required for the audit trail.");
      return;
    }
    setAdjustSaving(true);
    try {
      const res = await fetch(`/api/ingredients/${adjustIng.id}/adjust-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newCost, reason: adjustReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Could not adjust cost.");
        return;
      }
      toast.success(`Cost updated for ${adjustIng.name}.`);
      setAdjustIng(null);
      loadAll();
    } finally {
      setAdjustSaving(false);
    }
  }

  async function saveInvoice(id: string) {
    await fetch(`/api/purchase-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceNumber: invoiceInput }),
    });
    setEditingInvoice(null);
    loadAll();
  }

  // ── PO line item helpers ──

  function addPOItem() {
    setPOItems([...poItems, { ingredientId: "", quantity: "", unitCost: "" }]);
  }

  function removePOItem(i: number) {
    setPOItems(poItems.filter((_, idx) => idx !== i));
  }

  function updatePOItem(i: number, field: string, value: string) {
    const next = [...poItems];
    next[i] = { ...next[i], [field]: value };
    if (field === "ingredientId") {
      const ing = ingredients.find((x) => x.id === value);
      if (ing) next[i].unitCost = String(ing.costPerUnit);
    }
    setPOItems(next);
  }

  function openScanForLine(lineIndex: number) {
    setScanTargetLine(lineIndex);
    setScanMode("select");
    setScanOpen(true);
  }

  function handleScanSelect(ing: ScannedIngredient) {
    if (scanTargetLine !== null) {
      const next = [...poItems];
      next[scanTargetLine] = {
        ingredientId: ing.id,
        quantity: next[scanTargetLine].quantity || "1",
        unitCost: String(ing.costPerUnit),
      };
      setPOItems(next);
    }
    setScanOpen(false);
    setScanTargetLine(null);
    // Add to local ingredients list if not already there
    if (!ingredients.find((x) => x.id === ing.id)) {
      setIngredients((prev) => [...prev, ing as Ingredient]);
    }
  }

  const poTotal = poItems.reduce((sum, i) => {
    return sum + (parseFloat(i.quantity) || 0) * (parseFloat(i.unitCost) || 0);
  }, 0);

  // ── Ingredient actions ──

  function openCreateIng() {
    setEditIng(null);
    setIngForm(EMPTY_ING);
    setIngDialogOpen(true);
  }

  function openEditIng(ing: Ingredient) {
    setEditIng(ing);
    setIngForm({
      name: ing.name,
      unit: ing.unit,
      costPerUnit: String(ing.costPerUnit),
      supplierId: ing.supplierId ?? "",
      barcode: ing.barcode ?? "",
      minThreshold: String(ing.inventoryItem?.minThreshold ?? ""),
      maxThreshold: String(ing.inventoryItem?.maxThreshold ?? ""),
    });
    setIngDialogOpen(true);
  }

  async function saveIng() {
    setIngSaving(true);
    const payload = {
      name: ingForm.name,
      unit: ingForm.unit,
      costPerUnit: parseFloat(ingForm.costPerUnit),
      supplierId: ingForm.supplierId || undefined,
      barcode: ingForm.barcode || undefined,
      minThreshold: ingForm.minThreshold ? parseFloat(ingForm.minThreshold) : 0,
      maxThreshold: ingForm.maxThreshold ? parseFloat(ingForm.maxThreshold) : undefined,
    };

    if (editIng) {
      await fetch(`/api/ingredients/${editIng.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setIngSaving(false);
    setIngDialogOpen(false);
    loadAll();
  }

  // ── Supplier actions ──

  async function deleteSupplier(id: string, name: string) {
    if (!(await confirmDialog(`Delete supplier "${name}"? This cannot be undone.`))) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error((data as { error?: string }).error ?? "Failed to delete supplier.");
      return;
    }
    loadAll();
  }

  async function saveSupplier() {
    setSupplierSaving(true);
    if (editSupplier) {
      await fetch(`/api/suppliers/${editSupplier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });
    } else {
      await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supplierForm),
      });
    }
    setSupplierSaving(false);
    setSupplierDialogOpen(false);
    setEditSupplier(null);
    setSupplierForm(EMPTY_SUPPLIER);
    loadAll();
  }

  // ── Filtered ingredients ──

  const filteredIngredients = ingredients.filter((i) =>
    i.name.toLowerCase().includes(ingSearch.toLowerCase()) ||
    i.unit.toLowerCase().includes(ingSearch.toLowerCase()) ||
    (i.supplier?.name ?? "").toLowerCase().includes(ingSearch.toLowerCase())
  );

  // ── Render ──

  return (
    <div>
      <Header
        title="Purchasing"
        description="Manage purchase orders, ingredients, and suppliers"
        actions={
          <div className="flex gap-2">
            {tab === "orders" && (
              <Button size="sm" onClick={() => { resetPOForm(); setPODialogOpen(true); }}>
                <Plus className="h-4 w-4" /> New Order
              </Button>
            )}
            {tab === "ingredients" && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setScanMode("inventory"); setScanTargetLine(null); setScanOpen(true); }}>
                  <ScanBarcode className="h-4 w-4" /> Scan
                </Button>
                <Button size="sm" onClick={openCreateIng}>
                  <Plus className="h-4 w-4" /> Add Ingredient
                </Button>
              </div>
            )}
            {tab === "suppliers" && (
              <Button size="sm" onClick={() => { setEditSupplier(null); setSupplierForm(EMPTY_SUPPLIER); setSupplierDialogOpen(true); }}>
                <Truck className="h-4 w-4" /> Add Supplier
              </Button>
            )}
          </div>
        }
      />

      {/* Tabs */}
      <div className="px-6 pt-4 border-b border-gray-200">
        <div className="flex gap-4">
          {([
            ["orders", "Purchase Orders", <ClipboardList key="o" className="h-3.5 w-3.5" />],
            ["ingredients", "Ingredients", <FlaskConical key="i" className="h-3.5 w-3.5" />],
            ["suppliers", "Suppliers", <Truck key="s" className="h-3.5 w-3.5" />],
            ["prices", "Price Intelligence", <BarChart2 key="p" className="h-3.5 w-3.5" />],
            ["reorder", "Smart Reorder", <Sparkles key="r" className="h-3.5 w-3.5" />],
          ] as [Tab, string, React.ReactNode][]).map(([t, label, icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === t ? "border-amber-500 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : tab === "orders" ? (
          <OrdersTab
            orders={orders}
            expanded={expanded}
            setExpanded={setExpanded}
            editingInvoice={editingInvoice}
            invoiceInput={invoiceInput}
            setInvoiceInput={setInvoiceInput}
            setEditingInvoice={setEditingInvoice}
            saveInvoice={saveInvoice}
            updatePOStatus={updatePOStatus}
            isManager={isManager}
            approveAndReceive={approveAndReceive}
          />
        ) : tab === "ingredients" ? (
          <IngredientsTab
            ingredients={filteredIngredients}
            search={ingSearch}
            setSearch={setIngSearch}
            onEdit={openEditIng}
            canAdjust={isManager}
            onAdjustCost={openAdjustCost}
          />
        ) : tab === "suppliers" ? (
          <SuppliersTab
            suppliers={suppliers}
            onEdit={(s) => {
              setEditSupplier(s);
              setSupplierForm({
                name: s.name, contactName: s.contactName ?? "",
                email: s.email ?? "", phone: s.phone ?? "",
                address: s.address ?? "", notes: "",
              });
              setSupplierDialogOpen(true);
            }}
            onDelete={deleteSupplier}
          />
        ) : tab === "prices" ? (
          <PricesTab
            data={priceData}
            loading={priceLoading}
            lookback={priceLookback}
            onLookbackChange={(d) => { setPriceLookback(d); loadPrices(d); }}
          />
        ) : (
          <ReorderTab
            data={suggestionsData}
            loading={suggestionsLoading}
            creating={reorderCreating}
            onRefresh={loadSuggestions}
            onCreatePOs={createPOsFromSuggestions}
          />
        )}
      </div>

      {/* New PO Dialog */}
      <Dialog open={poDialogOpen} onOpenChange={setPODialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Supplier *</Label>
                <Select value={poSupplierId} onValueChange={setPOSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice # <span className="text-gray-400 font-normal">(optional)</span></Label>
                <div className="relative">
                  <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="e.g. INV-0042"
                    value={poInvoice}
                    onChange={(e) => setPOInvoice(e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input placeholder="Optional notes…" value={poNotes} onChange={(e) => setPONotes(e.target.value)} />
            </div>

            {/* Line Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line Items</Label>
                <Button size="sm" variant="outline" onClick={addPOItem}>
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_28px_80px_100px_28px] gap-2 px-1">
                  <span className="text-xs text-gray-400 font-medium">Ingredient</span>
                  <span />
                  <span className="text-xs text-gray-400 font-medium">Qty</span>
                  <span className="text-xs text-gray-400 font-medium">$/unit</span>
                  <span />
                </div>
                {poItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_28px_80px_100px_28px] gap-2 items-start">
                    <IngredientCombobox
                      value={item.ingredientId}
                      onChange={(id, ing) => {
                        const next = [...poItems];
                        next[i] = { ...next[i], ingredientId: id, unitCost: String(ing.costPerUnit) };
                        setPOItems(next);
                      }}
                      ingredients={ingredients}
                      onCreateNew={(name) => {
                        setIngForm({ ...EMPTY_ING, name });
                        setEditIng(null);
                        setIngDialogOpen(true);
                      }}
                    />
                    {/* Scan button per line */}
                    <Button
                      variant="ghost"
                      size="icon" aria-label="Scan barcode or photo"
                      className="h-9 w-7 text-gray-400 hover:text-amber-600"
                      title="Scan barcode or photo"
                      onClick={() => openScanForLine(i)}
                      type="button"
                    >
                      <ScanBarcode className="h-4 w-4" />
                    </Button>
                    <Input type="number" placeholder="Qty" value={item.quantity} onChange={(e) => updatePOItem(i, "quantity", e.target.value)} />
                    <Input type="number" placeholder="0.00" value={item.unitCost} onChange={(e) => updatePOItem(i, "unitCost", e.target.value)} />
                    <Button variant="ghost" size="icon" aria-label="Remove item" className="h-9 w-7 text-gray-400 hover:text-red-500" onClick={() => removePOItem(i)} disabled={poItems.length === 1} type="button">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <div className="text-right">
                <p className="text-xs text-gray-500">Estimated Total</p>
                <p className="text-xl font-bold text-gray-900">{formatCurrency(poTotal)}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPODialogOpen(false)}>Cancel</Button>
            <Button onClick={createPO} disabled={poSaving || !poSupplierId || poItems.every((i) => !i.ingredientId)}>
              {poSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Draft Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scan Dialog */}
      <ScanDialog
        open={scanOpen}
        onClose={() => { setScanOpen(false); setScanTargetLine(null); }}
        onSelect={scanMode === "select" ? handleScanSelect : (ing) => {
          // inventory mode: open the ingredient detail or just close
          setScanOpen(false);
        }}
        mode={scanMode}
      />

      {/* Ingredient Dialog */}
      <Dialog open={ingDialogOpen} onOpenChange={setIngDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editIng ? "Edit Ingredient" : "Add Ingredient"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="e.g. Chicken Breast" value={ingForm.name} onChange={(e) => setIngForm({ ...ingForm, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Input placeholder="e.g. lb, kg, L" value={ingForm.unit} onChange={(e) => setIngForm({ ...ingForm, unit: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cost Per Unit *</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={ingForm.costPerUnit} onChange={(e) => setIngForm({ ...ingForm, costPerUnit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Barcode / UPC <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="e.g. 012345678905"
                    value={ingForm.barcode}
                    onChange={(e) => setIngForm({ ...ingForm, barcode: e.target.value })}
                    className="pl-8 font-mono text-sm"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon" aria-label="Scan barcode"
                  title="Scan barcode"
                  onClick={() => { setScanMode("select"); setScanTargetLine(null); setScanOpen(true); }}
                >
                  <ScanBarcode className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Select
                value={ingForm.supplierId || "__none__"}
                onValueChange={(v) => setIngForm({ ...ingForm, supplierId: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Stock Alert</Label>
                <Input type="number" step="0.1" placeholder="0" value={ingForm.minThreshold} onChange={(e) => setIngForm({ ...ingForm, minThreshold: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Stock</Label>
                <Input type="number" step="0.1" placeholder="Optional" value={ingForm.maxThreshold} onChange={(e) => setIngForm({ ...ingForm, maxThreshold: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIngDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveIng} disabled={ingSaving || !ingForm.name || !ingForm.unit || !ingForm.costPerUnit}>
              {ingSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editIng ? "Save" : "Add Ingredient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key: "name", label: "Company Name *", placeholder: "e.g. Fresh Foods Co." },
              { key: "contactName", label: "Contact Name", placeholder: "e.g. John Smith" },
              { key: "email", label: "Email", placeholder: "contact@supplier.com" },
              { key: "phone", label: "Phone", placeholder: "(555) 000-0000" },
              { key: "address", label: "Address", placeholder: "123 Main St, City, State" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label>{label}</Label>
                <Input placeholder={placeholder} value={supplierForm[key as keyof typeof supplierForm]} onChange={(e) => setSupplierForm({ ...supplierForm, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveSupplier} disabled={supplierSaving || !supplierForm.name}>
              {supplierSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual cost adjustment (#3) — manager-gated; reason is required and stored on the inventory ledger. */}
      <Dialog open={!!adjustIng} onOpenChange={(o) => { if (!o) setAdjustIng(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Adjust cost{adjustIng ? ` — ${adjustIng.name}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Current cost {adjustIng ? `${formatCurrency(Number(adjustIng.costPerUnit))} / ${adjustIng.unit}` : ""}.
              This writes a new unit cost and records a reason on the inventory ledger for audit.
            </p>
            <div className="space-y-1.5">
              <Label>New cost per {adjustIng?.unit ?? "unit"} *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0.00" value={adjustCost} onChange={(e) => setAdjustCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input placeholder="e.g. supplier price correction, contract renegotiation" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustIng(null)}>Cancel</Button>
            <Button onClick={saveAdjustCost} disabled={adjustSaving || !adjustCost || !adjustReason.trim()}>
              {adjustSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function OrdersTab({
  orders, expanded, setExpanded,
  editingInvoice, invoiceInput, setInvoiceInput, setEditingInvoice, saveInvoice,
  updatePOStatus, isManager, approveAndReceive,
}: {
  orders: PurchaseOrder[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  editingInvoice: string | null;
  invoiceInput: string;
  setInvoiceInput: (v: string) => void;
  setEditingInvoice: (id: string | null) => void;
  saveInvoice: (id: string) => void;
  updatePOStatus: (id: string, status: string) => void;
  isManager: boolean;
  approveAndReceive: (id: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="py-24 text-center text-gray-400">
        <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No purchase orders yet</p>
        <p className="text-sm mt-1">Create an order to track incoming inventory</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((po) => (
        <Card key={po.id} className="overflow-hidden">
          <div
            className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => setExpanded(expanded === po.id ? null : po.id)}
          >
            <span className="text-gray-400">
              {expanded === po.id
                ? <ChevronDown className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{po.vendor.name}</p>
                <Badge variant={STATUS_COLORS[po.status] ?? "secondary"}>{STATUS_LABELS[po.status] ?? po.status}</Badge>
                {/* Invoice number badge / inline edit */}
                {editingInvoice === po.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Hash className="h-3.5 w-3.5 text-gray-400" />
                    <input
                      autoFocus
                      className="border border-amber-400 rounded px-2 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      value={invoiceInput}
                      onChange={(e) => setInvoiceInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveInvoice(po.id);
                        if (e.key === "Escape") setEditingInvoice(null);
                      }}
                      placeholder="INV-0001"
                    />
                    <button
                      onClick={() => saveInvoice(po.id)}
                      className="text-xs px-1.5 py-0.5 bg-amber-500 text-white rounded hover:bg-amber-600"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingInvoice(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingInvoice(po.id);
                      setInvoiceInput(po.invoiceNumber ?? "");
                    }}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-amber-600 transition-colors"
                  >
                    <Hash className="h-3 w-3" />
                    {po.invoiceNumber
                      ? <span className="font-mono text-gray-700">{po.invoiceNumber}</span>
                      : <span className="italic">Add invoice #</span>}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {po.items.length} items · {new Date(po.createdAt).toLocaleDateString()}
                {po.orderedAt && ` · Ordered ${new Date(po.orderedAt).toLocaleDateString()}`}
                {po.receivedAt && ` · Received ${new Date(po.receivedAt).toLocaleDateString()}`}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-gray-900">{formatCurrency(Number(po.totalAmount))}</p>
            </div>
            <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              {po.status === "DRAFT" && (
                <Button size="sm" variant="outline" onClick={() => updatePOStatus(po.id, "ORDERED")}>
                  Send Order
                </Button>
              )}
              {(po.status === "ORDERED" || po.status === "PARTIAL") && (
                isManager ? (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => approveAndReceive(po.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Receive
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => updatePOStatus(po.id, "RECEIVED")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Received
                  </Button>
                )
              )}
              {po.status === "PENDING_APPROVAL" && (
                isManager ? (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => approveAndReceive(po.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; Receive
                  </Button>
                ) : (
                  <span className="self-center px-2 text-xs font-medium text-amber-600">Awaiting approval</span>
                )
              )}
            </div>
          </div>

          {expanded === po.id && (
            <div className="overflow-x-auto border-t border-gray-100 bg-gray-50 px-4 py-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 uppercase">
                    <th className="text-left pb-2">Ingredient</th>
                    <th className="text-right pb-2">Qty</th>
                    <th className="text-right pb-2">Unit Cost</th>
                    <th className="text-right pb-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {po.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1.5 font-medium">{item.ingredient.name}</td>
                      <td className="py-1.5 text-right text-gray-500">
                        {formatQty(item.quantity)} {item.ingredient.unit}
                      </td>
                      <td className="py-1.5 text-right text-gray-500">{formatCurrency(Number(item.unitCost))}</td>
                      <td className="py-1.5 text-right font-semibold">
                        {formatCurrency(Number(item.quantity) * Number(item.unitCost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {po.notes && <p className="text-xs text-gray-500 mt-2 italic">Note: {po.notes}</p>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function IngredientsTab({
  ingredients, search, setSearch, onEdit, canAdjust, onAdjustCost,
}: {
  ingredients: Ingredient[];
  search: string;
  setSearch: (v: string) => void;
  onEdit: (ing: Ingredient) => void;
  canAdjust: boolean;
  onAdjustCost: (ing: Ingredient) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search ingredients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {ingredients.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ingredients found</p>
          <p className="text-sm mt-1">Add ingredients to use in recipes and purchase orders</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ingredients.map((ing) => {
            const stock = ing.inventoryItem?.quantity ?? 0;
            const min = ing.inventoryItem?.minThreshold ?? 0;
            const isLow = stock <= min;
            return (
              <Card key={ing.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{ing.name}</p>
                        {isLow && <Badge variant="destructive" className="text-xs shrink-0">Low</Badge>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatCurrency(Number(ing.costPerUnit))} / {ing.unit}
                      </p>
                      {ing.supplier && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <Truck className="h-3 w-3" /> {ing.supplier.name}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Edit ingredient" className="h-8 w-8 shrink-0" onClick={() => onEdit(ing)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>In stock: <strong className={isLow ? "text-red-600" : "text-gray-900"}>{formatQty(stock)} {ing.unit}</strong></span>
                    <span className="text-gray-400">min {formatQty(min)}</span>
                  </div>
                  {canAdjust && (
                    <button
                      onClick={() => onAdjustCost(ing)}
                      className="mt-2 text-xs font-medium text-amber-600 hover:text-amber-700"
                    >
                      Adjust cost…
                    </button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuppliersTab({
  suppliers, onEdit, onDelete,
}: {
  suppliers: Supplier[];
  onEdit: (s: Supplier) => void;
  onDelete: (id: string, name: string) => void;
}) {
  if (suppliers.length === 0) {
    return (
      <div className="py-24 text-center text-gray-400">
        <Truck className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No suppliers yet</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {suppliers.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{s.name}</p>
                {s.contactName && <p className="text-sm text-gray-500 mt-0.5">{s.contactName}</p>}
                {s.email && <p className="text-sm text-gray-400 mt-1">{s.email}</p>}
                {s.phone && <p className="text-sm text-gray-400">{s.phone}</p>}
                {s.address && <p className="text-xs text-gray-400 mt-1">{s.address}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" aria-label="Edit supplier" onClick={() => onEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon" aria-label="Delete supplier"
                  className="text-red-400 hover:text-red-600 hover:bg-red-50"
                  onClick={() => onDelete(s.id, s.name)}
                  title="Delete supplier"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">{s._count.ingredients} ingredients</Badge>
              <Badge variant={s.isActive ? "success" : "secondary"}>
                {s.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Price Intelligence Tab ────────────────────────────────────────────────────

function PricesTab({
  data,
  loading,
  lookback,
  onLookbackChange,
}: {
  data: PriceHistoryData | null;
  loading: boolean;
  lookback: number;
  onLookbackChange: (days: number) => void;
}) {
  const [filter, setFilter] = useState<"all" | "rising" | "falling" | "alerts">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-16">
      <BarChart2 className="h-10 w-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">No price data available</p>
      <p className="text-sm text-gray-400 mt-1">Price intelligence requires received purchase orders</p>
    </div>
  );

  const { summary, rows } = data;

  const visibleRows = rows.filter((r) => {
    if (filter === "rising") return r.trend === "up";
    if (filter === "falling") return r.trend === "down";
    if (filter === "alerts") return Math.abs(r.changePct) > 10;
    return true;
  });

  function trendIcon(trend: PriceRow["trend"]) {
    if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
    if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-green-500" />;
    return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  }

  function trendColor(trend: PriceRow["trend"], changePct: number) {
    if (trend === "up" && Math.abs(changePct) > 10) return "text-red-600";
    if (trend === "up") return "text-warning-600";
    if (trend === "down") return "text-green-600";
    return "text-gray-500";
  }

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Tracked Ingredients", value: String(summary.totalIngredients), sub: `last ${lookback} days`, icon: <BarChart2 className="h-4 w-4 text-blue-500" />, bg: "bg-blue-50" },
          { label: "Rising Prices", value: String(summary.risingCount), sub: "trending up", icon: <TrendingUp className="h-4 w-4 text-red-500" />, bg: "bg-red-50" },
          { label: "Falling Prices", value: String(summary.fallingCount), sub: "trending down", icon: <TrendingDown className="h-4 w-4 text-green-600" />, bg: "bg-green-50" },
          { label: "Price Alerts", value: String(summary.alertCount), sub: ">10% change", icon: <AlertTriangle className="h-4 w-4 text-warning-500" />, bg: "bg-warning-50" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500">{kpi.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-0.5">{kpi.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
                </div>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.bg}`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Lookback selector */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-xs font-medium text-gray-500">Period:</span>
          {[
            { label: "30d", value: 30 },
            { label: "90d", value: 90 },
            { label: "180d", value: 180 },
            { label: "1yr", value: 365 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onLookbackChange(opt.value)}
              className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                lookback === opt.value
                  ? "bg-amber-500 text-white border-amber-500"
                  : "border-gray-200 text-gray-500 hover:text-gray-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-200" />

        {/* Filter */}
        {[
          { label: `All (${rows.length})`, value: "all" as const },
          { label: `Rising (${summary.risingCount})`, value: "rising" as const },
          { label: `Falling (${summary.fallingCount})`, value: "falling" as const },
          { label: `Alerts (${summary.alertCount})`, value: "alerts" as const },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              filter === f.value
                ? "bg-amber-500 text-white border-amber-500"
                : "border-gray-200 text-gray-500 hover:text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Price table */}
      {visibleRows.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
          No ingredients match this filter
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ingredient</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">First Price</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Current</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Change</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Range</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Best Supplier</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Orders</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((row) => (
                <React.Fragment key={row.ingredientId}>
                  <tr
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${
                      Math.abs(row.changePct) > 10 ? "bg-red-50/30" : ""
                    }`}
                    onClick={() => setExpanded(expanded === row.ingredientId ? null : row.ingredientId)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {trendIcon(row.trend)}
                        <span className="font-medium text-gray-900">{row.name}</span>
                        <span className="text-xs text-gray-400">/{row.unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {formatCurrency(row.firstCost)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      {formatCurrency(row.lastCost)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${trendColor(row.trend, row.changePct)}`}>
                      {row.changePct >= 0 ? "+" : ""}{row.changePct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-gray-500">
                      {formatCurrency(row.minCost)} – {formatCurrency(row.maxCost)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.bestSupplierName && row.bestSupplierPrice !== null ? (
                        <div className="text-right">
                          <p className="text-xs font-medium text-gray-700">{row.bestSupplierName}</p>
                          <p className="text-xs text-green-600 font-semibold">{formatCurrency(row.bestSupplierPrice)}</p>
                          {row.savingsVsBest > 0 && (
                            <p className="text-[10px] text-amber-600">save {formatCurrency(row.savingsVsBest)}/unit</p>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">{row.totalOrders}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {expanded === row.ingredientId
                        ? <ChevronDown className="h-3.5 w-3.5" />
                        : <ChevronRight className="h-3.5 w-3.5" />}
                    </td>
                  </tr>
                  {expanded === row.ingredientId && (
                    <tr>
                      <td colSpan={8} className="px-4 py-4 bg-gray-50/60 border-t border-b border-gray-100">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          {/* Price history */}
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Price History</p>
                            <div className="space-y-1">
                              {row.pricePoints.slice(-10).map((p, i) => (
                                <div key={i} className="flex items-center justify-between text-xs text-gray-700 py-0.5">
                                  <span className="text-gray-400">{p.date}</span>
                                  <span className="text-gray-500">{p.supplier}</span>
                                  <span className="font-semibold tabular-nums">{formatCurrency(p.cost)}</span>
                                </div>
                              ))}
                              {row.pricePoints.length > 10 && (
                                <p className="text-[10px] text-gray-400">+{row.pricePoints.length - 10} earlier entries</p>
                              )}
                            </div>
                          </div>
                          {/* Supplier comparison */}
                          {row.suppliers.length > 1 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Supplier Comparison</p>
                              <div className="space-y-1.5">
                                {[...row.suppliers].sort((a, b) => a.lastCost - b.lastCost).map((s) => (
                                  <div key={s.supplierId} className="flex items-center gap-3 text-xs">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                                      s.supplierId === row.bestSupplierId ? "bg-green-500" : "bg-gray-300"
                                    }`} />
                                    <span className="flex-1 text-gray-700">{s.name}</span>
                                    <span className="tabular-nums font-semibold">{formatCurrency(s.lastCost)}/{row.unit}</span>
                                    <span className="text-gray-400">{s.ordersCount} order{s.ordersCount !== 1 ? "s" : ""}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Smart Reorder Tab ─────────────────────────────────────────────────────────

function ReorderTab({
  data,
  loading,
  creating,
  onRefresh,
  onCreatePOs,
}: {
  data: SuggestionsData | null;
  loading: boolean;
  creating: boolean;
  onRefresh: () => void;
  onCreatePOs: (items: { ingredientId: string; qty: number; supplierId: string; unitCost: number }[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});

  React.useEffect(() => {
    if (data) {
      // Auto-select all critical + high urgency items that have a supplier
      const autoSelected = data.suggestions
        .filter(s => s.urgency !== "medium" && s.supplierId)
        .map(s => s.ingredientId);
      setSelected(new Set(autoSelected));
    }
  }, [data]);

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-16">
      <Sparkles className="h-10 w-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-500 font-medium">No reorder data loaded</p>
    </div>
  );

  if (data.suggestions.length === 0) return (
    <div className="text-center py-16">
      <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
      <p className="text-gray-700 font-semibold text-lg">All stocked up!</p>
      <p className="text-sm text-gray-400 mt-1">No ingredients need reordering right now</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>Refresh</Button>
    </div>
  );

  const { summary, bySupplier, unassigned } = data;

  function toggleItem(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSupplierGroup(supplierId: string, items: SuggestionItem[]) {
    const allSelected = items.every(i => selected.has(i.ingredientId));
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(i => allSelected ? next.delete(i.ingredientId) : next.add(i.ingredientId));
      return next;
    });
  }

  function handleCreatePOs() {
    if (!data) return;
    const toCreate = data.suggestions
      .filter(s => selected.has(s.ingredientId) && s.supplierId)
      .map(s => ({
        ingredientId: s.ingredientId,
        qty: Number(qtyOverrides[s.ingredientId] ?? s.orderQty),
        supplierId: s.supplierId!,
        unitCost: s.unitCost,
      }));
    if (toCreate.length > 0) onCreatePOs(toCreate);
  }

  const selectedItems = data.suggestions.filter(s => selected.has(s.ingredientId));
  const selectedWithSupplier = selectedItems.filter(s => s.supplierId);
  const selectedTotal = selectedWithSupplier.reduce((sum, s) => {
    const qty = Number(qtyOverrides[s.ingredientId] ?? s.orderQty);
    return sum + qty * s.unitCost;
  }, 0);

  function urgencyBadge(u: SuggestionItem["urgency"]) {
    if (u === "critical") return <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-700">Critical</span>;
    if (u === "high") return <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">High</span>;
    return <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Medium</span>;
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Items to Reorder", value: String(summary.totalSuggestions), color: "text-gray-900" },
          { label: "Critical", value: String(summary.criticalCount), color: summary.criticalCount > 0 ? "text-red-600" : "text-gray-900" },
          { label: "High Priority", value: String(summary.highCount), color: summary.highCount > 0 ? "text-orange-600" : "text-gray-900" },
          { label: "Estimated Cost", value: formatCurrency(summary.totalEstimatedCost), color: "text-gray-900" },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{kpi.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <div className="text-sm text-amber-800">
          <span className="font-semibold">{selectedWithSupplier.length} item{selectedWithSupplier.length !== 1 ? "s" : ""}</span> selected · {formatCurrency(selectedTotal)} estimated
          {selectedItems.length > selectedWithSupplier.length && (
            <span className="ml-2 text-amber-600 text-xs">({selectedItems.length - selectedWithSupplier.length} without supplier will be skipped)</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleCreatePOs}
            disabled={creating || selectedWithSupplier.length === 0}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Create {bySupplier.filter(g => g.items.some(i => selected.has(i.ingredientId))).length || 1} PO{bySupplier.filter(g => g.items.some(i => selected.has(i.ingredientId))).length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>

      {/* By supplier groups */}
      {bySupplier.map((group) => (
        <div key={group.supplierId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Group header */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 cursor-pointer select-none"
            onClick={() => toggleSupplierGroup(group.supplierId, group.items)}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={group.items.every(i => selected.has(i.ingredientId))}
                onChange={() => toggleSupplierGroup(group.supplierId, group.items)}
                onClick={e => e.stopPropagation()}
                className="rounded border-gray-300"
              />
              <Truck className="h-4 w-4 text-gray-400" />
              <span className="font-semibold text-gray-900 text-sm">{group.supplierName}</span>
              <span className="text-xs text-gray-400">{group.items.length} item{group.items.length !== 1 ? "s" : ""}</span>
            </div>
            <span className="text-sm font-semibold text-gray-700">{formatCurrency(group.total)}</span>
          </div>

          {/* Items */}
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {group.items.map((item) => (
                <tr
                  key={item.ingredientId}
                  className={`hover:bg-gray-50 cursor-pointer ${selected.has(item.ingredientId) ? "bg-amber-50/30" : ""}`}
                  onClick={() => toggleItem(item.ingredientId)}
                >
                  <td className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(item.ingredientId)}
                      onChange={() => toggleItem(item.ingredientId)}
                      onClick={e => e.stopPropagation()}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      {urgencyBadge(item.urgency)}
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.currentQty.toFixed(1)} {item.unit} on hand · min {formatQty(item.minThreshold)} {item.unit}
                      {item.hasVelocityData && item.daysUntilMin !== null && (
                        <span className={item.daysUntilMin <= 1 ? " text-red-500 font-medium" : item.daysUntilMin <= 3 ? " text-warning-500" : ""}>
                          {" "}· {item.daysUntilMin.toFixed(1)} days supply left
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-xs text-gray-400">daily use</div>
                    <div className="text-sm font-medium text-gray-700">
                      {item.hasVelocityData ? `${item.dailyUsage.toFixed(2)} ${item.unit}` : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="text-xs text-gray-400 mb-1">order qty</div>
                    <input
                      type="number"
                      value={qtyOverrides[item.ingredientId] ?? formatQty(item.orderQty, 0)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setQtyOverrides(prev => ({ ...prev, [item.ingredientId]: e.target.value }));
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 text-right text-sm font-semibold border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      min="0"
                      step="1"
                    />
                    <span className="ml-1 text-xs text-gray-400">{item.unit}</span>
                  </td>
                  <td className="pl-3 pr-4 py-3 text-right">
                    <div className="text-xs text-gray-400">est. cost</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency((Number(qtyOverrides[item.ingredientId] ?? item.orderQty)) * item.unitCost)}
                    </div>
                    <div className="text-xs text-gray-400">{formatCurrency(item.unitCost)}/{item.unit}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Unassigned items */}
      {unassigned.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <AlertTriangle className="h-4 w-4 text-warning-400" />
            <span className="font-semibold text-gray-700 text-sm">No Supplier Assigned</span>
            <span className="text-xs text-gray-400">{unassigned.length} item{unassigned.length !== 1 ? "s" : ""} — assign a supplier to include in POs</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-50">
              {unassigned.map((item) => (
                <tr key={item.ingredientId} className="opacity-60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {urgencyBadge(item.urgency)}
                      <span className="font-medium text-gray-700">{item.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.currentQty.toFixed(1)} {item.unit} on hand · min {formatQty(item.minThreshold)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-400">
                    Assign a supplier in Ingredients tab
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Need React import for JSX in tab definitions
import React from "react";
