import { useState } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  Modal, RefreshControl, Alert, ActivityIndicator, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getInventory, getStorageAreas, barcodeSearch, patchInventoryItem, adjustInventory, patchIngredient, getSuppliers } from "@/lib/api";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import type { InventoryItem } from "@/lib/api";
import { Scanner } from "@/components/Scanner";
import { ShelfSetup } from "@/components/ShelfSetup";
import { VoiceCountMode } from "@/components/VoiceCountMode";
import { ScreenMessage } from "@/components/ScreenMessage";
import { IngredientImport } from "@/components/IngredientImport";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";

// Stock quantities are floats from recipe depletion — show at most 2 decimals,
// trailing zeros stripped (14.198952793 → 14.2, 44 → 44).
function fmtQty(n: number): string {
  return Number(n.toFixed(2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function InventoryScreen() {
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{ name: string; qty: number; unit: string } | null>(null);
  const [shelfSetupOpen, setShelfSetupOpen] = useState(false);
  const [voiceCountOpen, setVoiceCountOpen] = useState(false);
  const [ingredientImportOpen, setIngredientImportOpen] = useState(false);

  // Par-level edit state
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editPar, setEditPar] = useState("");
  const [editMax, setEditMax] = useState("");
  const [saving, setSaving] = useState(false);
  const [adjType, setAdjType] = useState<"RECEIVED" | "WASTED" | "RETURNED" | "ADJUSTED">("RECEIVED");
  const [adjQty, setAdjQty] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: getSuppliers });

  const { data: inventory = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["inventory"],
    queryFn: getInventory,
    refetchInterval: 120_000,
  });
  const { refreshing, run } = useManualRefresh();

  const { data: storageAreas = [] } = useQuery({
    queryKey: ["storageAreas"],
    queryFn: getStorageAreas,
  });

  // True when every inventory item has a storageArea assigned
  const setupComplete = inventory.length > 0 && inventory.every(i => i.storageArea);

  function handleCountMode() {
    if (!setupComplete) {
      setShelfSetupOpen(true);
    } else {
      setVoiceCountOpen(true);
    }
  }

  const visible = inventory.filter((i) =>
    !search || i.ingredient.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = visible.filter((i) => Number(i.quantity) <= Number(i.minThreshold));
  const okStock = visible.filter((i) => Number(i.quantity) > Number(i.minThreshold));

  async function handleScan(barcode: string) {
    setScannerOpen(false);
    try {
      const result = await barcodeSearch(barcode);
      // A barcode already attached to one of our ingredients (local), else the
      // closest existing match the lookup suggested.
      const match = result.local ?? result.suggestions?.[0] ?? null;
      if (match) {
        const inv = inventory.find((i) => i.ingredient.id === match.id);
        setScanResult({
          name: match.name,
          qty: inv ? Number(inv.quantity) : 0,
          unit: match.unit,
        });
      } else if (result.external) {
        // Recognized product, but it isn't in this inventory yet.
        Alert.alert(
          "Not in inventory",
          `"${result.external.name}" isn't in your inventory yet. Use Import Ingredients to add it.`,
        );
      } else {
        Alert.alert("Not found", `No product matched barcode ${barcode}.`);
      }
    } catch {
      Alert.alert("Error", "Could not look up barcode.");
    }
  }

  function openEdit(item: InventoryItem) {
    setEditItem(item);
    setEditPar(String(Number(item.minThreshold)));
    setEditMax(item.maxThreshold != null ? String(Number(item.maxThreshold)) : "");
    setAdjType("RECEIVED"); setAdjQty(""); setAdjNote("");
  }

  async function applyAdjust() {
    if (!editItem) return;
    const qty = parseFloat(adjQty);
    if (isNaN(qty) || qty === 0) { Alert.alert("Invalid", "Enter a non-zero quantity."); return; }
    setAdjusting(true);
    try {
      const res = await adjustInventory({ ingredientId: editItem.ingredient.id, quantity: qty, type: adjType, notes: adjNote.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEditItem((prev) => prev ? { ...prev, quantity: Number(res.updatedItem.quantity) } : prev);
      setAdjQty(""); setAdjNote("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to adjust");
    } finally { setAdjusting(false); }
  }

  async function setSupplier(supplierId: string | null) {
    if (!editItem) return;
    try {
      await patchIngredient(editItem.ingredient.id, { supplierId });
      const sup = supplierId ? suppliers.find((s) => s.id === supplierId) ?? null : null;
      setEditItem((prev) => prev ? { ...prev, ingredient: { ...prev.ingredient, supplierId, supplier: sup } } : prev);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to set supplier");
    }
  }

  async function savePar() {
    if (!editItem) return;
    const par = parseFloat(editPar);
    if (isNaN(par) || par < 0) { Alert.alert("Invalid", "Enter a valid par level (0 or more)."); return; }
    const max = editMax.trim() ? parseFloat(editMax) : null;
    if (max !== null && (isNaN(max) || max < par)) {
      Alert.alert("Invalid", "Max level must be greater than the par level."); return;
    }
    setSaving(true);
    try {
      await patchInventoryItem(editItem.id, { minThreshold: par, maxThreshold: max });
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
      setEditItem(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <ShelfSetup
        visible={shelfSetupOpen}
        onClose={() => setShelfSetupOpen(false)}
        onSetupComplete={() => {
          setShelfSetupOpen(false);
          setVoiceCountOpen(true);
        }}
      />

      {voiceCountOpen && (
        <VoiceCountMode
          visible={voiceCountOpen}
          areas={storageAreas}
          inventory={inventory}
          onClose={() => setVoiceCountOpen(false)}
          onComplete={() => {
            setVoiceCountOpen(false);
            qc.invalidateQueries({ queryKey: ["inventory"] });
          }}
        />
      )}

      {scannerOpen && (
        <Modal animationType="slide" onRequestClose={() => setScannerOpen(false)}>
          <Scanner onScan={handleScan} onClose={() => setScannerOpen(false)} hint="Scan ingredient barcode to check stock" />
        </Modal>
      )}

      {/* Scan result overlay */}
      {scanResult && (
        <Modal transparent animationType="fade" onRequestClose={() => setScanResult(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center" }}
            onPress={() => setScanResult(null)}
          >
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 24,
                padding: 32,
                marginHorizontal: 32,
                alignItems: "center",
                gap: 12,
                borderWidth: 1,
                borderColor: C.rim,
                ...shadow.md,
              }}
            >
              <View
                style={{
                  height: 56,
                  width: 56,
                  borderRadius: 16,
                  backgroundColor: C.surfaceHi,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 4,
                }}
              >
                <Ionicons name="cube-outline" size={28} color={C.mist} />
              </View>
              <Text style={{ color: C.pearl, fontSize: 20, fontWeight: "700" }}>{scanResult.name}</Text>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 99,
                  backgroundColor: scanResult.qty <= 0 ? T.coral : T.jade,
                  borderWidth: 1,
                  borderColor: scanResult.qty <= 0 ? C.coral : C.jade,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: scanResult.qty <= 0 ? C.coral : C.jade,
                  }}
                >
                  {scanResult.qty} {scanResult.unit}
                </Text>
              </View>
              <Text style={{ color: C.smoke, fontSize: 13 }}>Tap anywhere to dismiss</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Par-level edit modal — bottom sheet */}
      {editItem && (
        <Modal transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}
            activeOpacity={1}
            onPress={() => setEditItem(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View
                style={{
                  backgroundColor: C.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 36,
                  gap: 16,
                  borderTopWidth: 1,
                  borderColor: C.rim,
                  ...shadow.md,
                }}
              >
                {/* Drag handle */}
                <View
                  style={{
                    width: 40,
                    height: 4,
                    backgroundColor: C.rim,
                    borderRadius: 99,
                    alignSelf: "center",
                    marginBottom: 4,
                  }}
                />

                <View className="flex-row items-center justify-between">
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.pearl, fontSize: 18, fontWeight: "700" }}>{editItem.ingredient.name}</Text>
                    <Text style={{ color: C.mist, fontSize: 13, marginTop: 2 }}>
                      Current stock: {fmtQty(Number(editItem.quantity))} {editItem.ingredient.unit}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setEditItem(null)}
                    style={{
                      height: 32,
                      width: 32,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 99,
                      backgroundColor: C.surfaceHi,
                      borderWidth: 1,
                      borderColor: C.rim,
                    }}
                  >
                    <Ionicons name="close" size={16} color={C.mist} />
                  </TouchableOpacity>
                </View>

                {/* Stock adjustment */}
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Adjust Stock</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {([["RECEIVED", "Received"], ["WASTED", "Wasted"], ["RETURNED", "Returned"], ["ADJUSTED", "Correct"]] as const).map(([t, lbl]) => {
                      const sel = adjType === t;
                      const col = t === "WASTED" ? C.coral : t === "ADJUSTED" ? C.sky : C.jade;
                      return (
                        <TouchableOpacity key={t} onPress={() => setAdjType(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: sel ? `${col}1A` : C.surfaceHi, borderWidth: 1, borderColor: sel ? col : C.rim }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: sel ? col : C.mist }}>{lbl}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, paddingHorizontal: 12 }}>
                      <TextInput value={adjQty} onChangeText={setAdjQty} placeholder={adjType === "ADJUSTED" ? "± qty" : "qty"} placeholderTextColor={C.smoke} keyboardType="numbers-and-punctuation" style={{ flex: 1, paddingVertical: 10, fontSize: 15, color: C.pearl }} />
                      <Text style={{ fontSize: 12, color: C.mist }}>{editItem.ingredient.unit}</Text>
                    </View>
                    <TouchableOpacity onPress={applyAdjust} disabled={adjusting} style={{ paddingHorizontal: 18, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: C.gold, opacity: adjusting ? 0.6 : 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.void }}>{adjusting ? "…" : "Apply"}</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput value={adjNote} onChangeText={setAdjNote} placeholder="Note (optional)" placeholderTextColor={C.smoke} style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: C.pearl }} />
                </View>

                {/* Supplier */}
                <View style={{ gap: 8, marginTop: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Supplier</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    <TouchableOpacity onPress={() => setSupplier(null)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: !editItem.ingredient.supplierId ? `${C.gold}1A` : C.surfaceHi, borderWidth: 1, borderColor: !editItem.ingredient.supplierId ? C.gold : C.rim }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: !editItem.ingredient.supplierId ? C.gold : C.mist }}>None</Text>
                    </TouchableOpacity>
                    {suppliers.map((s) => {
                      const sel = editItem.ingredient.supplierId === s.id;
                      return (
                        <TouchableOpacity key={s.id} onPress={() => setSupplier(s.id)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: sel ? `${C.gold}1A` : C.surfaceHi, borderWidth: 1, borderColor: sel ? C.gold : C.rim }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: sel ? C.gold : C.mist }}>{s.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View className="flex-row gap-3">
                  {/* Par Level */}
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: C.smoke,
                        textTransform: "uppercase",
                        letterSpacing: 1.2,
                      }}
                    >
                      Par Level *
                    </Text>
                    <Text style={{ fontSize: 10, color: C.smoke, marginTop: -2 }}>Reorder when stock falls below</Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: C.surfaceHi,
                        borderWidth: 1,
                        borderColor: C.rim,
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <TextInput
                        style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: C.pearl }}
                        value={editPar}
                        onChangeText={setEditPar}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={C.smoke}
                        autoFocus
                      />
                      <Text style={{ paddingRight: 12, fontSize: 13, color: C.mist }}>{editItem.ingredient.unit}</Text>
                    </View>
                  </View>

                  {/* Max Level */}
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: C.smoke,
                        textTransform: "uppercase",
                        letterSpacing: 1.2,
                      }}
                    >
                      Max Level
                    </Text>
                    <Text style={{ fontSize: 10, color: C.smoke, marginTop: -2 }}>Optional order-up-to target</Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: C.surfaceHi,
                        borderWidth: 1,
                        borderColor: C.rim,
                        borderRadius: 12,
                        overflow: "hidden",
                      }}
                    >
                      <TextInput
                        style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontWeight: "600", color: C.pearl }}
                        value={editMax}
                        onChangeText={setEditMax}
                        keyboardType="decimal-pad"
                        placeholder="—"
                        placeholderTextColor={C.smoke}
                      />
                      <Text style={{ paddingRight: 12, fontSize: 13, color: C.mist }}>{editItem.ingredient.unit}</Text>
                    </View>
                  </View>
                </View>

                {/* Preview */}
                {editPar.trim() !== "" && !isNaN(parseFloat(editPar)) && (
                  <View
                    style={{
                      backgroundColor: T.gold,
                      borderWidth: 1,
                      borderColor: C.goldDim,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons name="information-circle-outline" size={15} color={C.gold} />
                    <Text style={{ fontSize: 12, color: C.gold, flex: 1 }}>
                      Alert when stock drops below{" "}
                      <Text style={{ fontWeight: "700" }}>{editPar} {editItem.ingredient.unit}</Text>
                      {editMax.trim() && !isNaN(parseFloat(editMax))
                        ? `. Order up to ${editMax} ${editItem.ingredient.unit}.`
                        : "."}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={savePar}
                  disabled={saving}
                  style={{
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    backgroundColor: saving ? C.surfaceHi : C.gold,
                    ...(saving ? {} : shadow.gold),
                  }}
                >
                  {saving ? (
                    <ActivityIndicator color={C.mist} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                      <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Par Level</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      <IngredientImport
        visible={ingredientImportOpen}
        onClose={() => setIngredientImportOpen(false)}
        onSaved={(count) => {
          setIngredientImportOpen(false);
          qc.invalidateQueries({ queryKey: ["inventory"] });
          if (count > 0) {
            Alert.alert(
              "Ingredients Added",
              `${count} ingredient${count === 1 ? "" : "s"} saved to your library.`,
              [{ text: "OK" }]
            );
          }
        }}
      />

      <CollapsingHeader
        title="Inventory"
        subtitle={`${inventory.length} ingredients`}
        scrollY={scrollY}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Stock-count barcode scan — existing tool, unchanged */}
            <TouchableOpacity
              onPress={() => setScannerOpen(true)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                backgroundColor: C.surfaceHi, paddingHorizontal: 12, paddingVertical: 9,
                borderRadius: 99, borderWidth: 1, borderColor: C.rim,
              }}
            >
              <Ionicons name="barcode-outline" size={16} color={C.mist} />
            </TouchableOpacity>
            {/* Ingredient import — photo or barcode to add new ingredients */}
            <TouchableOpacity
              onPress={() => setIngredientImportOpen(true)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 5,
                backgroundColor: C.surfaceHi, paddingHorizontal: 12, paddingVertical: 9,
                borderRadius: 99, borderWidth: 1, borderColor: C.rim,
              }}
            >
              <Ionicons name="add-circle-outline" size={16} color={C.mist} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCountMode}
              style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 9,
                borderRadius: 99, ...shadow.gold,
              }}
            >
              <Ionicons name="mic-outline" size={15} color={C.void} />
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 13 }}>Count</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Search bar */}
      <View
        style={{
          backgroundColor: C.surface,
          borderBottomWidth: 1,
          borderBottomColor: C.rim,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: C.surfaceHi,
            borderWidth: 1,
            borderColor: C.rim,
            borderRadius: 12,
            paddingHorizontal: 12,
            gap: 8,
          }}
        >
          <Ionicons name="search-outline" size={16} color={C.smoke} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
            placeholder="Search ingredients…"
            placeholderTextColor={C.smoke}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <Animated.ScrollView
        contentContainerClassName="p-4 gap-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {/* Voice count entry card */}
        {!isLoading && inventory.length > 0 && (
          <TouchableOpacity
            onPress={handleCountMode}
            activeOpacity={0.8}
            style={{
              backgroundColor: C.surface, borderRadius: 18, borderWidth: 1,
              borderColor: C.gold, padding: 16, flexDirection: "row",
              alignItems: "center", gap: 14, ...shadow.gold,
            }}
          >
            <View style={{
              width: 48, height: 48, borderRadius: 14, backgroundColor: C.gold,
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="mic" size={24} color={C.void} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>Voice Count Mode</Text>
              <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>
                {setupComplete
                  ? `${inventory.length} items organised — tap to start counting`
                  : "Set up shelf order, then count hands-free"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.gold} />
          </TouchableOpacity>
        )}

        {isLoading && (
          <View className="items-center py-12">
            <Text style={{ color: C.mist }}>Loading inventory…</Text>
          </View>
        )}
        {!isLoading && isError && inventory.length === 0 && (
          <ScreenMessage
            icon="cloud-offline-outline"
            tone="error"
            title="Couldn't load inventory"
            subtitle="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => refetch()}
          />
        )}

        {!isLoading && !isError && inventory.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 56, gap: 16 }}>
            <View
              style={{
                height: 64,
                width: 64,
                borderRadius: 16,
                backgroundColor: C.surfaceHi,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: C.rim,
              }}
            >
              <Ionicons name="cube-outline" size={30} color={C.smoke} />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ color: C.pearl, fontSize: 15, fontWeight: "600" }}>No ingredients yet</Text>
              <Text style={{ color: C.mist, fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
                Import from a photo, scan a barcode, or add ingredients manually
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIngredientImportOpen(true)}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: C.gold, paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 99, ...shadow.gold,
              }}
            >
              <Ionicons name="add-circle-outline" size={17} color={C.void} />
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 14 }}>Import Ingredients</Text>
            </TouchableOpacity>
          </View>
        )}

        {lowStock.length > 0 && (
          <View>
            {/* Low stock section header */}
            <View className="flex-row items-center gap-1.5 mb-2">
              <Ionicons name="warning-outline" size={13} color={C.coral} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: C.coral,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                Low Stock ({lowStock.length})
              </Text>
            </View>
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: C.rim,
                overflow: "hidden",
              }}
            >
              {lowStock.map((item, i) => (
                <StockRow key={item.id} item={item} last={i === lowStock.length - 1} low onEdit={openEdit} />
              ))}
            </View>
          </View>
        )}

        {okStock.length > 0 && (
          <View>
            {/* In stock section header */}
            <View className="flex-row items-center gap-1.5 mb-2">
              <Ionicons name="checkmark-circle-outline" size={13} color={C.jade} />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: C.jade,
                  textTransform: "uppercase",
                  letterSpacing: 1.2,
                }}
              >
                In Stock ({okStock.length})
              </Text>
            </View>
            <View
              style={{
                backgroundColor: C.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: C.rim,
                overflow: "hidden",
              }}
            >
              {okStock.map((item, i) => (
                <StockRow key={item.id} item={item} last={i === okStock.length - 1} onEdit={openEdit} />
              ))}
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

function StockRow({ item, last, low, onEdit }: { item: InventoryItem; last: boolean; low?: boolean; onEdit: (item: InventoryItem) => void }) {
  const pct = Math.min(1, Number(item.quantity) / Math.max(Number(item.minThreshold) * 2, 1));
  return (
    <TouchableOpacity
      onPress={() => onEdit(item)}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: C.rim,
        backgroundColor: "transparent",
      }}
      activeOpacity={0.7}
    >
      <View className="flex-row justify-between items-center mb-1.5">
        <Text style={{ fontSize: 14, fontWeight: "500", color: C.pearl, flex: 1, marginRight: 8 }}>
          {item.ingredient.name}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text style={{ fontSize: 14, fontWeight: "700", color: low ? C.coral : C.jade }}>
            {fmtQty(Number(item.quantity))}{" "}
            <Text style={{ color: C.mist, fontWeight: "400" }}>{item.ingredient.unit}</Text>
          </Text>
          <Ionicons name="create-outline" size={14} color={C.smoke} />
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={{
          height: 4,
          backgroundColor: C.surfaceHi,
          borderRadius: 99,
          overflow: "hidden",
          marginBottom: 5,
        }}
      >
        <View
          style={{
            height: "100%",
            borderRadius: 99,
            backgroundColor: low ? C.coral : C.jade,
            width: `${pct * 100}%`,
          }}
        />
      </View>

      <View className="flex-row items-center gap-3">
        <Text style={{ fontSize: 11, color: C.mist }}>
          Par:{" "}
          <Text style={{ fontWeight: "500", color: C.mist }}>
            {Number(item.minThreshold)} {item.ingredient.unit}
          </Text>
        </Text>
        {item.maxThreshold != null && (
          <Text style={{ fontSize: 11, color: C.mist }}>
            Max:{" "}
            <Text style={{ fontWeight: "500", color: C.mist }}>
              {Number(item.maxThreshold)} {item.ingredient.unit}
            </Text>
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
