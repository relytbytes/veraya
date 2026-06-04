import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  Modal, Alert, ActivityIndicator, TextInput, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPurchaseOrders, getPurchaseOrder, patchPurchaseOrder, deletePurchaseOrder,
  getSuppliers, getIngredients, createPurchaseOrder, createIngredient, visionIdentify, extractInvoice, createSupplier as createSupplierApi,
} from "@/lib/api";
import type { PurchaseOrder, Supplier, IngredientFull, VisionResult } from "@/lib/api";
import { generatePOInvoicePDF, sharePDF } from "@/lib/invoice";
import { Scanner } from "@/components/Scanner";
import { PhotoCapture } from "@/components/PhotoCapture";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { C } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { useAuthStore } from "@/store/auth";

type AddItemMode = "search" | "scan" | "camera" | "vision_processing" | "vision_result" | "create";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT:     { bg: "bg-gray-100",   text: "text-mist" },
  ORDERED:   { bg: "bg-sky/10",   text: "text-sky" },
  PARTIAL:   { bg: "bg-gold-muted",  text: "text-gold-dim" },
  RECEIVED:  { bg: "bg-jade/10",  text: "text-jade" },
  CANCELLED: { bg: "bg-coral/10",    text: "text-coral" },
};

type DraftItem = {
  ingredientId: string; name: string; unit: string;
  quantity: number; unitCost: number;
};

type ScreenView = "list" | "detail" | "create";

export default function InvoicesScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // ── view routing ───────────────────────────────────────────────────────────
  const [view, setView] = useState<ScreenView>("list");
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  // ── receive screen state ───────────────────────────────────────────────────
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [receiveScanner, setReceiveScanner] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ── create PO state ────────────────────────────────────────────────────────
  const [createSupplier, setCreateSupplier] = useState<Supplier | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [createInvoiceNum, setCreateInvoiceNum] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [invoicePhoto, setInvoicePhoto] = useState<string | null>(null);
  const [invoiceCameraOpen, setInvoiceCameraOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [addItemModal, setAddItemModal] = useState(false);
  const [addItemMode, setAddItemMode] = useState<AddItemMode>("search");
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [pickedIngredient, setPickedIngredient] = useState<IngredientFull | null>(null);
  const [draftQty, setDraftQty] = useState("1");
  const [draftCost, setDraftCost] = useState("");
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [newIngName, setNewIngName] = useState("");
  const [newIngUnit, setNewIngUnit] = useState("");
  const [newIngCost, setNewIngCost] = useState("");
  const [newIngCreating, setNewIngCreating] = useState(false);

  const createTimestamp = useMemo(() => new Date(), []);

  // ── correct / delete (management only) ────────────────────────────────────
  const [correctModal, setCorrectModal] = useState(false);
  const [correctInvoiceNum, setCorrectInvoiceNum] = useState("");
  const [correctNotes, setCorrectNotes] = useState("");
  const [correctItems, setCorrectItems] = useState<{ ingredientId: string; name: string; unit: string; quantity: string; unitCost: string }[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";

  // ── list scanner ───────────────────────────────────────────────────────────
  const [listScanner, setListScanner] = useState(false);

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: pos = [], refetch } = useQuery({
    queryKey: ["purchaseOrders"],
    queryFn: getPurchaseOrders,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: getSuppliers,
    enabled: supplierModal || view === "create",
  });

  const { data: ingredients = [] } = useQuery({
    queryKey: ["ingredients"],
    queryFn: getIngredients,
    enabled: addItemModal,
  });

  const filteredIngredients = useMemo(
    () => ingredients.filter((i) =>
      !ingredientSearch || i.name.toLowerCase().includes(ingredientSearch.toLowerCase())
    ),
    [ingredients, ingredientSearch]
  );

  // ── helpers ────────────────────────────────────────────────────────────────
  async function openPO(po: PurchaseOrder) {
    const full = await getPurchaseOrder(po.id);
    const init: Record<string, number> = {};
    full.items.forEach((i) => { init[i.id] = 0; });
    setReceivedQtys(init);
    setSelected(full);
    setView("detail");
  }

  function handleListScan(barcode: string) {
    setListScanner(false);
    const match = pos.find((po) =>
      po.items?.some((item) => item.ingredient.barcode === barcode)
    );
    if (match) {
      openPO(match);
    } else {
      Alert.alert("No PO found", `No purchase order contains a product with barcode ${barcode}.`);
    }
  }

  function handleReceiveScan(barcode: string) {
    setReceiveScanner(false);
    if (!selected) return;
    const item = selected.items.find((i) => i.ingredient.barcode === barcode);
    if (item) {
      setReceivedQtys((prev) => ({ ...prev, [item.id]: (prev[item.id] ?? 0) + 1 }));
    } else {
      Alert.alert("Not found", `Barcode ${barcode} doesn't match any item in this PO.`);
    }
  }

  async function generateInvoice() {
    if (!selected) return;
    setGenerating(true);
    try {
      await patchPurchaseOrder(selected.id, { status: "RECEIVED", receivedAt: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["purchaseOrders"] });
      const uri = await generatePOInvoicePDF(selected, receivedQtys, user?.name ?? undefined);
      await sharePDF(uri);
      setView("list");
      setSelected(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to generate invoice");
    } finally {
      setGenerating(false);
    }
  }

  function openCorrectModal() {
    if (!selected) return;
    setCorrectInvoiceNum(selected.invoiceNumber ?? "");
    setCorrectNotes(selected.notes ?? "");
    setCorrectItems(selected.items.map((i) => ({
      ingredientId: i.ingredient.id,
      name: i.ingredient.name,
      unit: i.ingredient.unit,
      quantity: String(i.quantity),
      unitCost: Number(i.unitCost).toFixed(2),
    })));
    setCorrectModal(true);
  }

  async function saveCorrection() {
    if (!selected) return;
    if (!correctInvoiceNum.trim()) { Alert.alert("Required", "Invoice number cannot be empty."); return; }
    for (const item of correctItems) {
      if (!parseFloat(item.quantity) || !parseFloat(item.unitCost)) {
        Alert.alert("Invalid", `Check quantity and cost for ${item.name}.`); return;
      }
    }
    setCorrecting(true);
    try {
      const updated = await patchPurchaseOrder(selected.id, {
        invoiceNumber: correctInvoiceNum.trim(),
        notes: correctNotes || undefined,
        items: correctItems.map((i) => ({
          ingredientId: i.ingredientId,
          quantity: parseFloat(i.quantity),
          unitCost: parseFloat(i.unitCost),
        })),
      });
      setSelected(updated);
      setCorrectModal(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["purchaseOrders"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save correction");
    } finally {
      setCorrecting(false);
    }
  }

  function handleDelete() {
    if (!selected) return;
    Alert.alert(
      "Delete Invoice",
      `Permanently delete invoice ${selected.invoiceNumber ?? selected.id.slice(-8).toUpperCase()}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deletePurchaseOrder(selected.id);
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["purchaseOrders"] }),
                qc.invalidateQueries({ queryKey: ["inventory"] }),
                qc.invalidateQueries({ queryKey: ["dashboard"] }),
              ]);
              setView("list");
              setSelected(null);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  function closeAddItemModal() {
    setAddItemModal(false);
    setPickedIngredient(null);
    setAddItemMode("search");
    setIngredientSearch("");
    setVisionResult(null);
    setDraftQty("1");
    setDraftCost("");
    setNewIngName("");
    setNewIngUnit("");
    setNewIngCost("");
  }

  function openAddItemModal(mode: AddItemMode) {
    setPickedIngredient(null);
    setVisionResult(null);
    setIngredientSearch("");
    setDraftQty("1");
    setDraftCost("");
    setNewIngName("");
    setNewIngUnit("");
    setNewIngCost("");
    setAddItemMode(mode);
    setAddItemModal(true);
  }

  function pickIngredient(ing: IngredientFull) {
    setPickedIngredient(ing);
    setDraftCost(ing.costPerUnit ? Number(ing.costPerUnit).toFixed(2) : "");
    setAddItemMode("search"); // so closing modal resets correctly
  }

  // Barcode scan within the Add Item flow
  function handleAddItemScan(barcode: string) {
    setAddItemMode("search");
    const match = ingredients.find((i) => i.barcode === barcode);
    if (match) {
      pickIngredient(match);
    } else {
      Alert.alert("Not found", `No ingredient matched barcode ${barcode}.`);
    }
  }

  // AI photo identification
  async function handlePhotoCapture(dataUrl: string) {
    setAddItemMode("vision_processing");
    try {
      const result = await visionIdentify(dataUrl);
      setVisionResult(result);
      setAddItemMode("vision_result");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "AI identification failed");
      setAddItemMode("search");
    }
  }

  // Full invoice extraction → prefill supplier, invoice #, and line items.
  async function extractInvoiceLines() {
    if (!invoicePhoto) return;
    setExtracting(true);
    try {
      const res = await extractInvoice(invoicePhoto);
      let supplierNote = "";
      if (res.matchedSupplierId && !createSupplier) {
        const s = suppliers.find((x) => x.id === res.matchedSupplierId);
        if (s) setCreateSupplier(s);
      } else if (!res.matchedSupplierId && res.vendor && !createSupplier) {
        // New vendor → build the supplier database straight from the invoice.
        try {
          const s = await createSupplierApi({ name: res.vendor, phone: res.vendorPhone, email: res.vendorEmail, address: res.vendorAddress });
          setCreateSupplier(s);
          qc.invalidateQueries({ queryKey: ["suppliers"] });
          supplierNote = `Added new supplier "${s.name}".`;
        } catch { supplierNote = `Couldn't auto-add supplier "${res.vendor}" — pick or create one.`; }
      }
      if (res.invoiceNumber && !createInvoiceNum.trim()) setCreateInvoiceNum(res.invoiceNumber);
      const added: DraftItem[] = [];
      for (const l of res.lines) {
        if (!l.matchedIngredientId || l.quantity == null) continue;
        const ing = ingredients.find((i) => i.id === l.matchedIngredientId);
        if (!ing) continue;
        added.push({ ingredientId: ing.id, name: ing.name, unit: ing.unit, quantity: l.quantity, unitCost: l.unitCost ?? 0 });
      }
      if (added.length) setDraftItems((prev) => [...prev, ...added]);
      const needsReview = res.lines.length - added.length;
      const parts = [];
      if (supplierNote) parts.push(supplierNote);
      parts.push(`Added ${added.length} matched item${added.length === 1 ? "" : "s"}.`);
      if (needsReview > 0) parts.push(`${needsReview} line${needsReview === 1 ? "" : "s"} need manual matching — add them by search.`);
      if (res.totalsMatch === false && res.total != null) parts.push(`Heads up: line totals ($${res.computedTotal}) don't match the invoice total ($${res.total}).`);
      Alert.alert("Vera read the invoice", parts.join("\n\n"));
    } catch (e) {
      Alert.alert("Couldn't read invoice", (e as Error).message ?? "Try a clearer, straight-on photo.");
    } finally {
      setExtracting(false);
    }
  }

  async function saveNewIngredient() {
    if (!newIngName.trim()) { Alert.alert("Required", "Enter an ingredient name."); return; }
    if (!newIngUnit.trim()) { Alert.alert("Required", "Enter a unit (e.g. lbs, each, case)."); return; }
    const cost = parseFloat(newIngCost);
    if (!newIngCost || isNaN(cost)) { Alert.alert("Required", "Enter a unit cost."); return; }
    setNewIngCreating(true);
    try {
      const created = await createIngredient({ name: newIngName.trim(), unit: newIngUnit.trim(), costPerUnit: cost });
      qc.invalidateQueries({ queryKey: ["ingredients"] });
      pickIngredient(created);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create ingredient");
    } finally {
      setNewIngCreating(false);
    }
  }

  function addDraftItem() {
    if (!pickedIngredient) return;
    const qty = parseFloat(draftQty);
    const cost = parseFloat(draftCost);
    if (!qty || isNaN(qty) || !cost || isNaN(cost)) {
      Alert.alert("Invalid", "Enter a valid quantity and unit cost.");
      return;
    }
    setDraftItems((prev) => {
      const idx = prev.findIndex((d) => d.ingredientId === pickedIngredient.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty };
        return updated;
      }
      return [...prev, {
        ingredientId: pickedIngredient.id,
        name: pickedIngredient.name,
        unit: pickedIngredient.unit,
        quantity: qty,
        unitCost: cost,
      }];
    });
    setPickedIngredient(null);
    setDraftQty("1");
    setDraftCost("");
    setIngredientSearch("");
    setAddItemModal(false);
  }

  async function submitCreatePO() {
    if (!createSupplier) { Alert.alert("Missing", "Select a supplier first."); return; }
    if (!createInvoiceNum.trim()) { Alert.alert("Missing", "Invoice number is required."); return; }
    if (draftItems.length === 0) { Alert.alert("Missing", "Add at least one item."); return; }
    setSubmitting(true);
    try {
      const newPO = await createPurchaseOrder({
        supplierId: createSupplier.id,
        invoiceNumber: createInvoiceNum.trim(),
        invoiceImageUrl: invoicePhoto || undefined,
        notes: createNotes || undefined,
        items: draftItems.map((d) => ({
          ingredientId: d.ingredientId,
          quantity: d.quantity,
          unitCost: d.unitCost,
        })),
      });
      // Immediately mark received so inventory quantities update
      await patchPurchaseOrder(newPO.id, { status: "RECEIVED" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["purchaseOrders"] }),
        qc.invalidateQueries({ queryKey: ["inventory"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      setCreateSupplier(null);
      setDraftItems([]);
      setCreateInvoiceNum("");
      setCreateNotes("");
      setInvoicePhoto(null);
      setView("list");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  }

  const draftTotal = draftItems.reduce((s, d) => s + d.quantity * d.unitCost, 0);

  // ══════════════════════════════════════════════════════════════════════════════
  // CREATE PO SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (view === "create") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>

        {/* ── Supplier picker modal ── */}
        <Modal visible={supplierModal} animationType="slide" onRequestClose={() => setSupplierModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
            <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
              <TouchableOpacity onPress={() => setSupplierModal(false)} className="h-8 w-8 items-center justify-center">
                <Ionicons name="close" size={22} color={C.mist} />
              </TouchableOpacity>
              <Text className="text-lg font-bold text-pearl">Select Supplier</Text>
            </View>
            <ScrollView contentContainerClassName="p-4 gap-2">
              {suppliers.length === 0 && (
                <Text className="text-smoke text-center py-8">No suppliers found</Text>
              )}
              {suppliers.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => { setCreateSupplier(s); setSupplierModal(false); }}
                  className={`px-4 py-4 rounded-2xl border flex-row items-center justify-between
                    ${createSupplier?.id === s.id ? "bg-gold-muted border-amber-300" : "bg-white border-gray-200"}`}
                >
                  <View>
                    <Text className={`font-semibold text-base ${createSupplier?.id === s.id ? "text-amber-900" : "text-pearl"}`}>
                      {s.name}
                    </Text>
                    {s.contactName && (
                      <Text className="text-sm text-smoke">{s.contactName}</Text>
                    )}
                  </View>
                  {createSupplier?.id === s.id && (
                    <Ionicons name="checkmark-circle" size={22} color={C.gold} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* ── Add ingredient modal (multi-mode: search / scan / camera / vision) ── */}
        <Modal visible={addItemModal} animationType="slide" onRequestClose={closeAddItemModal}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>

            {/* ── BARCODE SCANNER mode ── */}
            {addItemMode === "scan" && (
              <Scanner
                onScan={handleAddItemScan}
                onClose={() => setAddItemMode("search")}
                hint="Scan ingredient barcode to add to PO"
              />
            )}

            {/* ── CAMERA / AI PHOTO mode ── */}
            {addItemMode === "camera" && (
              <PhotoCapture
                onCapture={handlePhotoCapture}
                onClose={() => setAddItemMode("search")}
                hint="Point at the product label or packaging"
              />
            )}

            {/* ── AI PROCESSING mode ── */}
            {addItemMode === "vision_processing" && (
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

            {/* ── AI VISION RESULT mode ── */}
            {addItemMode === "vision_result" && visionResult && (
              <>
                <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                  <TouchableOpacity onPress={() => setAddItemMode("search")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={22} color={C.gold} />
                  </TouchableOpacity>
                  <Text className="flex-1 text-lg font-bold text-pearl">AI Result</Text>
                  <TouchableOpacity onPress={closeAddItemModal}>
                    <Ionicons name="close" size={22} color={C.mist} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerClassName="p-4 gap-4">
                  {/* AI identification card */}
                  <View className="bg-gold-muted border border-amber-200 rounded-2xl p-4 gap-2">
                    <View className="flex-row items-center gap-2">
                      <Ionicons name="sparkles" size={16} color={C.goldDim} />
                      <Text className="text-xs font-semibold text-gold-dim uppercase tracking-wide">
                        AI Identified
                      </Text>
                      <View className={`ml-auto px-2 py-0.5 rounded-full ${
                        visionResult.identified.confidence === "high" ? "bg-jade/10" :
                        visionResult.identified.confidence === "medium" ? "bg-gold-muted" : "bg-coral/10"
                      }`}>
                        <Text className={`text-[10px] font-bold ${
                          visionResult.identified.confidence === "high" ? "text-jade" :
                          visionResult.identified.confidence === "medium" ? "text-gold-dim" : "text-coral"
                        }`}>
                          {visionResult.identified.confidence.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xl font-bold text-amber-900">{visionResult.identified.name}</Text>
                    {visionResult.identified.brand && (
                      <Text className="text-sm text-gold-dim">{visionResult.identified.brand}</Text>
                    )}
                    <Text className="text-sm text-gold capitalize">{visionResult.identified.type}</Text>
                  </View>

                  {/* Matching ingredients */}
                  {visionResult.matches.length > 0 ? (
                    <View>
                      <Text className="text-xs font-semibold text-mist uppercase tracking-widest mb-2">
                        Matches in your inventory ({visionResult.matches.length})
                      </Text>
                      <View className="bg-surface rounded-2xl border border-rim overflow-hidden">
                        {visionResult.matches.map((ing, i) => (
                          <TouchableOpacity
                            key={ing.id}
                            onPress={() => pickIngredient(ing)}
                            className={`px-4 py-3.5 flex-row items-center gap-3 active:bg-gold-muted ${i < visionResult.matches.length - 1 ? "border-b border-rim" : ""}`}
                          >
                            <View className="h-9 w-9 rounded-xl bg-gold-muted items-center justify-center flex-shrink-0">
                              <Ionicons name="cube-outline" size={16} color={C.goldDim} />
                            </View>
                            <View className="flex-1">
                              <Text className="font-semibold text-pearl">{ing.name}</Text>
                              {ing.costPerUnit && (
                                <Text className="text-xs text-smoke">${Number(ing.costPerUnit).toFixed(2)}/{ing.unit}</Text>
                              )}
                            </View>
                            <Text className="text-xs bg-gray-100 text-mist px-2 py-0.5 rounded-full">{ing.unit}</Text>
                            <Ionicons name="chevron-forward" size={16} color={C.smoke} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View className="bg-surfaceHi rounded-2xl p-4 items-center gap-2">
                      <Ionicons name="search-outline" size={24} color={C.smoke} />
                      <Text className="text-mist text-sm text-center">
                        No matching ingredients found.{"\n"}Try searching manually.
                      </Text>
                      <TouchableOpacity
                        onPress={() => setAddItemMode("search")}
                        className="mt-1 px-4 py-2 bg-gold rounded-xl"
                      >
                        <Text className="text-white font-semibold text-sm">Search Manually</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </>
            )}

            {/* ── QUANTITY/COST FORM (ingredient picked) ── */}
            {pickedIngredient && addItemMode !== "scan" && addItemMode !== "camera" && addItemMode !== "vision_processing" && addItemMode !== "create" && (
              <>
                <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                  <TouchableOpacity onPress={() => { setPickedIngredient(null); setAddItemMode("search"); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={22} color={C.gold} />
                  </TouchableOpacity>
                  <Text className="flex-1 text-lg font-bold text-pearl">{pickedIngredient.name}</Text>
                  <TouchableOpacity onPress={closeAddItemModal}>
                    <Ionicons name="close" size={22} color={C.mist} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
                  <View className="bg-gold-muted rounded-2xl px-4 py-3">
                    <Text className="text-lg font-bold text-amber-900">{pickedIngredient.name}</Text>
                    <Text className="text-sm text-gold mt-0.5">{pickedIngredient.unit}</Text>
                  </View>

                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-pearl">Quantity ({pickedIngredient.unit})</Text>
                    <TextInput
                      className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-base text-pearl"
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      value={draftQty}
                      onChangeText={setDraftQty}
                      autoFocus
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-pearl">Unit Cost ($/{pickedIngredient.unit})</Text>
                    <TextInput
                      className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-base text-pearl"
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      value={draftCost}
                      onChangeText={setDraftCost}
                    />
                  </View>

                  {draftQty && draftCost && !isNaN(parseFloat(draftQty)) && !isNaN(parseFloat(draftCost)) && (
                    <View className="bg-jade/5 rounded-xl px-4 py-2.5 flex-row justify-between">
                      <Text className="text-jade text-sm">Line total</Text>
                      <Text className="text-green-800 font-bold text-sm">
                        ${(parseFloat(draftQty) * parseFloat(draftCost)).toFixed(2)}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={addDraftItem}
                    className="bg-gold rounded-2xl py-4 items-center flex-row justify-center gap-2"
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text className="text-white font-bold text-base">Add to PO</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ── CREATE NEW INGREDIENT mode ── */}
            {addItemMode === "create" && (
              <>
                <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                  <TouchableOpacity onPress={() => setAddItemMode("search")} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="chevron-back" size={22} color={C.gold} />
                  </TouchableOpacity>
                  <Text className="flex-1 text-lg font-bold text-pearl">New Ingredient</Text>
                  <TouchableOpacity onPress={closeAddItemModal}>
                    <Ionicons name="close" size={22} color={C.mist} />
                  </TouchableOpacity>
                </View>
                <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-pearl">Name *</Text>
                    <TextInput
                      className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-base text-pearl"
                      placeholder="e.g. Olive Oil"
                      placeholderTextColor="#9ca3af"
                      value={newIngName}
                      onChangeText={setNewIngName}
                      autoFocus
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-pearl">Unit *</Text>
                    <TextInput
                      className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-base text-pearl"
                      placeholder="e.g. lbs, each, case, oz"
                      placeholderTextColor="#9ca3af"
                      value={newIngUnit}
                      onChangeText={setNewIngUnit}
                    />
                    <View className="flex-row flex-wrap gap-2 mt-0.5">
                      {["each", "lbs", "oz", "kg", "case", "liter", "gallon"].map((u) => (
                        <TouchableOpacity
                          key={u}
                          onPress={() => setNewIngUnit(u)}
                          className={`px-3 py-1 rounded-full border ${newIngUnit === u ? "bg-gold border-gold" : "bg-gray-50 border-gray-200"}`}
                        >
                          <Text className={`text-xs font-semibold ${newIngUnit === u ? "text-white" : "text-mist"}`}>{u}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-sm font-semibold text-pearl">Unit Cost ($) *</Text>
                    <TextInput
                      className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-base text-pearl"
                      placeholder="0.00"
                      placeholderTextColor="#9ca3af"
                      keyboardType="decimal-pad"
                      value={newIngCost}
                      onChangeText={setNewIngCost}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={saveNewIngredient}
                    disabled={newIngCreating}
                    className={`rounded-2xl py-4 items-center flex-row justify-center gap-2 ${newIngCreating ? "bg-gray-200" : "bg-gold"}`}
                  >
                    {newIngCreating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={18} color="#fff" />
                        <Text className="text-white font-bold text-base">Create & Add to PO</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

            {/* ── SEARCH mode (default) ── */}
            {!pickedIngredient && addItemMode === "search" && (
              <>
                <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
                  <TouchableOpacity onPress={closeAddItemModal} className="h-8 w-8 items-center justify-center">
                    <Ionicons name="close" size={22} color={C.mist} />
                  </TouchableOpacity>
                  <Text className="flex-1 text-lg font-bold text-pearl">Add Ingredient</Text>
                </View>

                {/* Action buttons: Scan + AI Photo */}
                <View className="px-4 pt-3 pb-2 flex-row gap-2">
                  <TouchableOpacity
                    onPress={() => setAddItemMode("scan")}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-surfaceHi border border-rim rounded-xl py-2.5"
                  >
                    <Ionicons name="barcode-outline" size={18} color={C.mist} />
                    <Text className="text-sm font-semibold text-mist">Scan Barcode</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setAddItemMode("camera")}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-gold-muted border border-amber-200 rounded-xl py-2.5"
                  >
                    <Ionicons name="sparkles" size={16} color={C.goldDim} />
                    <Text className="text-sm font-semibold text-gold-dim">AI Photo</Text>
                  </TouchableOpacity>
                </View>

                {/* Search */}
                <View className="px-4 pb-2">
                  <View className="flex-row items-center bg-surfaceHi border border-rim rounded-xl px-3 gap-2">
                    <Ionicons name="search-outline" size={15} color={C.smoke} />
                    <TextInput
                      className="flex-1 py-2.5 text-sm text-pearl"
                      placeholder="Search ingredients…"
                      placeholderTextColor="#9ca3af"
                      value={ingredientSearch}
                      onChangeText={setIngredientSearch}
                    />
                    {ingredientSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setIngredientSearch("")}>
                        <Ionicons name="close-circle" size={15} color={C.smoke} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <ScrollView contentContainerClassName="px-4 pb-4 gap-1">
                  {filteredIngredients.map((ing) => (
                    <TouchableOpacity
                      key={ing.id}
                      onPress={() => pickIngredient(ing)}
                      className="px-4 py-3 rounded-xl bg-gray-50 flex-row items-center justify-between active:bg-gold-muted"
                    >
                      <Text className="font-medium text-pearl">{ing.name}</Text>
                      <View className="flex-row items-center gap-2">
                        {ing.costPerUnit && (
                          <Text className="text-xs text-smoke">${Number(ing.costPerUnit).toFixed(2)}</Text>
                        )}
                        <Text className="text-sm text-smoke bg-white px-2 py-0.5 rounded-full border border-gray-200">{ing.unit}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {filteredIngredients.length === 0 && ingredientSearch.length > 0 && (
                    <View className="items-center py-6 gap-3">
                      <Text className="text-smoke text-sm">No ingredients matched "{ingredientSearch}"</Text>
                      <TouchableOpacity
                        onPress={() => { setNewIngName(ingredientSearch); setAddItemMode("create"); }}
                        className="flex-row items-center gap-2 bg-gold px-4 py-2.5 rounded-xl"
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Create "{ingredientSearch}"</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {filteredIngredients.length === 0 && ingredientSearch.length === 0 && ingredients.length === 0 && (
                    <View className="items-center py-6 gap-3">
                      <Text className="text-smoke text-sm text-center">No ingredients in the system yet.</Text>
                      <TouchableOpacity
                        onPress={() => setAddItemMode("create")}
                        className="flex-row items-center gap-2 bg-gold px-4 py-2.5 rounded-xl"
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#fff" />
                        <Text className="text-white font-semibold text-sm">Create New Ingredient</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => { setNewIngName(ingredientSearch); setAddItemMode("create"); }}
                    className="flex-row items-center gap-2 px-4 py-3 mt-1 rounded-xl border border-dashed border-gray-200 active:bg-gray-50"
                  >
                    <Ionicons name="add-circle-outline" size={16} color={C.gold} />
                    <Text className="text-gold font-semibold text-sm">Add a new ingredient manually</Text>
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}

          </SafeAreaView>
        </Modal>

        {/* ── Invoice camera modal ── */}
        <Modal visible={invoiceCameraOpen} animationType="slide" onRequestClose={() => setInvoiceCameraOpen(false)}>
          <PhotoCapture
            onCapture={(dataUrl) => { setInvoicePhoto(dataUrl); setInvoiceCameraOpen(false); }}
            onClose={() => setInvoiceCameraOpen(false)}
            hint="Point at the invoice document and tap to capture"
          />
        </Modal>

        {/* ── Header ── */}
        <View className="bg-white px-5 pt-3 pb-4 border-b border-rim flex-row items-center gap-2">
          <TouchableOpacity onPress={() => setView("list")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} className="flex-row items-center -ml-1">
            <Ionicons name="chevron-back" size={20} color={C.gold} />
            <Text className="text-gold font-semibold">POs</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-xl font-bold text-pearl ml-2">New Purchase Order</Text>
        </View>

        <ScrollView contentContainerClassName="p-4 gap-5" keyboardShouldPersistTaps="handled">

          {/* Supplier */}
          <View>
            <Text className="text-xs font-semibold text-mist uppercase tracking-widest mb-2">Supplier *</Text>
            <TouchableOpacity
              onPress={() => setSupplierModal(true)}
              className="bg-surface border border-rim rounded-2xl px-4 py-3.5 flex-row items-center justify-between"
            >
              <Text className={createSupplier ? "text-pearl font-semibold text-base" : "text-smoke text-base"}>
                {createSupplier ? createSupplier.name : "Select supplier…"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={C.smoke} />
            </TouchableOpacity>
          </View>

          {/* Line items */}
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-semibold text-mist uppercase tracking-widest">
                Items {draftItems.length > 0 ? `(${draftItems.length})` : ""}
              </Text>
              {draftItems.length > 0 && (
                <TouchableOpacity
                  onPress={() => openAddItemModal("search")}
                  className="flex-row items-center gap-1"
                >
                  <Ionicons name="add-circle" size={18} color={C.gold} />
                  <Text className="text-gold font-semibold text-sm">Add More</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Primary scan/AI CTAs — always visible */}
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => openAddItemModal("scan")}
                className="flex-1 flex-row items-center justify-center gap-2 bg-gray-900 rounded-2xl py-4"
              >
                <Ionicons name="barcode-outline" size={20} color="#fff" />
                <Text className="text-white font-bold text-sm">Scan Barcode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openAddItemModal("camera")}
                className="flex-1 flex-row items-center justify-center gap-2 bg-gold rounded-2xl py-4"
              >
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text className="text-white font-bold text-sm">AI Photo</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => openAddItemModal("search")}
              className="flex-row items-center justify-center gap-1.5"
            >
              <Ionicons name="search-outline" size={13} color={C.smoke} />
              <Text className="text-smoke text-sm">or search manually</Text>
            </TouchableOpacity>

            {draftItems.length > 0 && (
              <View className="bg-surface rounded-2xl border border-rim overflow-hidden">
                {draftItems.map((d, i) => (
                  <View
                    key={d.ingredientId}
                    className={`px-4 py-3.5 flex-row items-center gap-3 ${i < draftItems.length - 1 ? "border-b border-rim" : ""}`}
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-pearl">{d.name}</Text>
                      <Text className="text-xs text-smoke mt-0.5">
                        {d.quantity} {d.unit} · ${d.unitCost.toFixed(2)}/{d.unit}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-gold-dim">${(d.quantity * d.unitCost).toFixed(2)}</Text>
                    <TouchableOpacity
                      onPress={() => setDraftItems((prev) => prev.filter((_, idx) => idx !== i))}
                      className="h-7 w-7 rounded-full bg-coral/5 items-center justify-center"
                    >
                      <Ionicons name="close" size={14} color={C.coral} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Invoice # — required */}
          <View className="gap-1.5">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Invoice #</Text>
              <Text className="text-xs font-bold text-coral">*</Text>
            </View>
            <TextInput
              className={`bg-white border rounded-2xl px-4 py-3 text-sm text-pearl ${!createInvoiceNum.trim() ? "border-red-200" : "border-gray-200"}`}
              placeholder="e.g. INV-2024-001"
              placeholderTextColor="#9ca3af"
              value={createInvoiceNum}
              onChangeText={setCreateInvoiceNum}
            />
          </View>

          {/* Auto date/time + user stamp */}
          <View className="bg-surfaceHi border border-rim rounded-2xl px-4 py-3 gap-1.5">
            <Text className="text-xs font-semibold text-smoke uppercase tracking-widest">Created By</Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="h-7 w-7 rounded-full bg-gold items-center justify-center">
                  <Text className="text-white text-xs font-bold">{(user?.name ?? "?")[0].toUpperCase()}</Text>
                </View>
                <Text className="text-sm font-semibold text-pearl">{user?.name ?? "Unknown"}</Text>
              </View>
              <Text className="text-xs text-smoke">
                {createTimestamp.toLocaleDateString()} {createTimestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
          </View>

          {/* Attach invoice photo */}
          <View className="gap-2">
            <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Invoice Photo</Text>
            {invoicePhoto ? (
              <View className="rounded-2xl overflow-hidden border border-gray-200">
                <Image source={{ uri: invoicePhoto }} className="w-full h-48" resizeMode="cover" />
                <TouchableOpacity
                  onPress={extractInvoiceLines}
                  disabled={extracting}
                  className="flex-row items-center justify-center gap-2 py-3.5 border-t border-gray-200"
                  style={{ backgroundColor: C.pearl, opacity: extracting ? 0.6 : 1 }}
                >
                  <Ionicons name="sparkles" size={16} color={C.gold} />
                  <Text className="text-sm font-bold text-white">{extracting ? "Reading invoice…" : "Extract line items with Vera"}</Text>
                </TouchableOpacity>
                <View className="flex-row">
                  <TouchableOpacity
                    onPress={() => setInvoiceCameraOpen(true)}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-gray-50 py-3 border-t border-gray-200"
                  >
                    <Ionicons name="camera-outline" size={16} color={C.mist} />
                    <Text className="text-sm font-semibold text-mist">Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setInvoicePhoto(null)}
                    className="flex-1 flex-row items-center justify-center gap-2 bg-coral/5 py-3 border-t border-l border-gray-200"
                  >
                    <Ionicons name="trash-outline" size={16} color={C.coral} />
                    <Text className="text-sm font-semibold text-coral">Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setInvoiceCameraOpen(true)}
                className="bg-surfaceHi border border-dashed border-gray-300 rounded-2xl py-8 items-center gap-2"
              >
                <View className="h-12 w-12 rounded-2xl bg-surface border border-rim items-center justify-center">
                  <Ionicons name="camera-outline" size={22} color={C.smoke} />
                </View>
                <Text className="text-sm font-semibold text-mist">Scan Invoice Document</Text>
                <Text className="text-xs text-smoke">Attach a photo of the physical invoice</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Notes */}
          <View className="gap-1.5">
            <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Notes (optional)</Text>
            <TextInput
              className="bg-surface border border-rim rounded-2xl px-4 py-3 text-sm text-pearl"
              placeholder="Delivery instructions, etc."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={2}
              value={createNotes}
              onChangeText={setCreateNotes}
            />
          </View>

          {/* Total summary */}
          {draftItems.length > 0 && (
            <View className="bg-gold-muted rounded-2xl px-4 py-3.5 border border-gold-dim flex-row justify-between items-center">
              <View>
                <Text className="text-xs text-gold font-medium">{draftItems.length} line items</Text>
                <Text className="text-gold-dim font-semibold mt-0.5">Order Total</Text>
              </View>
              <Text className="text-amber-900 font-bold text-2xl">${draftTotal.toFixed(2)}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            onPress={submitCreatePO}
            disabled={submitting || !createSupplier || !createInvoiceNum.trim() || draftItems.length === 0}
            className={`rounded-2xl py-4 items-center flex-row justify-center gap-2
              ${(submitting || !createSupplier || !createInvoiceNum.trim() || draftItems.length === 0) ? "bg-gray-200" : "bg-gold"}`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={(!createSupplier || !createInvoiceNum.trim() || draftItems.length === 0) ? "#9ca3af" : "white"}
                />
                <Text className={`font-bold text-base ${(!createSupplier || !createInvoiceNum.trim() || draftItems.length === 0) ? "text-smoke" : "text-white"}`}>
                  Create Purchase Order
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DETAIL / RECEIVE SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  if (view === "detail" && selected) {
    const totalReceived = Object.values(receivedQtys).reduce((s, v) => s + v, 0);
    const sc = STATUS_COLORS[selected.status] ?? { bg: "bg-gray-100", text: "text-mist" };

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
        {receiveScanner && (
          <Modal animationType="slide" onRequestClose={() => setReceiveScanner(false)}>
            <Scanner
              onScan={handleReceiveScan}
              onClose={() => setReceiveScanner(false)}
              hint="Scan each item's barcode as you receive it"
            />
          </Modal>
        )}

        {/* Correction modal */}
        <Modal visible={correctModal} animationType="slide" onRequestClose={() => setCorrectModal(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
            <View className="px-5 pt-4 pb-3 border-b border-rim flex-row items-center gap-3">
              <TouchableOpacity onPress={() => setCorrectModal(false)} className="h-8 w-8 items-center justify-center">
                <Ionicons name="close" size={22} color={C.mist} />
              </TouchableOpacity>
              <Text className="flex-1 text-lg font-bold text-pearl">Correct Invoice</Text>
              <TouchableOpacity
                onPress={saveCorrection}
                disabled={correcting}
                className={`px-4 py-1.5 rounded-xl ${correcting ? "bg-gray-200" : "bg-gold"}`}
              >
                {correcting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text className="text-white font-bold text-sm">Save</Text>}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
              {selected.status === "RECEIVED" && (
                <View className="bg-gold-muted border border-amber-200 rounded-xl px-4 py-3 flex-row items-start gap-2">
                  <Ionicons name="information-circle-outline" size={16} color={C.goldDim} style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-xs text-gold-dim">This PO has been received. Correcting quantities will adjust inventory accordingly.</Text>
                </View>
              )}
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Invoice #</Text>
                <TextInput
                  className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-sm text-pearl"
                  value={correctInvoiceNum}
                  onChangeText={setCorrectInvoiceNum}
                  placeholder="Invoice number"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Notes</Text>
                <TextInput
                  className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 text-sm text-pearl"
                  value={correctNotes}
                  onChangeText={setCorrectNotes}
                  placeholder="Optional notes"
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={2}
                />
              </View>
              <View className="gap-2">
                <Text className="text-xs font-semibold text-mist uppercase tracking-widest">Line Items</Text>
                {correctItems.map((item, idx) => (
                  <View key={item.ingredientId} className="bg-surfaceHi border border-rim rounded-xl px-4 py-3 gap-2">
                    <Text className="text-sm font-semibold text-pearl">{item.name}</Text>
                    <View className="flex-row gap-3">
                      <View className="flex-1 gap-1">
                        <Text className="text-[10px] text-smoke uppercase tracking-wide">Qty ({item.unit})</Text>
                        <TextInput
                          className="bg-surface border border-rim rounded-lg px-3 py-2 text-sm text-pearl"
                          value={item.quantity}
                          onChangeText={(v) => setCorrectItems((prev) => prev.map((x, i) => i === idx ? { ...x, quantity: v } : x))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                      <View className="flex-1 gap-1">
                        <Text className="text-[10px] text-smoke uppercase tracking-wide">Unit Cost ($)</Text>
                        <TextInput
                          className="bg-surface border border-rim rounded-lg px-3 py-2 text-sm text-pearl"
                          value={item.unitCost}
                          onChangeText={(v) => setCorrectItems((prev) => prev.map((x, i) => i === idx ? { ...x, unitCost: v } : x))}
                          keyboardType="decimal-pad"
                          placeholder="0.00"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <View className="bg-white px-5 pt-3 pb-4 border-b border-rim">
          <TouchableOpacity onPress={() => { setView("list"); setSelected(null); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} className="flex-row items-center -ml-1 mb-2">
            <Ionicons name="chevron-back" size={18} color={C.gold} />
            <Text className="text-gold font-semibold">Purchase Orders</Text>
          </TouchableOpacity>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-xl font-bold text-pearl">{selected.vendor.name}</Text>
              <View className="flex-row items-center gap-2 mt-1">
                <Text className="text-sm text-smoke">
                  {selected.invoiceNumber ? `#${selected.invoiceNumber}` : `PO-${selected.id.slice(-8).toUpperCase()}`}
                </Text>
                <View className={`px-2 py-0.5 rounded-full ${sc.bg}`}>
                  <Text className={`text-xs font-semibold ${sc.text}`}>{selected.status}</Text>
                </View>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={() => setReceiveScanner(true)}
                className="bg-gold px-4 py-2 rounded-xl flex-row items-center gap-1.5"
              >
                <Ionicons name="barcode-outline" size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">Scan</Text>
              </TouchableOpacity>
              {canManage && (
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    "Manage Invoice",
                    selected.invoiceNumber ?? selected.id.slice(-8).toUpperCase(),
                    [
                      { text: "Correct Invoice", onPress: openCorrectModal },
                      { text: "Delete Invoice", style: "destructive", onPress: handleDelete },
                      { text: "Cancel", style: "cancel" },
                    ]
                  )}
                  className="h-9 w-9 rounded-xl bg-surfaceHi items-center justify-center"
                >
                  {deleting
                    ? <ActivityIndicator size="small" color={C.mist} />
                    : <Ionicons name="ellipsis-horizontal" size={18} color={C.mist} />}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        <ScrollView contentContainerClassName="p-4 gap-4">
          <View className="bg-surface rounded-2xl border border-rim overflow-hidden">
            {selected.items.map((item, i) => (
              <View
                key={item.id}
                className={`px-4 py-3.5 ${i < selected.items.length - 1 ? "border-b border-rim" : ""}`}
              >
                <View className="flex-row justify-between items-start mb-2.5">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-pearl">{item.ingredient.name}</Text>
                    <Text className="text-xs text-smoke mt-0.5">
                      Ordered: {item.quantity} {item.ingredient.unit} · ${Number(item.unitCost).toFixed(2)}/{item.ingredient.unit}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-pearl">
                    ${(Number(item.unitCost) * item.quantity).toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs text-smoke w-16">Received:</Text>
                  <TouchableOpacity
                    onPress={() => setReceivedQtys((p) => ({ ...p, [item.id]: Math.max(0, (p[item.id] ?? 0) - 1) }))}
                    className="h-8 w-8 rounded-full bg-surfaceHi items-center justify-center"
                  >
                    <Ionicons name="remove" size={16} color={C.mist} />
                  </TouchableOpacity>
                  <Text className="text-lg font-bold text-pearl w-8 text-center">
                    {receivedQtys[item.id] ?? 0}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setReceivedQtys((p) => ({ ...p, [item.id]: (p[item.id] ?? 0) + 1 }))}
                    className="h-8 w-8 rounded-full bg-gold-muted items-center justify-center"
                  >
                    <Ionicons name="add" size={16} color={C.goldDim} />
                  </TouchableOpacity>
                  <Text className="text-xs text-smoke ml-1">/ {item.quantity}</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="bg-gold-muted rounded-2xl p-4 border border-gold-dim flex-row items-center gap-3">
            <View className="h-10 w-10 rounded-full bg-gold-muted items-center justify-center">
              <Ionicons name="cube-outline" size={18} color={C.goldDim} />
            </View>
            <View>
              <Text className="text-sm font-semibold text-amber-800">Receive Summary</Text>
              <Text className="text-gold-dim text-sm mt-0.5">
                {totalReceived} units received across {selected.items.length} line items
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={generateInvoice}
            disabled={generating || totalReceived === 0}
            className={`rounded-2xl py-4 items-center flex-row justify-center gap-2
              ${totalReceived === 0 || generating ? "bg-gray-200" : "bg-gold"}`}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={totalReceived === 0 ? "#9ca3af" : "white"}
                />
                <Text className={`font-bold text-base ${totalReceived === 0 ? "text-smoke" : "text-white"}`}>
                  Generate & Share Invoice
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // LIST SCREEN
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {listScanner && (
        <Modal animationType="slide" onRequestClose={() => setListScanner(false)}>
          <Scanner
            onScan={handleListScan}
            onClose={() => setListScanner(false)}
            hint="Scan an item barcode to find its purchase order"
          />
        </Modal>
      )}

      <View className="bg-white px-5 pt-3 pb-4 border-b border-rim">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={20} color={C.gold} />
            </TouchableOpacity>
            <View>
              <Text className="text-xl font-bold text-pearl">Purchase Orders</Text>
              <Text className="text-sm text-smoke">
                {pos.length === 0 ? "No orders yet" : `${pos.length} order${pos.length !== 1 ? "s" : ""}`}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setListScanner(true)}
              className="h-9 w-9 rounded-xl bg-surfaceHi items-center justify-center"
            >
              <Ionicons name="barcode-outline" size={20} color={C.mist} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setView("create")}
              className="h-9 w-9 rounded-xl bg-gold items-center justify-center"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerClassName="p-4 gap-3"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
      >
        {pos.length === 0 && (
          <View className="items-center py-14 gap-4">
            <View className="h-20 w-20 rounded-3xl bg-surfaceHi items-center justify-center">
              <Ionicons name="document-text-outline" size={38} color={C.smoke} />
            </View>
            <View className="items-center gap-1">
              <Text className="text-pearl font-semibold text-base">No purchase orders yet</Text>
              <Text className="text-smoke text-sm text-center px-8">
                Create a PO to track supplier orders and streamline receiving
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setView("create")}
              className="bg-gold px-6 py-3 rounded-2xl flex-row items-center gap-2 mt-1"
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text className="text-white font-bold text-base">Create Purchase Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {pos.map((po) => {
          const sc = STATUS_COLORS[po.status] ?? { bg: "bg-gray-100", text: "text-mist" };
          return (
            <TouchableOpacity
              key={po.id}
              onPress={() => openPO(po)}
              className="bg-surface rounded-2xl border border-rim p-4 gap-2 active:bg-gray-50"
            >
              <View className="flex-row justify-between items-start">
                <Text className="text-base font-bold text-pearl flex-1 mr-2" numberOfLines={1}>
                  {po.vendor.name}
                </Text>
                <View className={`px-2.5 py-1 rounded-full ${sc.bg}`}>
                  <Text className={`text-xs font-semibold ${sc.text}`}>{po.status}</Text>
                </View>
              </View>
              <Text className="text-sm text-mist">
                {po.invoiceNumber ? `Invoice #${po.invoiceNumber}` : `PO-${po.id.slice(-8).toUpperCase()}`}
              </Text>
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="cube-outline" size={13} color={C.smoke} />
                  <Text className="text-xs text-smoke">{po.items?.length ?? 0} line items</Text>
                </View>
                <Text className="text-sm font-bold text-gold-dim">${Number(po.totalAmount).toFixed(2)}</Text>
              </View>
              {po.orderedAt && (
                <Text className="text-xs text-smoke">
                  Ordered {new Date(po.orderedAt).toLocaleDateString()}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
