import { useState, useCallback } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Modal, Switch, Alert,
  KeyboardAvoidingView, Platform, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMenuItems, getCategories, getIngredients, createCategory, patchCategory } from "@/lib/api";
import type { Category, IngredientFull } from "@/lib/api";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { C, T, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  "http://localhost:3000";

async function apiPatch(path: string, body: object) {
  const token = await SecureStore.getItemAsync("session_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `authjs.session-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(e.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path: string, body: object) {
  const token = await SecureStore.getItemAsync("session_token");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Cookie: `authjs.session-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(e.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

interface RecipeRow { ingredientId: string; quantity: number }
interface MenuItemFull {
  id: string; name: string; description: string | null; price: string;
  categoryId: string; prepTime: number | null; imageUrl: string | null; isActive: boolean;
  category: Category;
  recipe: { ingredientId: string; quantity: string; ingredient: { id: string; name: string; unit: string; costPerUnit: string } }[];
}

function foodCostPct(item: MenuItemFull): number | null {
  if (!item.recipe || item.recipe.length === 0) return null;
  const cost = item.recipe.reduce((s, r) => s + Number(r.quantity) * Number(r.ingredient.costPerUnit), 0);
  const price = Number(item.price);
  if (price <= 0) return null;
  return Math.round((cost / price) * 1000) / 10;
}

function costAccent(pct: number): string {
  if (pct < 25) return C.jade;
  if (pct < 35) return C.ember;
  return C.coral;
}

function costTintBg(pct: number): string {
  if (pct < 25) return T.jade;
  if (pct < 35) return T.ember;
  return T.coral;
}

// ── Category management + station routing ──────────────────────────────────────
function CategoryManager({ categories, onClose, onChanged }: { categories: Category[]; onClose: () => void; onChanged: () => void }) {
  const [newName, setNewName] = useState("");
  const [newStation, setNewStation] = useState<"KITCHEN" | "BAR">("KITCHEN");
  const [busy, setBusy] = useState<string | null>(null);

  async function setStation(id: string, station: "KITCHEN" | "BAR") {
    setBusy(id);
    try { await patchCategory(id, { station }); onChanged(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }
  async function add() {
    if (!newName.trim()) return;
    setBusy("new");
    try { await createCategory({ name: newName.trim(), station: newStation }); setNewName(""); setNewStation("KITCHEN"); onChanged(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  }

  const StationToggle = ({ value, onChange, disabled }: { value: "KITCHEN" | "BAR"; onChange: (s: "KITCHEN" | "BAR") => void; disabled?: boolean }) => (
    <View style={{ flexDirection: "row", gap: 6, opacity: disabled ? 0.5 : 1 }}>
      {(["KITCHEN", "BAR"] as const).map((s) => {
        const sel = value === s;
        const col = s === "BAR" ? C.ember : C.jade;
        return (
          <TouchableOpacity key={s} disabled={disabled} onPress={() => onChange(s)} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: sel ? `${col}1A` : C.surfaceHi, borderColor: sel ? col : C.rim }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: sel ? col : C.smoke }}>{s === "BAR" ? "Bar" : "Kitchen"}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "85%", paddingBottom: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: C.pearl }}>Categories</Text>
              <Text style={{ fontSize: 12, color: C.smoke, marginTop: 1 }}>Station routes items to the Kitchen or Bar display.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
            {categories.map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surfaceHi }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{c.name}</Text>
                  {c._count && <Text style={{ fontSize: 11, color: C.smoke }}>{c._count.menuItems} item{c._count.menuItems === 1 ? "" : "s"}</Text>}
                </View>
                <StationToggle value={(c.station as "KITCHEN" | "BAR") ?? "KITCHEN"} onChange={(s) => setStation(c.id, s)} disabled={busy === c.id} />
              </View>
            ))}

            {/* Add new category */}
            <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.rim, borderRadius: 12, padding: 12, gap: 10, backgroundColor: C.surface }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>New Category</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="Category name"
                placeholderTextColor={C.smoke}
                style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.pearl }}
              />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <StationToggle value={newStation} onChange={setNewStation} />
                <TouchableOpacity onPress={add} disabled={!newName.trim() || busy === "new"} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: newName.trim() ? C.gold : C.surfaceHi }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: newName.trim() ? C.void : C.smoke }}>{busy === "new" ? "Adding…" : "Add"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MenuScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState<MenuItemFull | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [catMgmtOpen, setCatMgmtOpen] = useState(false);

  // Edit state for selected item
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPrepTime, setEditPrepTime] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editRecipe, setEditRecipe] = useState<RecipeRow[]>([]);

  // Add item state
  const [addName, setAddName] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addPrepTime, setAddPrepTime] = useState("");

  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const { data: menuItems = [], isLoading, refetch } = useQuery({
    queryKey: ["menuItems"],
    queryFn: () => getMenuItems<MenuItemFull>(),
  });
  const { data: ingredients = [] } = useQuery({ queryKey: ["ingredients"], queryFn: getIngredients });

  const saveItem = useMutation({
    mutationFn: async () => {
      if (!selectedItem) return;
      return apiPatch(`/api/menu/${selectedItem.id}`, {
        name: editName.trim(),
        price: parseFloat(editPrice),
        description: editDesc.trim() || null,
        categoryId: editCategoryId,
        prepTime: editPrepTime ? parseInt(editPrepTime) : null,
        isActive: editActive,
        recipe: editRecipe.filter((r) => r.ingredientId && r.quantity > 0),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menuItems"] });
      setSelectedItem(null);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const addItem = useMutation({
    mutationFn: async () => {
      if (!addName.trim() || !addPrice || !addCategoryId) throw new Error("Name, price, and category required.");
      return apiPost("/api/menu", {
        name: addName.trim(),
        price: parseFloat(addPrice),
        description: addDesc.trim() || null,
        categoryId: addCategoryId,
        prepTime: addPrepTime ? parseInt(addPrepTime) : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["menuItems"] });
      setAddVisible(false);
      setAddName(""); setAddPrice(""); setAddDesc(""); setAddCategoryId(""); setAddPrepTime("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  function openItem(item: MenuItemFull) {
    setSelectedItem(item);
    setEditName(item.name);
    setEditPrice(String(Number(item.price)));
    setEditDesc(item.description ?? "");
    setEditPrepTime(item.prepTime ? String(item.prepTime) : "");
    setEditCategoryId(item.categoryId);
    setEditActive(item.isActive);
    setEditRecipe(item.recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: Number(r.quantity) })));
  }

  const addRecipeRow = useCallback(() => {
    setEditRecipe((prev) => [...prev, { ingredientId: "", quantity: 0 }]);
  }, []);

  const removeRecipeRow = useCallback((idx: number) => {
    setEditRecipe((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateRecipeRow = useCallback((idx: number, field: "ingredientId" | "quantity", value: string | number) => {
    setEditRecipe((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }, []);

  const ingMap = new Map<string, IngredientFull>(ingredients.map((i) => [i.id, i]));

  const visible = menuItems.filter((m) => {
    const catOk = activeCategory === "all" || m.categoryId === activeCategory;
    const searchOk = !search || m.name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const grouped = categories.map((cat) => ({
    category: cat,
    items: visible.filter((m) => m.categoryId === cat.id),
  })).filter((g) => g.items.length > 0);

  const uncategorized = visible.filter((m) => !categories.find((c) => c.id === m.categoryId));

  // Shared input style
  const inputStyle = {
    backgroundColor: C.surfaceHi,
    borderColor: C.rim,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: C.pearl,
    fontSize: 15,
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: "700" as const,
    color: C.smoke,
    textTransform: "uppercase" as const,
    letterSpacing: 1.2,
    marginBottom: 6,
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>

      {/* ── Item Edit Sheet ─────────────────────────────────────────────── */}
      {selectedItem && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedItem(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-end"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          >
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" }}>
              {/* Handle + header */}
              <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
                <View style={{ width: 40, height: 4, backgroundColor: C.smoke, borderRadius: 99, alignSelf: "center", marginBottom: 16 }} />
                <View className="flex-row items-center justify-between">
                  <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Edit Item</Text>
                  <TouchableOpacity
                    onPress={() => setSelectedItem(null)}
                    style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close" size={16} color={C.mist} />
                  </TouchableOpacity>
                </View>
                {/* Food cost badge */}
                {(() => {
                  const pct = foodCostPct(selectedItem);
                  if (pct === null) return null;
                  const accent = costAccent(pct);
                  const tint = costTintBg(pct);
                  return (
                    <View style={{ marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99, backgroundColor: tint }}>
                      <Ionicons name="pie-chart-outline" size={12} color={accent} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: accent }}>{pct}% food cost</Text>
                    </View>
                  );
                })()}
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 14 }}
              >
                {/* Basic fields */}
                <TextInput
                  style={inputStyle}
                  placeholder="Item name *"
                  placeholderTextColor={C.smoke}
                  value={editName}
                  onChangeText={setEditName}
                />
                <View className="flex-row gap-3">
                  <TextInput
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="Price *"
                    placeholderTextColor={C.smoke}
                    keyboardType="decimal-pad"
                    value={editPrice}
                    onChangeText={setEditPrice}
                  />
                  <TextInput
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="Prep (min)"
                    placeholderTextColor={C.smoke}
                    keyboardType="number-pad"
                    value={editPrepTime}
                    onChangeText={setEditPrepTime}
                  />
                </View>
                <TextInput
                  style={[inputStyle, { minHeight: 72, textAlignVertical: "top" }]}
                  placeholder="Description"
                  placeholderTextColor={C.smoke}
                  value={editDesc}
                  onChangeText={setEditDesc}
                  multiline
                />

                {/* Category picker */}
                <View>
                  <Text style={labelStyle}>Category *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
                    {categories.map((c) => {
                      const sel = editCategoryId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setEditCategoryId(c.id)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            borderRadius: 99,
                            backgroundColor: sel ? C.gold : C.surfaceHi,
                            borderWidth: 1,
                            borderColor: sel ? C.gold : C.rim,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? C.void : C.mist }}>{c.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Active toggle */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>Active on menu</Text>
                  <Switch
                    value={editActive}
                    onValueChange={setEditActive}
                    trackColor={{ false: C.smoke, true: C.jade }}
                    thumbColor={C.pearl}
                    ios_backgroundColor={C.smoke}
                  />
                </View>

                {/* Recipe / ingredients */}
                <View>
                  <View className="flex-row items-center justify-between" style={{ marginBottom: 10 }}>
                    <Text style={labelStyle}>Recipe Ingredients</Text>
                    <TouchableOpacity
                      onPress={addRecipeRow}
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: T.gold, borderRadius: 8 }}
                    >
                      <Ionicons name="add" size={14} color={C.gold} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: C.gold }}>Add</Text>
                    </TouchableOpacity>
                  </View>
                  {editRecipe.length === 0 && (
                    <Text style={{ fontSize: 12, color: C.smoke, textAlign: "center", paddingVertical: 12 }}>
                      No ingredients — add them to track food cost
                    </Text>
                  )}
                  {editRecipe.map((row, idx) => {
                    const ing = ingMap.get(row.ingredientId);
                    const lineCost = ing ? Number(row.quantity) * Number(ing.costPerUnit) : 0;
                    return (
                      <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        {/* Ingredient picker chips */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            {ingredients.slice(0, 12).map((i) => {
                              const sel = row.ingredientId === i.id;
                              return (
                                <TouchableOpacity
                                  key={i.id}
                                  onPress={() => updateRecipeRow(idx, "ingredientId", i.id)}
                                  style={{
                                    paddingHorizontal: 10,
                                    paddingVertical: 6,
                                    borderRadius: 8,
                                    backgroundColor: sel ? C.surfaceHov : C.surfaceHi,
                                    borderWidth: 1,
                                    borderColor: sel ? C.rimBright : C.rim,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: "600", color: sel ? C.pearl : C.mist }} numberOfLines={1}>{i.name}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </ScrollView>
                        <TextInput
                          style={{
                            width: 64,
                            backgroundColor: C.surfaceHi,
                            borderWidth: 1,
                            borderColor: C.rim,
                            borderRadius: 8,
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            textAlign: "center",
                            fontSize: 13,
                            color: C.pearl,
                          }}
                          keyboardType="decimal-pad"
                          placeholder="Qty"
                          placeholderTextColor={C.smoke}
                          value={row.quantity > 0 ? String(row.quantity) : ""}
                          onChangeText={(v) => updateRecipeRow(idx, "quantity", parseFloat(v) || 0)}
                        />
                        {ing && <Text style={{ fontSize: 11, color: C.mist, width: 24 }}>{ing.unit}</Text>}
                        {lineCost > 0 && (
                          <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade, width: 52 }}>${lineCost.toFixed(2)}</Text>
                        )}
                        <TouchableOpacity onPress={() => removeRecipeRow(idx)}>
                          <Ionicons name="close-circle" size={18} color={C.smoke} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {editRecipe.length > 0 && (() => {
                    const totalCost = editRecipe.reduce((s, r) => {
                      const i = ingMap.get(r.ingredientId);
                      return s + (i ? Number(r.quantity) * Number(i.costPerUnit) : 0);
                    }, 0);
                    const pct = editPrice ? (totalCost / parseFloat(editPrice)) * 100 : 0;
                    const pctAccent = pct > 0 ? costAccent(pct) : C.mist;
                    return (
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.rim }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist }}>Total ingredient cost</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: C.gold }}>${totalCost.toFixed(2)}</Text>
                          {pct > 0 && (
                            <Text style={{ fontSize: 12, fontWeight: "700", color: pctAccent }}>{Math.round(pct)}%</Text>
                          )}
                        </View>
                      </View>
                    );
                  })()}
                </View>

                {/* Save */}
                <TouchableOpacity
                  onPress={() => saveItem.mutate()}
                  disabled={saveItem.isPending || !editName.trim() || !editPrice || !editCategoryId}
                  style={[
                    { paddingVertical: 16, borderRadius: 20, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
                    saveItem.isPending || !editName.trim() || !editPrice || !editCategoryId
                      ? { backgroundColor: C.surfaceHi }
                      : { backgroundColor: C.gold, ...shadow.gold },
                  ]}
                >
                  {saveItem.isPending ? (
                    <ActivityIndicator color={C.void} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                      <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Changes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ── Add Item Sheet ──────────────────────────────────────────────── */}
      {addVisible && (
        <Modal transparent animationType="slide" onRequestClose={() => setAddVisible(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-end"
            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          >
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}>
              <View style={{ width: 40, height: 4, backgroundColor: C.smoke, borderRadius: 99, alignSelf: "center", marginBottom: 20 }} />
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl, marginBottom: 18 }}>New Menu Item</Text>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
                <TextInput
                  style={inputStyle}
                  placeholder="Item name *"
                  placeholderTextColor={C.smoke}
                  value={addName}
                  onChangeText={setAddName}
                  autoFocus
                />
                <View className="flex-row gap-3">
                  <TextInput
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="Price *"
                    placeholderTextColor={C.smoke}
                    keyboardType="decimal-pad"
                    value={addPrice}
                    onChangeText={setAddPrice}
                  />
                  <TextInput
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="Prep (min)"
                    placeholderTextColor={C.smoke}
                    keyboardType="number-pad"
                    value={addPrepTime}
                    onChangeText={setAddPrepTime}
                  />
                </View>
                <TextInput
                  style={[inputStyle, { minHeight: 72, textAlignVertical: "top" }]}
                  placeholder="Description"
                  placeholderTextColor={C.smoke}
                  value={addDesc}
                  onChangeText={setAddDesc}
                  multiline
                />
                <View>
                  <Text style={labelStyle}>Category *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
                    {categories.map((c) => {
                      const sel = addCategoryId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setAddCategoryId(c.id)}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 7,
                            borderRadius: 99,
                            backgroundColor: sel ? C.gold : C.surfaceHi,
                            borderWidth: 1,
                            borderColor: sel ? C.gold : C.rim,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? C.void : C.mist }}>{c.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
                <TouchableOpacity
                  onPress={() => addItem.mutate()}
                  disabled={addItem.isPending || !addName.trim() || !addPrice || !addCategoryId}
                  style={[
                    { paddingVertical: 16, borderRadius: 20, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
                    addItem.isPending || !addName.trim() || !addPrice || !addCategoryId
                      ? { backgroundColor: C.surfaceHi }
                      : { backgroundColor: C.gold, ...shadow.gold },
                  ]}
                >
                  {addItem.isPending ? (
                    <ActivityIndicator color={C.void} />
                  ) : (
                    <>
                      <Ionicons name="add-circle-outline" size={18} color={C.void} />
                      <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Add Item</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <CollapsingHeader
        title="Menu"
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
        right={
          <View style={{ flexDirection: "row", gap: 16, alignItems: "center" }}>
            <TouchableOpacity onPress={() => setCatMgmtOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
              <Ionicons name="pricetags-outline" size={21} color={C.gold} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAddVisible(true)} hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}>
              <Ionicons name="add-circle-outline" size={24} color={C.gold} />
            </TouchableOpacity>
          </View>
        }
      />
      {catMgmtOpen && <CategoryManager categories={categories} onClose={() => setCatMgmtOpen(false)} onChanged={() => qc.invalidateQueries({ queryKey: ["categories"] })} />}
      {/* Search bar + category tabs */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 14 }}>
          <Ionicons name="search-outline" size={16} color={C.smoke} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
            placeholder="Search menu…"
            placeholderTextColor={C.smoke}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color={C.smoke} />
            </TouchableOpacity>
          )}
        </View>
        {/* Category filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: "row" }}>
          {[{ id: "all", name: "All" }, ...categories].map((c) => {
            const sel = activeCategory === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setActiveCategory(c.id)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 99,
                  backgroundColor: sel ? C.gold : C.surfaceHi,
                  borderWidth: 1,
                  borderColor: sel ? C.gold : C.rim,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? C.void : C.mist }}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ padding: 16, gap: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {visible.length === 0 && (
            <View className="items-center" style={{ paddingVertical: 56, gap: 12 }}>
              <Ionicons name="restaurant-outline" size={40} color={C.smoke} />
              <Text style={{ color: C.mist, fontSize: 14 }}>No items match your search</Text>
            </View>
          )}

          {grouped.map(({ category, items }) => (
            <View key={category.id}>
              {/* Category header */}
              <View className="flex-row items-center" style={{ gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.4 }}>{category.name}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
                <Text style={{ fontSize: 11, color: C.smoke }}>{items.length}</Text>
              </View>
              {/* Item cards */}
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
                {items.map((item, i) => {
                  const pct = foodCostPct(item);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => openItem(item)}
                      style={[
                        { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 },
                        i < items.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.rim } : undefined,
                      ]}
                    >
                      {/* Icon / thumbnail */}
                      <View style={{
                        width: 44, height: 44, borderRadius: 22,
                        backgroundColor: item.isActive ? T.gold : C.surfaceHi,
                        alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Ionicons name="restaurant-outline" size={18} color={item.isActive ? C.gold : C.smoke} />
                      </View>

                      <View style={{ flex: 1 }}>
                        {/* Name row */}
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: item.isActive ? C.pearl : C.smoke }}>{item.name}</Text>
                          {!item.isActive && (
                            <View style={{ backgroundColor: T.coral, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: C.coral, textTransform: "uppercase" }}>86'd</Text>
                            </View>
                          )}
                        </View>
                        {/* Description */}
                        {item.description ? (
                          <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }} numberOfLines={1}>{item.description}</Text>
                        ) : null}
                        {/* Meta row */}
                        <View className="flex-row items-center flex-wrap" style={{ gap: 8, marginTop: 4 }}>
                          {item.prepTime ? (
                            <View className="flex-row items-center" style={{ gap: 3 }}>
                              <Ionicons name="time-outline" size={10} color={C.smoke} />
                              <Text style={{ fontSize: 10, color: C.smoke }}>{item.prepTime}m</Text>
                            </View>
                          ) : null}
                          {pct !== null && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: costTintBg(pct) }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: costAccent(pct) }}>{pct}% cost</Text>
                            </View>
                          )}
                          {item.recipe && item.recipe.length > 0 && (
                            <Text style={{ fontSize: 10, color: C.smoke }}>{item.recipe.length} ingredient{item.recipe.length !== 1 ? "s" : ""}</Text>
                          )}
                        </View>
                      </View>

                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: "700", color: C.gold }}>${Number(item.price).toFixed(2)}</Text>
                        <Ionicons name="chevron-forward" size={14} color={C.smoke} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {uncategorized.length > 0 && (
            <View>
              <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.4, marginBottom: 8 }}>Other</Text>
              <View style={{ backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
                {uncategorized.map((item, i) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => openItem(item)}
                    style={[
                      { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 12 },
                      i < uncategorized.length - 1 ? { borderBottomWidth: 1, borderBottomColor: C.rim } : undefined,
                    ]}
                  >
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="restaurant-outline" size={18} color={C.smoke} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{item.name}</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: C.gold }}>${Number(item.price).toFixed(2)}</Text>
                    <Ionicons name="chevron-forward" size={14} color={C.smoke} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}
