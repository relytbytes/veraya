/**
 * ShelfSetup — organise inventory items into custom storage areas before voice counting.
 * Manager creates areas (Walk-in, Freezer, Dry Storage, Bar, etc.), then drags each
 * item into the right area and reorders within it.  Saves via /api/inventory/reorder.
 */
import { useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, TextInput, ScrollView,
  Modal, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getStorageAreas, createStorageArea, deleteStorageArea,
  getInventory, saveShelfOrder,
} from "@/lib/api";
import type { StorageArea, InventoryItem } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSetupComplete: () => void; // called after saving — parent can start count mode
}

export function ShelfSetup({ visible, onClose, onSetupComplete }: Props) {
  const qc = useQueryClient();
  const { data: areas = [] } = useQuery({ queryKey: ["storageAreas"], queryFn: getStorageAreas });
  const { data: inventory = [] } = useQuery({ queryKey: ["inventory"], queryFn: getInventory });

  const [newAreaName, setNewAreaName] = useState("");
  const [addingArea, setAddingArea] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local assignments: itemId → { areaName, order }
  const [assignments, setAssignments] = useState<Record<string, { area: string; order: number }>>(() => {
    const map: Record<string, { area: string; order: number }> = {};
    inventory.forEach(item => {
      if (item.storageArea) map[item.id] = { area: item.storageArea, order: item.shelfOrder ?? 999 };
    });
    return map;
  });

  // Rebuild assignments when inventory loads
  const rebuildFromInventory = useCallback((inv: InventoryItem[]) => {
    const map: Record<string, { area: string; order: number }> = {};
    inv.forEach(item => {
      if (item.storageArea) map[item.id] = { area: item.storageArea, order: item.shelfOrder ?? 999 };
    });
    setAssignments(map);
  }, []);

  // Items grouped by area
  function itemsForArea(areaName: string): InventoryItem[] {
    return inventory
      .filter(i => assignments[i.id]?.area === areaName)
      .sort((a, b) => (assignments[a.id]?.order ?? 999) - (assignments[b.id]?.order ?? 999));
  }

  const unassigned = inventory.filter(i => !assignments[i.id]?.area);

  function assignItem(item: InventoryItem, areaName: string) {
    const existingInArea = itemsForArea(areaName);
    const nextOrder = existingInArea.length;
    setAssignments(prev => ({ ...prev, [item.id]: { area: areaName, order: nextOrder } }));
  }

  function removeFromArea(item: InventoryItem) {
    setAssignments(prev => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }

  function moveUp(item: InventoryItem) {
    const areaName = assignments[item.id]?.area;
    if (!areaName) return;
    const inArea = itemsForArea(areaName);
    const idx = inArea.findIndex(i => i.id === item.id);
    if (idx <= 0) return;
    const other = inArea[idx - 1];
    setAssignments(prev => ({
      ...prev,
      [item.id]: { ...prev[item.id], order: idx - 1 },
      [other.id]: { ...prev[other.id], order: idx },
    }));
  }

  function moveDown(item: InventoryItem) {
    const areaName = assignments[item.id]?.area;
    if (!areaName) return;
    const inArea = itemsForArea(areaName);
    const idx = inArea.findIndex(i => i.id === item.id);
    if (idx >= inArea.length - 1) return;
    const other = inArea[idx + 1];
    setAssignments(prev => ({
      ...prev,
      [item.id]: { ...prev[item.id], order: idx + 1 },
      [other.id]: { ...prev[other.id], order: idx },
    }));
  }

  async function handleAddArea() {
    if (!newAreaName.trim()) return;
    setAddingArea(true);
    try {
      await createStorageArea(newAreaName.trim());
      await qc.invalidateQueries({ queryKey: ["storageAreas"] });
      setNewAreaName("");
    } finally { setAddingArea(false); }
  }

  async function handleDeleteArea(area: StorageArea) {
    Alert.alert(
      `Delete "${area.name}"?`,
      "All items in this area will be unassigned.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            await deleteStorageArea(area.id);
            await qc.invalidateQueries({ queryKey: ["storageAreas"] });
            // Unassign items locally
            setAssignments(prev => {
              const next = { ...prev };
              Object.keys(next).forEach(id => { if (next[id].area === area.name) delete next[id]; });
              return next;
            });
          },
        },
      ]
    );
  }

  async function handleSave() {
    if (unassigned.length > 0) {
      Alert.alert(
        `${unassigned.length} item${unassigned.length !== 1 ? "s" : ""} not assigned`,
        "All items must be assigned to a storage area before voice counting.",
        [{ text: "OK" }]
      );
      return;
    }
    setSaving(true);
    try {
      const updates = inventory.map(item => ({
        id: item.id,
        storageArea: assignments[item.id]?.area ?? null,
        shelfOrder: assignments[item.id]?.order ?? null,
      }));
      await saveShelfOrder(updates);
      await qc.invalidateQueries({ queryKey: ["inventory"] });
      onSetupComplete();
    } finally { setSaving(false); }
  }

  const allAssigned = unassigned.length === 0 && inventory.length > 0 && areas.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.void }}>

        {/* Header */}
        <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: C.rim, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>Shelf Setup</Text>
            <Text style={{ fontSize: 12, color: C.mist, marginTop: 1 }}>Assign items to areas in counting order</Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !allAssigned}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: allAssigned && !saving ? C.gold : C.surfaceHi, ...(allAssigned && !saving ? shadow.gold : {}) }}
          >
            {saving
              ? <ActivityIndicator size="small" color={C.void} />
              : <><Ionicons name="checkmark-circle-outline" size={16} color={allAssigned ? C.void : C.smoke} /><Text style={{ fontWeight: "700", fontSize: 13, color: allAssigned ? C.void : C.smoke }}>Save & Count</Text></>
            }
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 60 }}>

          {/* Add area */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.5 }}>Storage Areas</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={{ flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.pearl }}
                value={newAreaName}
                onChangeText={setNewAreaName}
                placeholder="e.g. Walk-in Cooler, Dry Storage, Bar…"
                placeholderTextColor={C.smoke}
                returnKeyType="done"
                onSubmitEditing={handleAddArea}
              />
              <TouchableOpacity
                onPress={handleAddArea}
                disabled={addingArea || !newAreaName.trim()}
                style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 12, backgroundColor: newAreaName.trim() ? C.gold : C.surfaceHi }}
              >
                {addingArea ? <ActivityIndicator size="small" color={C.void} /> : <Ionicons name="add" size={20} color={newAreaName.trim() ? C.void : C.smoke} />}
              </TouchableOpacity>
            </View>

            {/* Area list */}
            {areas.map(area => (
              <View key={area.id} style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.rim, overflow: "hidden", ...shadow.sm }}>
                {/* Area header */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: itemsForArea(area.name).length > 0 ? 1 : 0, borderColor: C.rim, backgroundColor: C.surfaceHi }}>
                  <Ionicons name="layers-outline" size={14} color={C.gold} style={{ marginRight: 8 }} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: C.pearl }}>{area.name}</Text>
                  <Text style={{ fontSize: 11, color: C.mist, marginRight: 8 }}>{itemsForArea(area.name).length} items</Text>
                  <TouchableOpacity onPress={() => handleDeleteArea(area)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="trash-outline" size={15} color={C.coral} />
                  </TouchableOpacity>
                </View>

                {/* Items in this area */}
                {itemsForArea(area.name).map((item, idx, arr) => (
                  <View key={item.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: idx < arr.length - 1 ? 1 : 0, borderColor: C.rim, gap: 8 }}>
                    <View style={{ width: 24, alignItems: "center", gap: 2 }}>
                      <TouchableOpacity onPress={() => moveUp(item)} disabled={idx === 0} hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}>
                        <Ionicons name="chevron-up" size={13} color={idx === 0 ? C.smoke : C.mist} />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 9, color: C.smoke, fontWeight: "700" }}>{idx + 1}</Text>
                      <TouchableOpacity onPress={() => moveDown(item)} disabled={idx === arr.length - 1} hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}>
                        <Ionicons name="chevron-down" size={13} color={idx === arr.length - 1 ? C.smoke : C.mist} />
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{item.ingredient.name}</Text>
                      <Text style={{ fontSize: 11, color: C.mist }}>{item.ingredient.unit}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFromArea(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="remove-circle-outline" size={18} color={C.smoke} />
                    </TouchableOpacity>
                  </View>
                ))}

                {itemsForArea(area.name).length === 0 && (
                  <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 12, color: C.smoke, fontStyle: "italic" }}>No items — assign from unorganised below</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Unassigned items */}
          {unassigned.length > 0 && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.coral, textTransform: "uppercase", letterSpacing: 1.5 }}>Unorganised ({unassigned.length})</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
              </View>
              {areas.length === 0 && (
                <Text style={{ fontSize: 12, color: C.mist, paddingHorizontal: 4 }}>Create at least one storage area above first.</Text>
              )}
              {unassigned.map(item => (
                <View key={item.id} style={{ backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.rimBright, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>{item.ingredient.name}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>Current: {Number(item.quantity).toFixed(1)} {item.ingredient.unit}</Text>
                  </View>
                  {areas.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        {areas.map(area => (
                          <TouchableOpacity
                            key={area.id}
                            onPress={() => assignItem(item, area.name)}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: "600", color: C.gold }}>{area.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </View>
              ))}
            </View>
          )}

          {allAssigned && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, borderRadius: 14, padding: 14 }}>
              <Ionicons name="checkmark-circle" size={20} color={C.jade} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: C.jade }}>All {inventory.length} items organised — ready to count!</Text>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}
