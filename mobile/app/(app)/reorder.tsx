import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity,
  Modal, Alert, ActivityIndicator, TextInput, Share, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getIngredients, visionIdentify, getOrderRecommendations, createPOsFromSuggestions } from "@/lib/api";
import type { IngredientFull, VisionResult } from "@/lib/api";
import { Scanner } from "@/components/Scanner";
import { PhotoCapture } from "@/components/PhotoCapture";
import { SafeAreaView } from "react-native-safe-area-context";
import { C } from "@/lib/theme";
import { useAuthStore } from "@/store/auth";

type InputMode = "search" | "scan" | "camera" | "vision_processing" | "vision_result";

type ReorderItem = {
  ingredientId: string;
  name: string;
  unit: string;
  supplierId: string | null;
  supplierName: string;
  currentStock: number;
  minThreshold: number;
  qtyNeeded: number;
  costPerUnit: number | null;
};

const VENDOR_COLORS = [
  { bg: "bg-blue-500", light: "bg-blue-50", border: "border-blue-200", text: "text-sky" },
  { bg: "bg-purple-500", light: "bg-purple-50", border: "border-purple-200", text: "text-purple-700" },
  { bg: "bg-teal-500", light: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  { bg: "bg-rose-500", light: "bg-rose-50", border: "border-rose-200", text: "text-rose-700" },
  { bg: "bg-gold", light: "bg-gold-muted", border: "border-amber-200", text: "text-gold-dim" },
  { bg: "bg-indigo-500", light: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-700" },
];

export default function ReorderScreen() {
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<ReorderItem[]>([]);
  const [mode, setMode] = useState<InputMode>("search");
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [sharing, setSharing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSummary, setSuggestSummary] = useState<{ text: string; aiPowered: boolean } | null>(null);
  const [creatingPOs, setCreatingPOs] = useState(false);
  const [fromSuggest, setFromSuggest] = useState(false);

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
    enabled: modalOpen && mode === "search",
  });

  const filtered = useMemo(
    () => ingredients.filter((i) =>
      !search || i.name.toLowerCase().includes(search.toLowerCase())
    ),
    [ingredients, search]
  );

  // Group items by vendor
  const vendorGroups = useMemo(() => {
    const map = new Map<string, ReorderItem[]>();
    for (const item of items) {
      const key = item.supplierId ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, groupItems]) => ({
      supplierId: key === "__none__" ? null : key,
      supplierName: groupItems[0].supplierName,
      items: groupItems,
    }));
  }, [items]);

  function openModal(m: InputMode) {
    setSearch("");
    setVisionResult(null);
    setMode(m);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setMode("search");
    setSearch("");
    setVisionResult(null);
  }

  function addIngredient(ing: IngredientFull) {
    const existing = items.find((i) => i.ingredientId === ing.id);
    if (existing) {
      setItems((prev) =>
        prev.map((i) => i.ingredientId === ing.id ? { ...i, qtyNeeded: i.qtyNeeded + 1 } : i)
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          ingredientId: ing.id,
          name: ing.name,
          unit: ing.unit,
          supplierId: ing.supplier?.id ?? null,
          supplierName: ing.supplier?.name ?? "No Vendor",
          currentStock: ing.inventoryItem?.quantity ?? 0,
          minThreshold: ing.inventoryItem?.minThreshold ?? 0,
          qtyNeeded: 1,
          costPerUnit: ing.costPerUnit ? Number(ing.costPerUnit) : null,
        },
      ]);
    }
    closeModal();
  }

  function handleBarcodeScan(barcode: string) {
    setMode("search");
    const match = ingredients.find((i) => i.barcode === barcode);
    if (match) {
      addIngredient(match);
    } else {
      Alert.alert("Not found", `No ingredient matched barcode ${barcode}.`);
      closeModal();
    }
  }

  async function handlePhotoCapture(dataUrl: string) {
    setMode("vision_processing");
    try {
      const result = await visionIdentify(dataUrl);
      setVisionResult(result);
      setMode("vision_result");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "AI identification failed");
      setMode("search");
    }
  }

  function updateQty(ingredientId: string, delta: number) {
    setItems((prev) =>
      prev
        .map((i) => i.ingredientId === ingredientId ? { ...i, qtyNeeded: Math.max(0, i.qtyNeeded + delta) } : i)
        .filter((i) => i.qtyNeeded > 0)
    );
  }

  function removeItem(ingredientId: string) {
    setItems((prev) => prev.filter((i) => i.ingredientId !== ingredientId));
  }

  async function loadSuggestions() {
    setSuggesting(true);
    try {
      const result = await getOrderRecommendations(7);
      if (result.suggestions.length === 0) {
        Alert.alert("All stocked up!", "No items need reordering in the next 7 days.");
        return;
      }
      // Merge suggestions into current list
      setItems((prev) => {
        const next = [...prev];
        for (const s of result.suggestions) {
          const existing = next.find((i) => i.ingredientId === s.ingredientId);
          if (existing) {
            // Update qty to max of current and recommended
            existing.qtyNeeded = Math.max(existing.qtyNeeded, s.recommendedOrderQty);
          } else {
            next.push({
              ingredientId: s.ingredientId,
              name: s.ingredientName,
              unit: s.unit,
              supplierId: s.supplierId,
              supplierName: s.supplierName ?? "No Vendor",
              currentStock: s.currentQty,
              minThreshold: s.parQty,
              qtyNeeded: s.recommendedOrderQty,
              costPerUnit: s.lastUnitCost,
            });
          }
        }
        return next;
      });
      setSuggestSummary({ text: result.summary, aiPowered: result.aiPowered });
      setFromSuggest(true);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleCreatePOs() {
    if (items.length === 0) return;
    const itemsWithSupplier = items.filter((i) => i.supplierId !== null);
    if (itemsWithSupplier.length === 0) {
      Alert.alert("No Vendor Assigned", "Assign vendors to ingredients first before creating purchase orders.");
      return;
    }
    Alert.alert(
      "Create Purchase Orders",
      `Create ${vendorGroups.filter(g => g.supplierId).length} draft PO${vendorGroups.filter(g => g.supplierId).length !== 1 ? "s" : ""} from this list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: async () => {
            setCreatingPOs(true);
            try {
              const result = await createPOsFromSuggestions(
                itemsWithSupplier.map((i) => ({
                  ingredientId: i.ingredientId,
                  qty: i.qtyNeeded,
                  supplierId: i.supplierId,
                  unitCost: i.costPerUnit,
                }))
              );
              Alert.alert(
                "POs Created!",
                `${result.totalOrders} draft purchase order${result.totalOrders !== 1 ? "s" : ""} created.\n\nView them in Purchase Orders to review and send.`,
                [
                  { text: "View POs", onPress: () => router.push("/(app)/invoices" as never) },
                  { text: "Stay Here", style: "cancel" },
                ]
              );
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to create purchase orders");
            } finally {
              setCreatingPOs(false);
            }
          },
        },
      ]
    );
  }

  async function shareReport() {
    if (items.length === 0) return;
    setSharing(true);
    try {
      const date = new Date().toLocaleDateString();
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      let report = `REORDER LIST\n${date} ${time}`;
      if (user?.name) report += ` · ${user.name}`;
      report += `\n${"─".repeat(40)}\n`;

      for (const group of vendorGroups) {
        report += `\n📦 ${group.supplierName.toUpperCase()}\n`;
        for (const item of group.items) {
          const cost = item.costPerUnit
            ? `  [$${(item.qtyNeeded * item.costPerUnit).toFixed(2)}]`
            : "";
          report += `  • ${item.name}: ${item.qtyNeeded} ${item.unit}${cost}`;
          if (item.currentStock <= item.minThreshold) report += " ⚠️ LOW";
          report += "\n";
        }
      }

      const totalCost = items.reduce(
        (s, i) => s + (i.costPerUnit ? i.qtyNeeded * i.costPerUnit : 0), 0
      );
      if (totalCost > 0) {
        report += `\n${"─".repeat(40)}\nEst. Total: $${totalCost.toFixed(2)}\n`;
      }
      report += `\n${items.length} item${items.length !== 1 ? "s" : ""} across ${vendorGroups.length} vendor${vendorGroups.length !== 1 ? "s" : ""}`;

      await Share.share({ message: report, title: "Reorder List" });
    } finally {
      setSharing(false);
    }
  }

  const totalItems = items.length;
  const totalCost = items.reduce((s, i) => s + (i.costPerUnit ? i.qtyNeeded * i.costPerUnit : 0), 0);
  const lowCount = items.filter((i) => i.currentStock <= i.minThreshold).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>

      {/* Modal — scan / AI / search */}
      <Modal visible={modalOpen} animationType="slide" onRequestClose={closeModal}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>

          {mode === "scan" && (
            <Scanner
              onScan={handleBarcodeScan}
              onClose={closeModal}
              hint="Scan ingredient barcode to add to reorder list"
            />
          )}

          {mode === "camera" && (
            <PhotoCapture
              onCapture={handlePhotoCapture}
              onClose={closeModal}
              hint="Point at the product label or packaging"
            />
          )}

          {mode === "vision_processing" && (
            <View className="flex-1 items-center justify-center gap-5 px-8">
              <View className="h-20 w-20 rounded-3xl bg-gold-muted items-center justify-center">
                <ActivityIndicator color={C.gold} size="large" />
              </View>
              <View className="items-center gap-1">
                <Text className="text-lg font-bold text-pearl">Identifying…</Text>
                <Text className="text-sm text-smoke text-center">AI is analyzing your photo</Text>
              </View>
            </View>
          )}

          {mode === "vision_result" && visionResult && (
            <>
              <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                <TouchableOpacity onPress={() => setMode("search")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color={C.gold} />
                </TouchableOpacity>
                <Text className="flex-1 text-lg font-bold text-pearl">AI Result</Text>
                <TouchableOpacity onPress={closeModal}>
                  <Ionicons name="close" size={22} color={C.mist} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerClassName="p-4 gap-4">
                <View className="bg-gold-muted border border-amber-200 rounded-2xl p-4 gap-2">
                  <View className="flex-row items-center gap-2">
                    <Ionicons name="sparkles" size={16} color={C.goldDim} />
                    <Text className="text-xs font-semibold text-gold-dim uppercase tracking-wide">AI Identified</Text>
                    <View className={`ml-auto px-2 py-0.5 rounded-full ${
                      visionResult.identified.confidence === "high" ? "bg-jade/10" :
                      visionResult.identified.confidence === "medium" ? "bg-gold-muted" : "bg-coral/10"
                    }`}>
                      <Text className={`text-[10px] font-bold ${
                        visionResult.identified.confidence === "high" ? "text-jade" :
                        visionResult.identified.confidence === "medium" ? "text-gold-dim" : "text-coral"
                      }`}>{visionResult.identified.confidence.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text className="text-xl font-bold text-amber-900">{visionResult.identified.name}</Text>
                  {visionResult.identified.brand && (
                    <Text className="text-sm text-gold-dim">{visionResult.identified.brand}</Text>
                  )}
                </View>

                {visionResult.matches.length > 0 ? (
                  <View>
                    <Text className="text-xs font-semibold text-mist uppercase tracking-widest mb-2">
                      Matches in your inventory ({visionResult.matches.length})
                    </Text>
                    <View className="bg-surface rounded-2xl border border-rim overflow-hidden">
                      {visionResult.matches.map((ing, i) => (
                        <TouchableOpacity
                          key={ing.id}
                          onPress={() => addIngredient(ing)}
                          className={`px-4 py-3.5 flex-row items-center gap-3 active:bg-gold-muted ${i < visionResult.matches.length - 1 ? "border-b border-rim" : ""}`}
                        >
                          <View className="h-9 w-9 rounded-xl bg-gold-muted items-center justify-center flex-shrink-0">
                            <Ionicons name="cube-outline" size={16} color={C.goldDim} />
                          </View>
                          <View className="flex-1">
                            <Text className="font-semibold text-pearl">{ing.name}</Text>
                            <Text className="text-xs text-smoke">{ing.supplier?.name ?? "No vendor"}</Text>
                          </View>
                          <Text className="text-xs bg-gray-100 text-mist px-2 py-0.5 rounded-full">{ing.unit}</Text>
                          <Ionicons name="add-circle" size={20} color={C.gold} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View className="bg-surfaceHi rounded-2xl p-4 items-center gap-2">
                    <Ionicons name="search-outline" size={24} color={C.smoke} />
                    <Text className="text-mist text-sm text-center">No matches found.{"\n"}Try searching manually.</Text>
                    <TouchableOpacity onPress={() => setMode("search")} className="mt-1 px-4 py-2 bg-gold rounded-xl">
                      <Text className="text-white font-semibold text-sm">Search Manually</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </>
          )}

          {mode === "search" && (
            <>
              <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                <TouchableOpacity onPress={closeModal} className="h-8 w-8 items-center justify-center">
                  <Ionicons name="close" size={22} color={C.mist} />
                </TouchableOpacity>
                <Text className="flex-1 text-lg font-bold text-pearl">Add to Reorder List</Text>
              </View>

              <View className="px-4 pt-3 pb-2 flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setMode("scan")}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-surfaceHi border border-rim rounded-xl py-2.5"
                >
                  <Ionicons name="barcode-outline" size={18} color={C.mist} />
                  <Text className="text-sm font-semibold text-mist">Scan Barcode</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode("camera")}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-gold-muted border border-amber-200 rounded-xl py-2.5"
                >
                  <Ionicons name="sparkles" size={16} color={C.goldDim} />
                  <Text className="text-sm font-semibold text-gold-dim">AI Photo</Text>
                </TouchableOpacity>
              </View>

              <View className="px-4 pb-2">
                <View className="flex-row items-center bg-surfaceHi border border-rim rounded-xl px-3 gap-2">
                  <Ionicons name="search-outline" size={15} color={C.smoke} />
                  <TextInput
                    className="flex-1 py-2.5 text-sm text-pearl"
                    placeholder="Search ingredients…"
                    placeholderTextColor="#9ca3af"
                    value={search}
                    onChangeText={setSearch}
                    autoFocus
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch("")}>
                      <Ionicons name="close-circle" size={15} color={C.smoke} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <ScrollView contentContainerClassName="px-4 pb-4 gap-1">
                {filtered.map((ing) => {
                  const alreadyAdded = items.some((i) => i.ingredientId === ing.id);
                  const isLow = ing.inventoryItem
                    ? ing.inventoryItem.quantity <= ing.inventoryItem.minThreshold
                    : false;
                  return (
                    <TouchableOpacity
                      key={ing.id}
                      onPress={() => addIngredient(ing)}
                      className={`px-4 py-3 rounded-xl flex-row items-center gap-3 ${alreadyAdded ? "bg-gold-muted" : "bg-gray-50"} active:bg-gold-muted`}
                    >
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text className="font-medium text-pearl">{ing.name}</Text>
                          {isLow && (
                            <View className="bg-coral/10 px-1.5 py-0.5 rounded-full">
                              <Text className="text-[10px] font-bold text-coral">LOW</Text>
                            </View>
                          )}
                          {alreadyAdded && (
                            <View className="bg-gold-muted px-1.5 py-0.5 rounded-full">
                              <Text className="text-[10px] font-bold text-gold-dim">ADDED</Text>
                            </View>
                          )}
                        </View>
                        {ing.supplier && (
                          <Text className="text-xs text-smoke mt-0.5">{ing.supplier.name}</Text>
                        )}
                      </View>
                      <View className="flex-row items-center gap-2">
                        {ing.costPerUnit && (
                          <Text className="text-xs text-smoke">${Number(ing.costPerUnit).toFixed(2)}</Text>
                        )}
                        <Text className="text-sm text-smoke bg-white px-2 py-0.5 rounded-full border border-gray-200">{ing.unit}</Text>
                        <Ionicons name={alreadyAdded ? "checkmark-circle" : "add-circle-outline"} size={20} color={alreadyAdded ? "#f59e0b" : "#9ca3af"} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>

      <CollapsingHeader
        title="Reorder List"
        left={<TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        subtitle={totalItems === 0 ? "Nothing added yet" : `${totalItems} item${totalItems !== 1 ? "s" : ""} · ${vendorGroups.length} vendor${vendorGroups.length !== 1 ? "s" : ""}`}
        scrollY={scrollY}
        right={totalItems > 0 ? (
          <TouchableOpacity
            onPress={shareReport}
            disabled={sharing}
            className="h-9 w-9 rounded-xl bg-gold items-center justify-center"
          >
            {sharing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="share-outline" size={18} color="#fff" />}
          </TouchableOpacity>
        ) : undefined}
      />

      {/* Input row */}
      <View className="bg-white px-4 pt-3 pb-4 border-b border-rim gap-2">
        {/* Smart Suggest banner */}
        <TouchableOpacity
          onPress={loadSuggestions}
          disabled={suggesting}
          className="flex-row items-center gap-3 bg-gold-muted border border-amber-200 rounded-2xl px-4 py-3"
          activeOpacity={0.75}
        >
          <View className="h-8 w-8 rounded-xl bg-gold items-center justify-center flex-shrink-0">
            {suggesting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Ionicons name="bulb" size={16} color="#fff" />}
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold text-amber-900">
              {suggesting ? "Analyzing inventory…" : "Smart Suggest"}
            </Text>
            <Text className="text-xs text-gold-dim">
              {suggesting ? "Checking burn rates & stock levels" : "Auto-fill from low stock & burn rate"}
            </Text>
          </View>
          {!suggesting && <Ionicons name="chevron-forward" size={16} color={C.goldDim} />}
        </TouchableOpacity>

        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => openModal("scan")}
            className="flex-1 flex-row items-center justify-center gap-2 bg-gray-900 rounded-2xl py-3.5"
          >
            <Ionicons name="barcode-outline" size={18} color="#fff" />
            <Text className="text-white font-bold text-sm">Scan Barcode</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openModal("camera")}
            className="flex-1 flex-row items-center justify-center gap-2 bg-gold rounded-2xl py-3.5"
          >
            <Ionicons name="sparkles" size={16} color="#fff" />
            <Text className="text-white font-bold text-sm">AI Photo</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => openModal("search")}
          className="flex-row items-center gap-2 bg-surfaceHi border border-rim rounded-xl px-4 py-2.5"
        >
          <Ionicons name="search-outline" size={15} color={C.smoke} />
          <Text className="text-sm text-smoke">Search and add ingredients…</Text>
        </TouchableOpacity>
      </View>

      {/* AI summary banner */}
      {suggestSummary && (
        <View className="mx-4 mt-3 flex-row items-start gap-3 bg-surfaceHi border border-rim rounded-2xl px-4 py-3">
          <Ionicons
            name={suggestSummary.aiPowered ? "sparkles" : "information-circle-outline"}
            size={16}
            color={suggestSummary.aiPowered ? C.goldDim : C.mist}
          />
          <Text className="flex-1 text-xs text-mist leading-5">{suggestSummary.text}</Text>
          <TouchableOpacity onPress={() => setSuggestSummary(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={C.smoke} />
          </TouchableOpacity>
        </View>
      )}

      {/* Summary bar */}
      {totalItems > 0 && (
        <View className="flex-row bg-surface border-b border-rim divide-x divide-gray-100">
          <View className="flex-1 px-4 py-2 items-center">
            <Text className="text-lg font-bold text-pearl">{totalItems}</Text>
            <Text className="text-[10px] text-smoke uppercase tracking-wide">Items</Text>
          </View>
          <View className="flex-1 px-4 py-2 items-center">
            <Text className="text-lg font-bold text-pearl">{vendorGroups.length}</Text>
            <Text className="text-[10px] text-smoke uppercase tracking-wide">Vendors</Text>
          </View>
          {lowCount > 0 && (
            <View className="flex-1 px-4 py-2 items-center">
              <Text className="text-lg font-bold text-coral">{lowCount}</Text>
              <Text className="text-[10px] text-smoke uppercase tracking-wide">Low Stock</Text>
            </View>
          )}
          {totalCost > 0 && (
            <View className="flex-1 px-4 py-2 items-center">
              <Text className="text-lg font-bold text-gold-dim">${totalCost.toFixed(0)}</Text>
              <Text className="text-[10px] text-smoke uppercase tracking-wide">Est. Cost</Text>
            </View>
          )}
        </View>
      )}

      {/* Empty state */}
      {totalItems === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View className="h-20 w-20 rounded-3xl bg-surfaceHi items-center justify-center">
            <Ionicons name="list-outline" size={36} color={C.smoke} />
          </View>
          <View className="items-center gap-1">
            <Text className="text-pearl font-semibold text-base">Nothing to reorder yet</Text>
            <Text className="text-smoke text-sm text-center">
              Scan a barcode, snap a photo, or search to add items. They'll be grouped by vendor for easy ordering.
            </Text>
          </View>
        </View>
      ) : (
        <Animated.ScrollView contentContainerClassName="p-4 gap-4" scrollEventThrottle={16} onScroll={scrollHandler}>
          {vendorGroups.map((group, gi) => {
            const color = VENDOR_COLORS[gi % VENDOR_COLORS.length];
            const groupTotal = group.items.reduce(
              (s, i) => s + (i.costPerUnit ? i.qtyNeeded * i.costPerUnit : 0), 0
            );
            return (
              <View key={group.supplierId ?? "__none__"} className={`rounded-2xl border overflow-hidden ${color.border}`}>
                {/* Vendor header */}
                <View className={`px-4 py-3 flex-row items-center justify-between ${color.light}`}>
                  <View className="flex-row items-center gap-2">
                    <View className={`h-7 w-7 rounded-lg ${color.bg} items-center justify-center`}>
                      <Ionicons name="business-outline" size={14} color="#fff" />
                    </View>
                    <Text className={`font-bold text-base ${color.text}`}>{group.supplierName}</Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-xs text-mist">{group.items.length} item{group.items.length !== 1 ? "s" : ""}</Text>
                    {groupTotal > 0 && (
                      <Text className={`text-sm font-bold ${color.text}`}>${groupTotal.toFixed(2)}</Text>
                    )}
                  </View>
                </View>

                {/* Items */}
                <View className="bg-white">
                  {group.items.map((item, ii) => {
                    const isOut = item.currentStock <= 0;
                    const isCritical = !isOut && item.currentStock <= item.minThreshold * 0.5;
                    const isLow = !isOut && !isCritical && item.currentStock <= item.minThreshold;
                    return (
                      <View
                        key={item.ingredientId}
                        className={`px-4 py-3 flex-row items-center gap-3 ${ii < group.items.length - 1 ? "border-b border-rim" : ""}`}
                        style={isOut ? { backgroundColor: "#fff1f0" } : isCritical ? { backgroundColor: "#fff8f0" } : undefined}
                      >
                        <View className="flex-1">
                          <View className="flex-row items-center gap-2 flex-wrap">
                            <Text className="text-sm font-semibold text-pearl">{item.name}</Text>
                            {isOut && (
                              <View className="bg-coral px-1.5 py-0.5 rounded-full">
                                <Text className="text-[10px] font-bold text-white">OUT</Text>
                              </View>
                            )}
                            {isCritical && (
                              <View className="bg-coral/15 px-1.5 py-0.5 rounded-full">
                                <Text className="text-[10px] font-bold text-coral">CRITICAL</Text>
                              </View>
                            )}
                            {isLow && (
                              <View className="bg-coral/10 px-1.5 py-0.5 rounded-full">
                                <Text className="text-[10px] font-bold text-coral">LOW STOCK</Text>
                              </View>
                            )}
                          </View>
                          <Text className="text-xs text-smoke mt-0.5">
                            {item.currentStock} {item.unit} on hand
                            {item.costPerUnit ? ` · $${(item.qtyNeeded * item.costPerUnit).toFixed(2)}` : ""}
                          </Text>
                        </View>

                        {/* Qty stepper */}
                        <View className="flex-row items-center gap-1.5">
                          <TouchableOpacity
                            onPress={() => updateQty(item.ingredientId, -1)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                            className="h-7 w-7 rounded-full bg-surfaceHi items-center justify-center"
                          >
                            <Text className="text-sm text-mist leading-none">−</Text>
                          </TouchableOpacity>
                          <Text className="text-sm font-bold w-6 text-center text-pearl">{item.qtyNeeded}</Text>
                          <TouchableOpacity
                            onPress={() => updateQty(item.ingredientId, 1)}
                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                            className="h-7 w-7 rounded-full bg-surfaceHi items-center justify-center"
                          >
                            <Text className="text-sm text-mist leading-none">+</Text>
                          </TouchableOpacity>
                          <Text className="text-xs text-smoke ml-0.5">{item.unit}</Text>
                        </View>

                        <TouchableOpacity
                          onPress={() => removeItem(item.ingredientId)}
                          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                          className="h-6 w-6 rounded-full bg-coral/5 items-center justify-center"
                        >
                          <Ionicons name="close" size={12} color={C.coral} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Create POs banner (shown after Smart Suggest) */}
          {fromSuggest && items.some(i => i.supplierId) && (
            <TouchableOpacity
              onPress={handleCreatePOs}
              disabled={creatingPOs}
              activeOpacity={0.8}
              className="flex-row items-center gap-3 bg-jade/10 border border-jade/30 rounded-2xl px-4 py-3"
            >
              <View className="h-9 w-9 rounded-xl bg-jade items-center justify-center flex-shrink-0">
                {creatingPOs
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="receipt-outline" size={18} color="#fff" />}
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-jade">
                  {creatingPOs ? "Creating Purchase Orders…" : "Create Purchase Orders"}
                </Text>
                <Text className="text-xs text-jade/70">
                  {creatingPOs
                    ? "Grouping by vendor and saving drafts"
                    : `Generate ${vendorGroups.filter(g => g.supplierId).length} draft PO${vendorGroups.filter(g => g.supplierId).length !== 1 ? "s" : ""} — one per vendor`}
                </Text>
              </View>
              {!creatingPOs && <Ionicons name="chevron-forward" size={16} color="#16a34a" />}
            </TouchableOpacity>
          )}

          {/* Share / clear */}
          <View className="flex-row gap-2 pb-2">
            <TouchableOpacity
              onPress={shareReport}
              disabled={sharing}
              className="flex-1 flex-row items-center justify-center gap-2 bg-gold rounded-2xl py-4"
            >
              {sharing
                ? <ActivityIndicator color="#fff" size="small" />
                : <>
                    <Ionicons name="share-outline" size={18} color="#fff" />
                    <Text className="text-white font-bold">Share Report</Text>
                  </>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert("Clear List", "Remove all items from the reorder list?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Clear", style: "destructive", onPress: () => { setItems([]); setFromSuggest(false); setSuggestSummary(null); } },
                ]);
              }}
              className="h-14 w-14 rounded-2xl bg-coral/5 items-center justify-center"
            >
              <Ionicons name="trash-outline" size={20} color={C.coral} />
            </TouchableOpacity>
          </View>
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}
