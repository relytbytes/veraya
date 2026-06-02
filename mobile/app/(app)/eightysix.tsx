import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  RefreshControl, ActivityIndicator, Alert, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getEightySix, addEightySix, removeEightySix, getMenuItems } from "@/lib/api";
import type { EightySixItem } from "@/lib/api";
import { C, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

export default function EightySixScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [addOpen, setAddOpen] = useState(false);

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["eightysix"],
    queryFn: getEightySix,
    refetchInterval: 30_000,
  });

  async function handleRemove(item: EightySixItem) {
    Alert.alert(
      "Bring Back",
      `Mark "${item.menuItem.name}" as available again?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            try {
              await removeEightySix(item.menuItemId);
              qc.invalidateQueries({ queryKey: ["eightysix"] });
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed");
            }
          },
        },
      ]
    );
  }

  const since = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="86 List"
        subtitle={items.length === 0 ? "All items available" : `${items.length} item${items.length !== 1 ? "s" : ""} unavailable`}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            onPress={() => setAddOpen(true)}
            style={[{ height: 36, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.coral, flexDirection: "row", alignItems: "center", gap: 6 }, shadow.sm]}
          >
            <Ionicons name="remove-circle-outline" size={16} color="#fff" />
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#fff" }}>86 Item</Text>
          </TouchableOpacity>
        }
      />

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={C.gold} />
          </View>
        )}

        {!isLoading && items.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 64, gap: 14 }}>
            <View style={{ height: 72, width: 72, borderRadius: 24, backgroundColor: C.jade + "18", borderWidth: 1, borderColor: C.jade + "44", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="checkmark-circle-outline" size={36} color={C.jade} />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>Full Menu Available</Text>
              <Text style={{ fontSize: 13, color: C.mist, textAlign: "center" }}>Nothing is 86'd right now.{"\n"}Tap "86 Item" to flag something as unavailable.</Text>
            </View>
          </View>
        )}

        {items.map((item) => (
          <View key={item.id} style={{
            backgroundColor: C.coral + "0a",
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: C.coral + "44",
            padding: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}>
            {/* Icon */}
            <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: C.coral + "22", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close-circle" size={22} color={C.coral} />
            </View>

            {/* Info */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{item.menuItem.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {item.reason && (
                  <Text style={{ fontSize: 12, color: C.coral }} numberOfLines={1}>{item.reason}</Text>
                )}
                <Text style={{ fontSize: 11, color: C.smoke }}>86'd {since(item.createdAt)}</Text>
              </View>
            </View>

            {/* Restore button */}
            <TouchableOpacity
              onPress={() => handleRemove(item)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: C.jade + "18", borderWidth: 1, borderColor: C.jade + "44" }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.jade }}>Restore</Text>
            </TouchableOpacity>
          </View>
        ))}
      </Animated.ScrollView>

      {addOpen && (
        <Add86Modal
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["eightysix"] });
            setAddOpen(false);
          }}
          currentIds={new Set(items.map((i) => i.menuItemId))}
        />
      )}
    </SafeAreaView>
  );
}

function Add86Modal({
  onClose,
  onAdded,
  currentIds,
}: {
  onClose: () => void;
  onAdded: () => void;
  currentIds: Set<string>;
}) {
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: menuItems = [], isLoading } = useQuery({
    queryKey: ["menuItems"],
    queryFn: () => getMenuItems(),
  });

  const available = menuItems.filter(
    (m) => !currentIds.has(m.id) &&
      (!search || m.name.toLowerCase().includes(search.toLowerCase()))
  );

  async function handleAdd() {
    if (!selected) return;
    setSaving(true);
    try {
      await addEightySix(selected, reason.trim() || undefined);
      onAdded();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to 86 item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", overflow: "hidden" }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>86 a Menu Item</Text>
                <TouchableOpacity onPress={onClose} style={{ height: 32, width: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={16} color={C.mist} />
                </TouchableOpacity>
              </View>

              {/* Search */}
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 12 }}>
                <Ionicons name="search-outline" size={15} color={C.smoke} />
                <TextInput
                  style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search menu items…"
                  placeholderTextColor={C.smoke}
                  autoFocus
                />
              </View>

              {/* Item list */}
              {isLoading ? (
                <ActivityIndicator color={C.gold} style={{ paddingVertical: 24 }} />
              ) : (
                <View style={{ gap: 4, marginBottom: 16 }}>
                  {available.slice(0, 30).map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => setSelected(m.id === selected ? null : m.id)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        padding: 12, borderRadius: 12,
                        backgroundColor: selected === m.id ? C.coral + "18" : C.surfaceHi,
                        borderWidth: 1.5, borderColor: selected === m.id ? C.coral : C.rim,
                      }}
                    >
                      <View style={{
                        height: 28, width: 28, borderRadius: 8,
                        backgroundColor: selected === m.id ? C.coral : C.surface,
                        borderWidth: 1, borderColor: selected === m.id ? C.coral : C.rim,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {selected === m.id
                          ? <Ionicons name="close" size={14} color="#fff" />
                          : <Ionicons name="restaurant-outline" size={12} color={C.smoke} />}
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: selected === m.id ? C.pearl : C.mist }}>
                        {m.name}
                      </Text>
                      {selected === m.id && <Ionicons name="checkmark-circle" size={18} color={C.coral} />}
                    </TouchableOpacity>
                  ))}
                  {available.length === 0 && (
                    <Text style={{ textAlign: "center", color: C.mist, paddingVertical: 16, fontSize: 13 }}>
                      {search ? "No items match your search" : "All items already 86'd"}
                    </Text>
                  )}
                </View>
              )}

              {/* Reason */}
              <View style={{ gap: 6, marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Reason (optional)</Text>
                <TextInput
                  style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.pearl }}
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Out of stock, supplier delay…"
                  placeholderTextColor={C.smoke}
                />
              </View>

              {/* Confirm */}
              <TouchableOpacity
                onPress={handleAdd}
                disabled={!selected || saving}
                style={[{
                  height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center",
                  flexDirection: "row", gap: 8,
                  backgroundColor: !selected ? C.surfaceHi : C.coral,
                }, !!selected && !saving && shadow.sm]}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="remove-circle-outline" size={18} color={!selected ? C.smoke : "#fff"} />
                      <Text style={{ fontSize: 15, fontWeight: "700", color: !selected ? C.smoke : "#fff" }}>86 Item</Text>
                    </>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
