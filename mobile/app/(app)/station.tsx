import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { C, T, shadow } from "@/lib/theme";
import KitchenScreen from "./kitchen";
import BarScreen from "./bar";

export const STATION_KEY = "station_default";
export type StationMode = "host" | "kds" | "bds";

const STATIONS: { mode: StationMode; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { mode: "host", label: "Host Stand", desc: "Floor plan, reservations & waitlist", icon: "grid-outline", color: C.gold },
  { mode: "kds", label: "Kitchen Display", desc: "Live food ticket wall", icon: "flame-outline", color: C.coral },
  { mode: "bds", label: "Bar Display", desc: "Live drink ticket wall", icon: "wine-outline", color: C.ember },
];

// ── Floating station control (switch / exit), shown over an active station ──────
function StationControl({ onSwitch, onExit, label }: { onSwitch: () => void; onExit: () => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={[{ position: "absolute", top: 8, right: 12, zIndex: 50, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.pearl }, shadow.sm]}
      >
        <Ionicons name="apps" size={14} color={C.gold} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>{label}</Text>
      </TouchableOpacity>
      {open && (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "flex-end", paddingTop: 56, paddingRight: 12 }}>
            <View style={[{ backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, minWidth: 200 }, shadow.md]}>
              <TouchableOpacity onPress={() => { setOpen(false); onSwitch(); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
                <Ionicons name="swap-horizontal" size={17} color={C.gold} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>Switch station</Text>
              </TouchableOpacity>
              <View style={{ height: 1, backgroundColor: C.rim }} />
              <TouchableOpacity onPress={() => { setOpen(false); onExit(); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
                <Ionicons name="exit-outline" size={17} color={C.mist} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: C.mist }}>Exit to app</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  );
}

export default function StationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = (params.mode as StationMode | undefined) ?? null;
  const [defaultMode, setDefaultMode] = useState<StationMode | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Hide the tab bar while a station is on screen; restore on leave.
  useFocusEffect(useCallback(() => {
    SecureStore.getItemAsync(STATION_KEY).then((v) => { setDefaultMode((v as StationMode) || null); setLoaded(true); });
  }, []));

  async function setDefault(m: StationMode | null) {
    if (m) await SecureStore.setItemAsync(STATION_KEY, m);
    else await SecureStore.deleteItemAsync(STATION_KEY);
    setDefaultMode(m);
  }

  const goSwitch = () => router.replace("/(app)/station");
  const goExit = () => router.replace("/(app)");

  // ── Active station ───────────────────────────────────────────────────────────
  if (mode === "kds" || mode === "bds") {
    return (
      <View style={{ flex: 1, backgroundColor: C.void }}>
        {mode === "kds" ? <KitchenScreen /> : <BarScreen />}
        <StationControl label={mode === "kds" ? "KDS" : "BDS"} onSwitch={goSwitch} onExit={goExit} />
      </View>
    );
  }
  if (mode === "host") {
    // Dedicated standalone Host Stand lands next; route to the live floor for now.
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 }}>
        <Ionicons name="grid-outline" size={44} color={C.gold} />
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.pearl }}>Host Stand</Text>
        <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", lineHeight: 19 }}>
          The dedicated full-screen host stand is being wired up. For now, open the live floor to seat guests and manage the waitlist.
        </Text>
        <TouchableOpacity onPress={() => router.replace("/(app)/pos")} style={{ marginTop: 4, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 14, backgroundColor: C.gold }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.void }}>Open the floor</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goSwitch}><Text style={{ fontSize: 13, color: C.smoke, marginTop: 8 }}>Pick another station</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Picker ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 24, fontWeight: "800", color: C.pearl }}>Station Mode</Text>
          <Text style={{ fontSize: 13, color: C.mist, marginTop: 2 }}>Pick this device&apos;s station</Text>
        </View>
        <TouchableOpacity onPress={goExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={24} color={C.mist} />
        </TouchableOpacity>
      </View>

      {!loaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={C.gold} /></View>
      ) : (
        <View style={{ flex: 1, padding: 16, gap: 12 }}>
          {STATIONS.map((s) => {
            const isDefault = defaultMode === s.mode;
            return (
              <View key={s.mode} style={[{ borderRadius: 18, borderWidth: 1, borderColor: C.rim, backgroundColor: C.surface, overflow: "hidden" }, shadow.sm]}>
                <TouchableOpacity onPress={() => router.replace(`/(app)/station?mode=${s.mode}`)} style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: 18 }}>
                  <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: `${s.color}1A`, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={s.icon} size={26} color={s.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: "800", color: C.pearl }}>{s.label}</Text>
                    <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>{s.desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={C.smoke} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDefault(isDefault ? null : s.mode)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.rim, backgroundColor: isDefault ? `${s.color}0F` : "transparent" }}>
                  <Ionicons name={isDefault ? "checkbox" : "square-outline"} size={17} color={isDefault ? s.color : C.smoke} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: isDefault ? s.color : C.smoke }}>
                    {isDefault ? "This device opens here automatically" : "Make this device's default station"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <Text style={{ fontSize: 11, color: C.smoke, textAlign: "center", marginTop: 6 }}>
            A default makes this a dedicated station device — it opens straight into that mode. Roaming devices can leave it unset.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
