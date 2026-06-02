/**
 * IngredientImport
 *
 * A bottom-sheet style modal for adding NEW ingredients to the library via:
 *   A) Camera photo  → GPT-4o vision extracts a list of ingredients
 *   B) Barcode scan  → Open Food Facts lookup → confirm & save
 *
 * This is intentionally separate from:
 *   - Scanner (used in inventory for stock counting existing items)
 *   - PhotoCapture (used in purchasing for PO receiving / item matching)
 */

import React, { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C, T, shadow } from "@/lib/theme";
import { PhotoCapture } from "./PhotoCapture";
import { Scanner } from "./Scanner";
import {
  importIngredientsFromPhoto,
  barcodeLookupIngredient,
  createIngredient,
  suggestRecipeAdditions,
  ExtractedIngredient,
  RecipeSuggestion,
} from "@/lib/api";

type IoniconName = keyof typeof Ionicons.glyphMap;

const COMMON_UNITS = ["kg", "g", "L", "mL", "oz", "lb", "unit", "dozen", "case", "bag", "box", "bottle", "can", "bunch", "each"];

interface ImportRow extends ExtractedIngredient {
  selected: boolean;
  costPerUnit: string;
  minThreshold: string;
}

type Mode = "choose" | "photo-capture" | "photo-review" | "barcode-scan" | "barcode-review" | "suggestions";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (count: number) => void; // called after successful save
}

export function IngredientImport({ visible, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>("choose");

  // Photo flow
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importSaving, setImportSaving] = useState(false);

  // Barcode flow
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeAiFallback, setBarcodeAiFallback] = useState(false);
  const [barcodeScanned, setBarcodeScanned] = useState("");
  const [barcodeForm, setBarcodeForm] = useState({
    name: "", unit: "unit", costPerUnit: "", minThreshold: "",
  });
  const [barcodeSaving, setBarcodeSaving] = useState(false);

  // Recipe suggestions
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);

  function reset() {
    setMode("choose");
    setPhotoLoading(false); setPhotoError(null); setImportRows([]);
    setBarcodeLoading(false); setBarcodeError(null); setBarcodeScanned(""); setBarcodeAiFallback(false);
    setBarcodeForm({ name: "", unit: "unit", costPerUnit: "", minThreshold: "" });
    setSuggestions([]);
  }

  function handleClose() { reset(); onClose(); }

  // ── Photo flow ────────────────────────────────────────────────────────────

  async function handlePhotoCapture(dataUrl: string) {
    setMode("photo-review");
    setPhotoLoading(true);
    setPhotoError(null);
    setImportRows([]);
    try {
      const result = await importIngredientsFromPhoto(dataUrl);
      const rows: ImportRow[] = result.ingredients.map(i => ({
        ...i,
        selected: i.confidence !== "low",
        costPerUnit: "",
        minThreshold: "",
      }));
      setImportRows(rows);
    } catch (e) {
      setPhotoError((e as Error).message ?? "Extraction failed");
    } finally {
      setPhotoLoading(false);
    }
  }

  async function savePhotoRows() {
    const toSave = importRows.filter(r => r.selected && r.name.trim());
    if (!toSave.length) return;
    setImportSaving(true);
    const savedIds: string[] = [];
    for (const row of toSave) {
      try {
        const created = await createIngredient({
          name: row.name.trim(),
          unit: row.suggestedUnit,
          costPerUnit: parseFloat(row.costPerUnit) || 0,
          minThreshold: parseFloat(row.minThreshold) || 0,
        });
        savedIds.push(created.id);
      } catch { /* skip failed rows */ }
    }
    setImportSaving(false);
    onSaved(savedIds.length);
    if (savedIds.length) fetchSuggestions(savedIds);
    else handleClose();
  }

  // ── Barcode flow ──────────────────────────────────────────────────────────

  async function handleBarcodeScan(barcode: string) {
    setMode("barcode-review");
    setBarcodeScanned(barcode);
    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeAiFallback(false);
    try {
      const result = await barcodeLookupIngredient(barcode);
      if (result.local) {
        setBarcodeError(`"${result.local.name}" is already in your ingredient library.`);
      } else if (result.external) {
        setBarcodeForm(f => ({ ...f, name: result.external!.name }));
      } else {
        // Valid barcode that no UPC database knew → offer AI photo identification.
        setBarcodeError(result.valid === false ? "That doesn't look like a valid barcode." : "Not in any product database — identify it with a photo.");
        if (result.aiFallback) setBarcodeAiFallback(true);
      }
    } catch (e) {
      setBarcodeError((e as Error).message ?? "Lookup failed");
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function saveBarcodeIngredient() {
    if (!barcodeForm.name.trim() || !barcodeForm.costPerUnit) return;
    setBarcodeSaving(true);
    try {
      const created = await createIngredient({
        name: barcodeForm.name.trim(),
        unit: barcodeForm.unit,
        costPerUnit: parseFloat(barcodeForm.costPerUnit),
        minThreshold: parseFloat(barcodeForm.minThreshold) || 0,
        barcode: barcodeScanned || undefined,
      });
      onSaved(1);
      fetchSuggestions([created.id]);
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Failed to save ingredient");
      setBarcodeSaving(false);
    }
  }

  // ── Recipe suggestions ────────────────────────────────────────────────────

  const fetchSuggestions = useCallback(async (ids: string[]) => {
    try {
      const result = await suggestRecipeAdditions(ids);
      if (result.suggestions?.length) {
        setSuggestions(result.suggestions);
        setMode("suggestions");
      } else {
        handleClose();
      }
    } catch {
      handleClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = importRows.filter(r => r.selected).length;

  // ── Renders ───────────────────────────────────────────────────────────────

  if (!visible) return null;

  // Camera views need their own full-screen Modal — otherwise the bare
  // absolute-fill camera renders behind the inventory screen's header/empty
  // state (which sit later in the tree) and the content bleeds over the feed.
  if (mode === "photo-capture") {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setMode("choose")}>
        <PhotoCapture
          hint="Point at a delivery, invoice, or pantry shelf — AI will extract all ingredients"
          onCapture={handlePhotoCapture}
          onClose={() => setMode("choose")}
        />
      </Modal>
    );
  }

  if (mode === "barcode-scan") {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setMode("choose")}>
        <Scanner
          hint="Scan a product barcode to look up ingredient details"
          onScan={handleBarcodeScan}
          onClose={() => setMode("choose")}
        />
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: C.void }}>

          {/* Header */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
            backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.rim,
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {mode !== "choose" && mode !== "suggestions" && (
                <TouchableOpacity onPress={() => setMode("choose")} style={{ marginRight: 4 }}>
                  <Ionicons name="chevron-back" size={20} color={C.mist} />
                </TouchableOpacity>
              )}
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: T.gold, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="add-circle-outline" size={20} color={C.gold} />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>Import Ingredients</Text>
                <Text style={{ fontSize: 11, color: C.mist }}>
                  {mode === "choose" ? "Choose import method" :
                   mode === "photo-review" ? "Review extracted ingredients" :
                   mode === "barcode-review" ? "Confirm ingredient details" :
                   mode === "suggestions" ? "Recipe suggestions" : ""}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={C.mist} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">

            {/* ── Mode picker ─────────────────────────────────────────────── */}
            {mode === "choose" && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 13, color: C.mist, lineHeight: 19 }}>
                  Add new ingredients to your library. Separate from stock counting — these create new entries.
                </Text>
                {([
                  {
                    m: "photo-capture" as Mode,
                    icon: "camera-outline" as IoniconName,
                    title: "Photo / Invoice",
                    desc: "Point at a delivery, shelf, or invoice — AI extracts all ingredients at once",
                  },
                  {
                    m: "barcode-scan" as Mode,
                    icon: "barcode-outline" as IoniconName,
                    title: "Barcode Scan",
                    desc: "Scan a product barcode to look up name and details automatically",
                  },
                ] as const).map(({ m, icon, title, desc }) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 16,
                      backgroundColor: C.surface, borderRadius: 16,
                      borderWidth: 1, borderColor: C.rim,
                      padding: 18, ...shadow.sm,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: T.gold, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={icon} size={24} color={C.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{title}</Text>
                      <Text style={{ fontSize: 12, color: C.mist, marginTop: 3, lineHeight: 17 }}>{desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.smoke} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Photo review ─────────────────────────────────────────────── */}
            {mode === "photo-review" && (
              <View style={{ gap: 16 }}>
                {photoLoading && (
                  <View style={{ alignItems: "center", gap: 10, paddingVertical: 32 }}>
                    <ActivityIndicator size="large" color={C.gold} />
                    <Text style={{ fontSize: 13, color: C.mist }}>Extracting ingredients with AI…</Text>
                  </View>
                )}

                {photoError && (
                  <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#FFF5F5", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FECACA" }}>
                    <Ionicons name="alert-circle-outline" size={16} color={C.coral} />
                    <Text style={{ flex: 1, fontSize: 13, color: C.coral }}>{photoError}</Text>
                  </View>
                )}

                {!photoLoading && importRows.length === 0 && !photoError && (
                  <Text style={{ fontSize: 13, color: C.mist, textAlign: "center" }}>No ingredients could be identified. Try a clearer photo.</Text>
                )}

                {importRows.length > 0 && (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>
                        {importRows.length} ingredient{importRows.length !== 1 ? "s" : ""} found
                      </Text>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <TouchableOpacity onPress={() => setImportRows(r => r.map(x => ({ ...x, selected: true })))}>
                          <Text style={{ fontSize: 12, color: C.gold }}>All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setImportRows(r => r.map(x => ({ ...x, selected: false })))}>
                          <Text style={{ fontSize: 12, color: C.smoke }}>None</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {importRows.map((row, i) => (
                      <View key={i} style={{
                        backgroundColor: C.surface, borderRadius: 14,
                        borderWidth: 1, borderColor: row.selected ? C.rimBright : C.rim,
                        padding: 14, gap: 10, opacity: row.selected ? 1 : 0.45,
                        ...shadow.sm,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <TouchableOpacity
                            onPress={() => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, selected: !r.selected } : r))}
                            style={{
                              width: 22, height: 22, borderRadius: 6,
                              borderWidth: 2, borderColor: row.selected ? C.gold : C.rimBright,
                              backgroundColor: row.selected ? C.gold : "transparent",
                              alignItems: "center", justifyContent: "center",
                            }}
                          >
                            {row.selected && <Ionicons name="checkmark" size={13} color="white" />}
                          </TouchableOpacity>
                          <TextInput
                            value={row.name}
                            onChangeText={t => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, name: t } : r))}
                            style={{ flex: 1, fontSize: 15, fontWeight: "600", color: C.pearl }}
                          />
                          <View style={{
                            paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
                            backgroundColor: row.confidence === "high" ? "#D1FAE5" : row.confidence === "medium" ? "#FEF3C7" : "#F3F4F6",
                          }}>
                            <Text style={{
                              fontSize: 10, fontWeight: "700",
                              color: row.confidence === "high" ? "#065F46" : row.confidence === "medium" ? "#92400E" : C.smoke,
                            }}>{row.confidence}</Text>
                          </View>
                        </View>

                        {row.notes && <Text style={{ fontSize: 11, color: C.smoke, marginLeft: 32 }}>{row.notes}</Text>}

                        <View style={{ flexDirection: "row", gap: 10, marginLeft: 32 }}>
                          {/* Unit picker */}
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, color: C.smoke, marginBottom: 4 }}>Unit</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                              {COMMON_UNITS.map(u => (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, suggestedUnit: u } : r))}
                                  style={{
                                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                                    backgroundColor: row.suggestedUnit === u ? C.gold : C.surfaceHi,
                                    borderWidth: 1, borderColor: row.suggestedUnit === u ? C.gold : C.rim,
                                  }}
                                >
                                  <Text style={{ fontSize: 11, fontWeight: "600", color: row.suggestedUnit === u ? "white" : C.mist }}>{u}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", gap: 10, marginLeft: 32 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, color: C.smoke, marginBottom: 4 }}>Cost / {row.suggestedUnit}</Text>
                            <TextInput
                              value={row.costPerUnit}
                              onChangeText={t => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, costPerUnit: t } : r))}
                              keyboardType="decimal-pad"
                              placeholder="0.00"
                              placeholderTextColor={C.smoke}
                              style={{
                                borderWidth: 1, borderColor: C.rim, borderRadius: 8,
                                paddingHorizontal: 10, paddingVertical: 7,
                                fontSize: 13, color: C.pearl, backgroundColor: C.surfaceHi,
                              }}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, color: C.smoke, marginBottom: 4 }}>Min level</Text>
                            <TextInput
                              value={row.minThreshold}
                              onChangeText={t => setImportRows(prev => prev.map((r, j) => j === i ? { ...r, minThreshold: t } : r))}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={C.smoke}
                              style={{
                                borderWidth: 1, borderColor: C.rim, borderRadius: 8,
                                paddingHorizontal: 10, paddingVertical: 7,
                                fontSize: 13, color: C.pearl, backgroundColor: C.surfaceHi,
                              }}
                            />
                          </View>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={savePhotoRows}
                      disabled={importSaving || selectedCount === 0}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                        backgroundColor: selectedCount === 0 ? C.smoke : C.gold,
                        borderRadius: 14, paddingVertical: 14,
                        opacity: importSaving ? 0.6 : 1,
                      }}
                    >
                      {importSaving
                        ? <ActivityIndicator size="small" color="white" />
                        : <Ionicons name="checkmark-circle-outline" size={18} color="white" />}
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "white" }}>
                        {importSaving ? "Saving…" : `Add ${selectedCount} Ingredient${selectedCount !== 1 ? "s" : ""}`}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {/* ── Barcode review ───────────────────────────────────────────── */}
            {mode === "barcode-review" && (
              <View style={{ gap: 16 }}>
                {barcodeLoading && (
                  <View style={{ alignItems: "center", gap: 10, paddingVertical: 32 }}>
                    <ActivityIndicator size="large" color={C.gold} />
                    <Text style={{ fontSize: 13, color: C.mist }}>Looking up {barcodeScanned}…</Text>
                  </View>
                )}

                {barcodeError && (
                  <View style={{ flexDirection: "row", gap: 8, backgroundColor: "#FFFBEB", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FDE68A" }}>
                    <Ionicons name="information-circle-outline" size={16} color={C.ember} />
                    <Text style={{ flex: 1, fontSize: 13, color: C.ember }}>{barcodeError}</Text>
                  </View>
                )}

                {barcodeAiFallback && (
                  <TouchableOpacity
                    onPress={() => { setBarcodeAiFallback(false); setMode("photo-capture"); }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.pearl, borderRadius: 12, paddingVertical: 13 }}
                  >
                    <Ionicons name="sparkles" size={16} color={C.gold} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>Identify with a photo</Text>
                  </TouchableOpacity>
                )}

                {!barcodeLoading && (
                  <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 14, ...shadow.sm }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>
                      Confirm & Add
                    </Text>

                    {[
                      { label: "Name *", key: "name" as const, placeholder: "Ingredient name", multiline: false },
                      { label: "Cost / Unit *", key: "costPerUnit" as const, placeholder: "0.00", multiline: false, keyboard: true },
                      { label: "Min Level", key: "minThreshold" as const, placeholder: "0", multiline: false, keyboard: true },
                    ].map(({ label, key, placeholder, keyboard }) => (
                      <View key={key}>
                        <Text style={{ fontSize: 12, color: C.mist, marginBottom: 6 }}>{label}</Text>
                        <TextInput
                          value={barcodeForm[key]}
                          onChangeText={t => setBarcodeForm(f => ({ ...f, [key]: t }))}
                          placeholder={placeholder}
                          placeholderTextColor={C.smoke}
                          keyboardType={keyboard ? "decimal-pad" : "default"}
                          style={{
                            borderWidth: 1, borderColor: C.rim, borderRadius: 10,
                            paddingHorizontal: 12, paddingVertical: 10,
                            fontSize: 14, color: C.pearl, backgroundColor: C.surfaceHi,
                          }}
                        />
                      </View>
                    ))}

                    {/* Unit selector */}
                    <View>
                      <Text style={{ fontSize: 12, color: C.mist, marginBottom: 6 }}>Unit</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                        {COMMON_UNITS.map(u => (
                          <TouchableOpacity
                            key={u}
                            onPress={() => setBarcodeForm(f => ({ ...f, unit: u }))}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                              backgroundColor: barcodeForm.unit === u ? C.gold : C.surfaceHi,
                              borderWidth: 1, borderColor: barcodeForm.unit === u ? C.gold : C.rim,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: "600", color: barcodeForm.unit === u ? "white" : C.mist }}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    <TouchableOpacity
                      onPress={saveBarcodeIngredient}
                      disabled={barcodeSaving || !barcodeForm.name.trim() || !barcodeForm.costPerUnit}
                      style={{
                        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                        backgroundColor: C.gold, borderRadius: 12, paddingVertical: 13,
                        opacity: barcodeSaving || !barcodeForm.name.trim() || !barcodeForm.costPerUnit ? 0.5 : 1,
                      }}
                    >
                      {barcodeSaving
                        ? <ActivityIndicator size="small" color="white" />
                        : <Ionicons name="add-circle-outline" size={18} color="white" />}
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "white" }}>
                        {barcodeSaving ? "Saving…" : "Add to Library"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Recipe suggestions ───────────────────────────────────────── */}
            {mode === "suggestions" && (
              <View style={{ gap: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: T.gold, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="sparkles-outline" size={18} color={C.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>Recipe Suggestions</Text>
                    <Text style={{ fontSize: 12, color: C.mist }}>New ingredients that may belong in existing recipes</Text>
                  </View>
                </View>

                {suggestions.map(s => (
                  <View key={s.ingredientId} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
                    <View style={{ backgroundColor: T.gold, paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{s.ingredientName}</Text>
                    </View>
                    {s.menuItems.map((item, j) => (
                      <View key={item.id} style={{
                        flexDirection: "row", alignItems: "flex-start", gap: 10,
                        paddingHorizontal: 14, paddingVertical: 10,
                        borderTopWidth: j > 0 ? 1 : 0, borderColor: C.rim,
                      }}>
                        <Ionicons name="chevron-forward" size={14} color={C.smoke} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{item.name}
                            <Text style={{ fontWeight: "400", color: C.mist }}> · {item.category}</Text>
                          </Text>
                          {item.reason && <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>{item.reason}</Text>}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}

                <Text style={{ fontSize: 12, color: C.smoke, textAlign: "center" }}>
                  Open Recipe Costing on the web to review and apply these suggestions.
                </Text>

                <TouchableOpacity
                  onPress={handleClose}
                  style={{
                    backgroundColor: C.gold, borderRadius: 14, paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "white" }}>Done</Text>
                </TouchableOpacity>
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
