"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Pencil, ToggleLeft, ToggleRight, Loader2, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  _count: { menuItems: number };
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: string;
}

interface RecipeIngredient {
  ingredientId: string;
  quantity: number;
  ingredient: Ingredient;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: string;
  categoryId: string;
  isActive: boolean;
  prepTime: number | null;
  imageUrl?: string;
  trackCount: boolean;
  countRemaining: number | null;
  category: Category;
  recipe: RecipeIngredient[];
}

interface ModifierOption {
  id: string;
  name: string;
  priceAdj: string;
  sortOrder: number;
}

interface Modifier {
  id: string;
  menuItemId: string | null;
  name: string;
  isRequired: boolean;
  maxSelect: number;
  sortOrder: number;
  options: ModifierOption[];
}

const EMPTY_MODIFIER_FORM = {
  name: "",
  isRequired: false,
  maxSelect: 1,
  options: [{ name: "", priceAdj: "0" }] as { name: string; priceAdj: string }[],
};

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  prepTime: "",
  imageUrl: "",
  trackCount: false,
  countRemaining: "",
  recipe: [] as { ingredientId: string; quantity: string }[],
};

export default function MenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Modifier state
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [modifiersLoading, setModifiersLoading] = useState(false);
  const [expandedModifiers, setExpandedModifiers] = useState<Set<string>>(new Set());
  const [addModifierOpen, setAddModifierOpen] = useState(false);
  const [editingModifier, setEditingModifier] = useState<Modifier | null>(null);
  const [modifierForm, setModifierForm] = useState(EMPTY_MODIFIER_FORM);
  const [savingModifier, setSavingModifier] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [itemsRes, catsRes, ingsRes] = await Promise.all([
      fetch("/api/menu?active=false"),
      fetch("/api/categories"),
      fetch("/api/ingredients"),
    ]);
    if (itemsRes.ok) setItems(await itemsRes.json());
    if (catsRes.ok) setCategories(await catsRes.json());
    if (ingsRes.ok) setIngredients(await ingsRes.json());
    setLoading(false);
  }

  async function loadModifiers(menuItemId: string) {
    setModifiersLoading(true);
    const res = await fetch(`/api/modifiers?menuItemId=${menuItemId}`);
    if (res.ok) setModifiers(await res.json());
    setModifiersLoading(false);
  }

  function openCreate() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setModifiers([]);
    setDialogOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditItem(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: item.price,
      categoryId: item.categoryId,
      prepTime: item.prepTime ? String(item.prepTime) : "",
      imageUrl: item.imageUrl ?? "",
      trackCount: item.trackCount,
      countRemaining: item.countRemaining !== null ? String(item.countRemaining) : "",
      recipe: item.recipe.map((r) => ({
        ingredientId: r.ingredientId,
        quantity: String(r.quantity),
      })),
    });
    setModifiers([]);
    setExpandedModifiers(new Set());
    setDialogOpen(true);
    loadModifiers(item.id);
  }

  function openAddModifier() {
    setEditingModifier(null);
    setModifierForm(EMPTY_MODIFIER_FORM);
    setAddModifierOpen(true);
  }

  function openEditModifier(modifier: Modifier) {
    setEditingModifier(modifier);
    setModifierForm({
      name: modifier.name,
      isRequired: modifier.isRequired,
      maxSelect: modifier.maxSelect,
      options: modifier.options.map((o) => ({ name: o.name, priceAdj: String(o.priceAdj) })),
    });
    setAddModifierOpen(true);
  }

  async function saveModifier() {
    if (!editItem) return;
    setSavingModifier(true);
    const payload = {
      menuItemId: editItem.id,
      name: modifierForm.name,
      isRequired: modifierForm.isRequired,
      maxSelect: modifierForm.maxSelect,
      options: modifierForm.options
        .filter((o) => o.name.trim())
        .map((o) => ({ name: o.name.trim(), priceAdj: parseFloat(o.priceAdj) || 0 })),
    };

    const url = editingModifier ? `/api/modifiers/${editingModifier.id}` : "/api/modifiers";
    const method = editingModifier ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSavingModifier(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error((data as { error?: string }).error ?? "Failed to save modifier.");
      return;
    }
    setAddModifierOpen(false);
    loadModifiers(editItem.id);
  }

  async function deleteModifier(modifierId: string) {
    if (!editItem) return;
    if (!(await confirmDialog("Delete this modifier?"))) return;
    await fetch(`/api/modifiers/${modifierId}`, { method: "DELETE" });
    loadModifiers(editItem.id);
  }

  function toggleModifierExpand(modifierId: string) {
    setExpandedModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(modifierId)) next.delete(modifierId);
      else next.add(modifierId);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      price: parseFloat(form.price),
      prepTime: form.prepTime ? parseInt(form.prepTime) : null,
      trackCount: form.trackCount,
      countRemaining: form.trackCount && form.countRemaining !== "" ? parseInt(form.countRemaining) : null,
      recipe: form.recipe
        .filter((r) => r.ingredientId && r.quantity)
        .map((r) => ({ ingredientId: r.ingredientId, quantity: parseFloat(r.quantity) })),
    };

    const url = editItem ? `/api/menu/${editItem.id}` : "/api/menu";
    const method = editItem ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error((data as { error?: string }).error ?? "Failed to save menu item. Please try again.");
      return;
    }
    setDialogOpen(false);
    loadAll();
  }

  async function toggleActive(item: MenuItem) {
    await fetch(`/api/menu/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    loadAll();
  }

  async function createCategory() {
    if (!newCatName.trim()) return;
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    setNewCatName("");
    setCatDialogOpen(false);
    loadAll();
  }

  const filtered = items.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || i.categoryId === filterCat;
    return matchSearch && matchCat;
  });

  // Calculate recipe cost for an item
  function recipeCost(item: MenuItem): number {
    return item.recipe.reduce(
      (sum, r) => sum + Number(r.ingredient.costPerUnit) * Number(r.quantity),
      0
    );
  }

  return (
    <div>
      <Header
        title="Menu Management"
        description={`${items.filter((i) => i.isActive).length} active items`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCatDialogOpen(true)}>
              <Plus className="h-4 w-4" /> Category
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCat("all")}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterCat === "all" ? "bg-amber-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCat(cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  filterCat === cat.id ? "bg-amber-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-gray-400">
                <p className="font-medium">No menu items found</p>
                <p className="text-sm mt-1">Add your first item to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const cost = recipeCost(item);
                    const price = Number(item.price);
                    const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{item.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">{item.category.name}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(price)}</TableCell>
                        <TableCell className="text-right text-gray-500">{cost > 0 ? formatCurrency(cost) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {cost > 0 ? (
                            <span className={`text-sm font-medium ${margin >= 70 ? "text-green-600" : margin >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {margin.toFixed(0)}%
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={item.isActive ? "success" : "secondary"}>
                              {item.isActive ? "Active" : "Inactive"}
                            </Badge>
                            {item.trackCount && (
                              <Badge variant={item.countRemaining === 0 ? "destructive" : item.countRemaining !== null && item.countRemaining <= 5 ? "warning" : "outline"} className="text-[10px] px-1.5 py-0">
                                {item.countRemaining === null ? "Tracked" : item.countRemaining === 0 ? "Sold Out" : `${item.countRemaining} left`}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label="Edit menu item" onClick={() => openEdit(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="Toggle availability" onClick={() => toggleActive(item)}>
                              {item.isActive ? (
                                <ToggleRight className="h-4 w-4 text-green-500" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-gray-400" />
                              )}
                            </Button>
                          </div>
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

      {/* Item Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  placeholder="e.g. Grilled Salmon"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of the dish..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prep Time (min)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 15"
                  value={form.prepTime}
                  onChange={(e) => setForm({ ...form, prepTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Image URL</Label>
              <Input
                placeholder="https://example.com/image.jpg"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
              {form.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="preview" className="h-20 w-auto rounded-md object-cover border border-gray-200 mt-1" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              )}
            </div>

            {/* Count Tracking */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Track Remaining Count</Label>
                  <p className="text-xs text-gray-500 mt-0.5">Show &ldquo;X left&rdquo; badge in POS and disable when sold out</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, trackCount: !form.trackCount, countRemaining: !form.trackCount ? form.countRemaining : "" })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.trackCount ? "bg-amber-500" : "bg-gray-300"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${form.trackCount ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </button>
              </div>
              {form.trackCount && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Count Remaining</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 12"
                    value={form.countRemaining}
                    onChange={(e) => setForm({ ...form, countRemaining: e.target.value })}
                  />
                  <p className="text-xs text-gray-400">Leave blank to track without showing a number</p>
                </div>
              )}
            </div>

            {/* Recipe */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Recipe Ingredients</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({ ...form, recipe: [...form.recipe, { ingredientId: "", quantity: "" }] })
                  }
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              {form.recipe.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No ingredients added yet</p>
              ) : (
                <div className="space-y-2">
                  {form.recipe.map((r, i) => {
                    const ing = ingredients.find((ing) => ing.id === r.ingredientId);
                    return (
                      <div key={i} className="flex gap-2 items-center">
                        <Select
                          value={r.ingredientId}
                          onValueChange={(v) => {
                            const updated = [...form.recipe];
                            updated[i] = { ...updated[i], ingredientId: v };
                            setForm({ ...form, recipe: updated });
                          }}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((ing) => (
                              <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          step="0.001"
                          placeholder="Qty"
                          value={r.quantity}
                          onChange={(e) => {
                            const updated = [...form.recipe];
                            updated[i] = { ...updated[i], quantity: e.target.value };
                            setForm({ ...form, recipe: updated });
                          }}
                          className="w-24"
                        />
                        {ing && (
                          <span className="text-xs text-gray-400 w-10 shrink-0">{ing.unit}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon" aria-label="Remove"
                          onClick={() => {
                            const updated = form.recipe.filter((_, j) => j !== i);
                            setForm({ ...form, recipe: updated });
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modifiers — only shown when editing an existing item */}
            {editItem && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between">
                  <Label>Modifiers</Label>
                  <Button variant="outline" size="sm" onClick={openAddModifier}>
                    <Plus className="h-3 w-3" /> Add Modifier
                  </Button>
                </div>
                {modifiersLoading ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : modifiers.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No modifiers yet</p>
                ) : (
                  <div className="space-y-2">
                    {modifiers.map((mod) => {
                      const isExpanded = expandedModifiers.has(mod.id);
                      const isGlobal = mod.menuItemId === null;
                      return (
                        <div key={mod.id} className="rounded-lg border border-gray-200 bg-gray-50">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => toggleModifierExpand(mod.id)}
                              className="flex flex-1 items-center gap-2 text-left"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                              )}
                              <span className="text-sm font-medium text-gray-800">{mod.name}</span>
                              {mod.isRequired && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Required</Badge>
                              )}
                              {isGlobal && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-gray-500">Global</Badge>
                              )}
                              <span className="text-xs text-gray-400 ml-auto">
                                {mod.options.length} option{mod.options.length !== 1 ? "s" : ""}
                                {mod.maxSelect > 1 ? `, pick up to ${mod.maxSelect}` : ""}
                              </span>
                            </button>
                            {!isGlobal && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon" aria-label="Edit modifier"
                                  className="h-7 w-7"
                                  onClick={() => openEditModifier(mod)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon" aria-label="Delete modifier"
                                  className="h-7 w-7 text-red-400 hover:text-red-600"
                                  onClick={() => deleteModifier(mod.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="border-t border-gray-200 px-3 py-2 space-y-1">
                              {mod.options.map((opt) => (
                                <div key={opt.id} className="flex items-center justify-between text-xs text-gray-600">
                                  <span>{opt.name}</span>
                                  {Number(opt.priceAdj) !== 0 && (
                                    <span className={Number(opt.priceAdj) > 0 ? "text-green-600" : "text-red-500"}>
                                      {Number(opt.priceAdj) > 0 ? "+" : ""}{formatCurrency(Number(opt.priceAdj))}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name || !form.price || !form.categoryId}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? "Save Changes" : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Category Name *</Label>
              <Input
                placeholder="e.g. Appetizers"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCategory()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>Cancel</Button>
            <Button onClick={createCategory} disabled={!newCatName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Modifier Dialog */}
      <Dialog open={addModifierOpen} onOpenChange={setAddModifierOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModifier ? "Edit Modifier" : "Add Modifier"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                placeholder="e.g. Cooking Temp"
                value={modifierForm.name}
                onChange={(e) => setModifierForm({ ...modifierForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Max Selections</Label>
                <Input
                  type="number"
                  min={1}
                  value={modifierForm.maxSelect}
                  onChange={(e) => setModifierForm({ ...modifierForm, maxSelect: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setModifierForm({ ...modifierForm, isRequired: !modifierForm.isRequired })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    modifierForm.isRequired ? "bg-amber-500" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      modifierForm.isRequired ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <Label className="cursor-pointer" onClick={() => setModifierForm({ ...modifierForm, isRequired: !modifierForm.isRequired })}>
                  Required
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Options *</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setModifierForm({
                      ...modifierForm,
                      options: [...modifierForm.options, { name: "", priceAdj: "0" }],
                    })
                  }
                >
                  <Plus className="h-3 w-3" /> Add Option
                </Button>
              </div>
              <div className="space-y-2">
                {modifierForm.options.map((opt, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="Option name (e.g. Rare)"
                      value={opt.name}
                      onChange={(e) => {
                        const updated = [...modifierForm.options];
                        updated[i] = { ...updated[i], name: e.target.value };
                        setModifierForm({ ...modifierForm, options: updated });
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="±$0.00"
                      value={opt.priceAdj}
                      onChange={(e) => {
                        const updated = [...modifierForm.options];
                        updated[i] = { ...updated[i], priceAdj: e.target.value };
                        setModifierForm({ ...modifierForm, options: updated });
                      }}
                      className="w-24"
                    />
                    <Button
                      variant="ghost"
                      size="icon" aria-label="Remove option"
                      disabled={modifierForm.options.length <= 1}
                      onClick={() => {
                        setModifierForm({
                          ...modifierForm,
                          options: modifierForm.options.filter((_, j) => j !== i),
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400">Price adjustment: positive = upcharge, negative = discount, 0 = no change</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModifierOpen(false)}>Cancel</Button>
            <Button
              onClick={saveModifier}
              disabled={savingModifier || !modifierForm.name.trim() || modifierForm.options.filter((o) => o.name.trim()).length === 0}
            >
              {savingModifier && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingModifier ? "Save Changes" : "Add Modifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
