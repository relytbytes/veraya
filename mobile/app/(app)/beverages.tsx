import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput, RefreshControl, ActivityIndicator, Animated, Alert,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getBeverageProfiles, createBeverageProfile, patchBeverageProfile, deleteBeverageProfile,
  createIngredient, scanBeverageLabel, assignBeverageBins,
  type BeverageProfile,
} from "@/lib/api";
import { C, T } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { PhotoCapture } from "@/components/PhotoCapture";

const CATS = ["WINE", "LIQUOR", "BEER", "NA_BEVERAGE"] as const;
const CAT_LABEL: Record<string, string> = { WINE: "Wine", LIQUOR: "Liquor", BEER: "Beer", NA_BEVERAGE: "Non-Alc" };
const BOTTLE_PRESETS = [375, 750, 1000, 1750];
const POUR_PRESETS = [30, 44, 59, 148];

function SizeChips({ presets, value, onPick, suffix = "ml" }: { presets: number[]; value: number; onPick: (n: number) => void; suffix?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {presets.map((p) => {
        const sel = value === p;
        return (
          <TouchableOpacity key={p} onPress={() => onPick(p)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, backgroundColor: sel ? `${C.gold}1A` : C.surfaceHi, borderColor: sel ? C.gold : C.rim }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: sel ? C.gold : C.mist }}>{p}{suffix}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BevSheet({ edit, onClose, onSaved }: { edit: BeverageProfile | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(edit?.ingredient.name ?? "");
  const [category, setCategory] = useState(edit?.category ?? "WINE");
  const [producer, setProducer] = useState(edit?.producer ?? "");
  const [vintage, setVintage] = useState(edit?.vintage ?? "");
  const [abv, setAbv] = useState(edit?.abv != null ? String(edit.abv) : "");
  const [bottle, setBottle] = useState(edit?.bottleSizeMl ?? 750);
  const [pour, setPour] = useState(edit?.pourSizeMl ?? 44);
  const [bin, setBin] = useState(edit?.binNumber ?? "");
  const [cost, setCost] = useState("");
  const [glass, setGlass] = useState(edit?.offerGlass ?? false);
  const [bottleSvc, setBottleSvc] = useState(edit?.offerBottle ?? true);
  const [saving, setSaving] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");

  async function onScan(dataUrl: string) {
    setScanOpen(false); setScanning(true); setScanNote("");
    try {
      const d = await scanBeverageLabel(dataUrl);
      if (d.name && !name.trim()) setName(d.name);
      if (CATS.includes(d.category as typeof CATS[number])) setCategory(d.category);
      if (d.producer) setProducer(d.producer);
      if (d.vintage) setVintage(d.vintage);
      if (d.abv != null) setAbv(String(d.abv));
      if (d.bottleSizeMl) setBottle(d.bottleSizeMl);
      if (d.pourSizeMl) setPour(d.pourSizeMl);
      setScanNote("Filled from label — review and save.");
    } catch {
      Alert.alert("Scan failed", "Could not read that label. Enter details manually.");
    } finally { setScanning(false); }
  }

  async function save() {
    if (!edit && !name.trim()) { Alert.alert("Required", "Name is required."); return; }
    if (!glass && !bottleSvc) { Alert.alert("Required", "Pick a service option (glass and/or bottle)."); return; }
    setSaving(true);
    try {
      const body = {
        category, bottleSizeMl: bottle, pourSizeMl: pour,
        producer: producer.trim() || null, vintage: vintage.trim() || null,
        abv: abv.trim() ? Number(abv) : null, binNumber: bin.trim() || null,
        offerGlass: glass, offerBottle: bottleSvc,
      };
      if (edit) {
        await patchBeverageProfile(edit.id, body);
      } else {
        const ing = await createIngredient({ name: name.trim(), unit: "bottle", costPerUnit: Number(cost) || 0 });
        await createBeverageProfile({ ingredientId: ing.id, ...body });
      }
      onSaved();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  const field = { backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.pearl } as const;
  const label = { fontSize: 10, fontWeight: "700" as const, color: C.smoke, letterSpacing: 1, textTransform: "uppercase" as const };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      {scanOpen && <PhotoCapture onCapture={onScan} onClose={() => setScanOpen(false)} />}
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "92%", paddingBottom: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: C.pearl }}>{edit ? "Edit Beverage" : "Add Beverage"}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
            {!edit && (
              <TouchableOpacity onPress={() => setScanOpen(true)} disabled={scanning} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.gold, backgroundColor: T.gold }}>
                {scanning ? <ActivityIndicator color={C.gold} /> : <Ionicons name="camera-outline" size={18} color={C.gold} />}
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.gold }}>{scanning ? "Reading label…" : "Scan bottle label (AI)"}</Text>
              </TouchableOpacity>
            )}
            {scanNote ? <Text style={{ fontSize: 11, color: C.jade }}>{scanNote}</Text> : null}

            {!edit && (
              <View style={{ gap: 6 }}>
                <Text style={label}>Name *</Text>
                <TextInput style={field} value={name} onChangeText={setName} placeholder="Caymus Cabernet Sauvignon" placeholderTextColor={C.smoke} />
              </View>
            )}

            <View style={{ gap: 6 }}>
              <Text style={label}>Category</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {CATS.map((c) => {
                  const sel = category === c;
                  return (
                    <TouchableOpacity key={c} onPress={() => setCategory(c)} style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center", backgroundColor: sel ? `${C.gold}1A` : C.surfaceHi, borderWidth: 1, borderColor: sel ? C.gold : C.rim }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: sel ? C.gold : C.mist }}>{CAT_LABEL[c]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}><Text style={label}>Producer</Text><TextInput style={field} value={producer} onChangeText={setProducer} placeholder="Winery / distillery" placeholderTextColor={C.smoke} /></View>
              <View style={{ width: 90, gap: 6 }}><Text style={label}>Vintage</Text><TextInput style={field} value={vintage} onChangeText={setVintage} placeholder="2021" placeholderTextColor={C.smoke} /></View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: 110, gap: 6 }}><Text style={label}>ABV %</Text><TextInput style={field} value={abv} onChangeText={setAbv} placeholder="14.5" placeholderTextColor={C.smoke} keyboardType="decimal-pad" /></View>
              {!edit && <View style={{ flex: 1, gap: 6 }}><Text style={label}>Bottle cost $</Text><TextInput style={field} value={cost} onChangeText={setCost} placeholder="0.00" placeholderTextColor={C.smoke} keyboardType="decimal-pad" /></View>}
            </View>

            <View style={{ gap: 6 }}><Text style={label}>Bottle size</Text><SizeChips presets={BOTTLE_PRESETS} value={bottle} onPick={setBottle} /></View>
            <View style={{ gap: 6 }}><Text style={label}>Pour size</Text><SizeChips presets={POUR_PRESETS} value={pour} onPick={setPour} /></View>

            <View style={{ gap: 6 }}>
              <Text style={label}>Service program</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity onPress={() => setGlass((v) => !v)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, backgroundColor: glass ? `${C.jade}1A` : C.surfaceHi, borderColor: glass ? C.jade : C.rim }}>
                  <Ionicons name={glass ? "checkbox" : "square-outline"} size={16} color={glass ? C.jade : C.smoke} /><Text style={{ fontSize: 12, fontWeight: "700", color: glass ? C.jade : C.mist }}>By the glass</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBottleSvc((v) => !v)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, backgroundColor: bottleSvc ? `${C.jade}1A` : C.surfaceHi, borderColor: bottleSvc ? C.jade : C.rim }}>
                  <Ionicons name={bottleSvc ? "checkbox" : "square-outline"} size={16} color={bottleSvc ? C.jade : C.smoke} /><Text style={{ fontSize: 12, fontWeight: "700", color: bottleSvc ? C.jade : C.mist }}>By the bottle</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ gap: 6 }}><Text style={label}>BIN (optional — auto-assignable)</Text><TextInput style={field} value={bin} onChangeText={setBin} placeholder="e.g. G12 / B045" placeholderTextColor={C.smoke} /></View>

            <TouchableOpacity onPress={save} disabled={saving} style={{ paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.gold, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: C.void }}>{saving ? "Saving…" : edit ? "Save Beverage" : "Add Beverage"}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function BeveragesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const { refreshing, run } = useManualRefresh();
  const [sheet, setSheet] = useState<{ edit: BeverageProfile | null } | null>(null);
  const [assigning, setAssigning] = useState(false);

  const { data: profiles = [], isLoading, refetch } = useQuery({ queryKey: ["beverageProfiles"], queryFn: getBeverageProfiles });

  function confirmDelete(p: BeverageProfile) {
    Alert.alert("Delete beverage", `Remove "${p.ingredient.name}" from the beverage program?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { try { await deleteBeverageProfile(p.id); refetch(); } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); } } },
    ]);
  }
  async function autoBins() {
    setAssigning(true);
    try { const r = await assignBeverageBins(); refetch(); Alert.alert("BINs assigned", `${r.assigned ?? "All"} beverages now have a BIN.`); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setAssigning(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Beverages"
        subtitle={`${profiles.length} in the program`}
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        right={<TouchableOpacity onPress={() => setSheet({ edit: null })} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="add-circle-outline" size={24} color={C.gold} /></TouchableOpacity>}
      />
      {sheet && <BevSheet edit={sheet.edit} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); refetch(); qc.invalidateQueries({ queryKey: ["beverageProfiles"] }); }} />}

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(() => refetch())} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        <TouchableOpacity onPress={autoBins} disabled={assigning} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.rim, backgroundColor: C.surface }}>
          <Ionicons name="pricetag-outline" size={16} color={C.gold} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{assigning ? "Assigning…" : "Auto-assign BINs"}</Text>
        </TouchableOpacity>

        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 48 }}><ActivityIndicator color={C.gold} /></View>
        ) : profiles.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
            <Ionicons name="wine-outline" size={34} color={C.smoke} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>No beverages yet</Text>
            <Text style={{ fontSize: 12, color: C.smoke }}>Tap + to add one (or scan a label).</Text>
          </View>
        ) : (
          CATS.filter((c) => profiles.some((p) => p.category === c)).map((cat) => (
            <View key={cat} style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>{CAT_LABEL[cat]}</Text>
              <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                {profiles.filter((p) => p.category === cat).map((p, i, arr) => {
                  const qty = p.ingredient.inventoryItem ? Number(p.ingredient.inventoryItem.quantity) : null;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => setSheet({ edit: p })} onLongPress={() => confirmDelete(p)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                      {p.binNumber ? (
                        <View style={{ minWidth: 40, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: C.surfaceHi, alignItems: "center" }}>
                          <Text style={{ fontSize: 11, fontWeight: "800", color: C.gold }}>{p.binNumber}</Text>
                        </View>
                      ) : null}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }} numberOfLines={1}>{p.ingredient.name}</Text>
                        <Text style={{ fontSize: 11, color: C.smoke }} numberOfLines={1}>
                          {[p.producer, p.vintage].filter(Boolean).join(" · ") || "—"} · {p.bottleSizeMl}ml{p.abv != null ? ` · ${p.abv}%` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 3 }}>
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          {p.offerGlass && <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: T.jade }}><Text style={{ fontSize: 9, fontWeight: "700", color: C.jade }}>BTG</Text></View>}
                          {p.offerBottle && <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: T.sky }}><Text style={{ fontSize: 9, fontWeight: "700", color: C.sky }}>BTB</Text></View>}
                        </View>
                        {qty != null && <Text style={{ fontSize: 10, color: qty <= 0 ? C.coral : C.smoke }}>{qty} on hand</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        )}
        <Text style={{ fontSize: 11, color: C.smoke, textAlign: "center", marginTop: 4 }}>Tap to edit · long-press to remove</Text>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
