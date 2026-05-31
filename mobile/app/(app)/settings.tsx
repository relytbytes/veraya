import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, TextInput, TouchableOpacity,
  Switch, ActivityIndicator, Animated, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSettings, saveSettings } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";

function strToBool(v: string | undefined) { return v === "true"; }
function boolToStr(v: boolean) { return v ? "true" : "false"; }

function SectionHeader({ label }: { label: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 24, marginBottom: 8, paddingHorizontal: 4 }}>
      {label}
    </Text>
  );
}

function CardWrap({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
      {children}
    </View>
  );
}

function RowBase({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: C.rim,
    }}>
      {children}
    </View>
  );
}

interface TextRowProps {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; keyboardType?: "default" | "numeric" | "phone-pad" | "decimal-pad";
  multiline?: boolean; last?: boolean;
}

function TextRow({ label, value, onChange, placeholder = "", keyboardType = "default", multiline = false, last }: TextRowProps) {
  return (
    <RowBase last={last}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, width: 120, flexShrink: 0 }}>{label}</Text>
      <TextInput
        style={{ flex: 1, fontSize: 13, color: C.mist, textAlign: "right", ...(multiline ? { minHeight: 52 } : {}) }}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.smoke}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        returnKeyType="done"
      />
    </RowBase>
  );
}

function ToggleRow({ label, value, onChange, info, last }: { label: string; value: boolean; onChange: (v: boolean) => void; info?: string; last?: boolean }) {
  return (
    <RowBase last={last}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{label}</Text>
        {info && <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }}>{info}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: C.rim, true: C.jade }}
        thumbColor={Platform.OS === "android" ? (value ? "#fff" : C.surfaceHi) : undefined}
      />
    </RowBase>
  );
}

function SegmentRow({ label, options, value, onChange, last }: { label: string; options: { label: string; value: string }[]; value: string; onChange: (v: string) => void; last?: boolean }) {
  return (
    <RowBase last={last}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flexShrink: 0, marginRight: 8 }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
                backgroundColor: selected ? C.gold : C.surfaceHi,
                borderColor: selected ? C.gold : C.rim,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: selected ? C.void : C.mist }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </RowBase>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: remote, isLoading } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { scrollY, scrollHandler } = useCollapsingHeader();

  useEffect(() => { if (remote) { setVals(remote); setDirty(false); } }, [remote]);

  function set(key: string, value: string) { setVals((prev) => ({ ...prev, [key]: value })); setDirty(true); }
  function setToggle(key: string, value: boolean) { set(key, boolToStr(value)); }
  function get(key: string, fallback = "") { return vals[key] ?? fallback; }
  function getBool(key: string) { return strToBool(vals[key]); }

  function showToast() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
    toastTimer.current = setTimeout(() => {}, 2300);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      await saveSettings(vals);
      await qc.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      showToast();
    } catch { /* swallowed */ } finally { setSaving(false); }
  }

  const SLOT_OPTIONS = [{ label: "15 min", value: "15" }, { label: "30 min", value: "30" }, { label: "60 min", value: "60" }];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Settings"
        subtitle="Restaurant configuration"
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
      />

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={C.gold} />
          <Text style={{ fontSize: 13, color: C.mist }}>Loading settings…</Text>
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          <SectionHeader label="Restaurant Info" />
          <CardWrap>
            <TextRow label="Name"      value={get("restaurant.name")}    onChange={(v) => set("restaurant.name", v)}    placeholder="The Gilded Fork" />
            <TextRow label="Address"   value={get("restaurant.address")} onChange={(v) => set("restaurant.address", v)} placeholder="123 Main St" />
            <TextRow label="Phone"     value={get("restaurant.phone")}   onChange={(v) => set("restaurant.phone", v)}   placeholder="+1 555-000-0000" keyboardType="phone-pad" />
            <TextRow label="Tax Rate %" value={get("pos.taxRate")}       onChange={(v) => set("pos.taxRate", v)}         placeholder="8.5" keyboardType="decimal-pad" last />
          </CardWrap>

          <SectionHeader label="POS Defaults" />
          <CardWrap>
            <RowBase>
              <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flex: 1 }}>
                Auto-add gratuity for parties of{" "}
                <Text style={{ color: C.gold, fontWeight: "700" }}>{get("pos.gratuityThreshold", "8") || "8"}</Text>{" "}or more
              </Text>
              <TextInput
                style={{ width: 48, fontSize: 13, fontWeight: "700", color: C.pearl, textAlign: "right", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}
                value={get("pos.gratuityThreshold")}
                onChangeText={(v) => set("pos.gratuityThreshold", v)}
                keyboardType="numeric"
                placeholder="8"
                placeholderTextColor={C.smoke}
              />
            </RowBase>
            <TextRow label="Gratuity %"    value={get("pos.gratuityPct")}    onChange={(v) => set("pos.gratuityPct", v)}    placeholder="18" keyboardType="decimal-pad" />
            <TextRow label="Receipt Footer" value={get("pos.receiptFooter")} onChange={(v) => set("pos.receiptFooter", v)} placeholder="Thank you for dining with us!" last />
          </CardWrap>

          <SectionHeader label="Reservations" />
          <CardWrap>
            <ToggleRow label="Online reservations enabled" value={getBool("reservations.enabled")} onChange={(v) => setToggle("reservations.enabled", v)} />
            <TextRow label="Max party size" value={get("reservations.maxPartySize")} onChange={(v) => set("reservations.maxPartySize", v)} placeholder="12" keyboardType="numeric" />
            <SegmentRow label="Slot interval" options={SLOT_OPTIONS} value={get("reservations.slotMinutes", "30")} onChange={(v) => set("reservations.slotMinutes", v)} />
            <TextRow label="Cancel policy" value={get("reservations.cancelPolicy")} onChange={(v) => set("reservations.cancelPolicy", v)} placeholder="Cancel 24 hours in advance to avoid fees." multiline last />
          </CardWrap>

          <SectionHeader label="Loyalty" />
          <CardWrap>
            <TextRow label="Points / dollar" value={get("loyalty.pointsPerDollar", "1")} onChange={(v) => set("loyalty.pointsPerDollar", v)} placeholder="1" keyboardType="numeric" />
            <RowBase>
              <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flex: 1 }}>
                <Text style={{ color: C.gold, fontWeight: "700" }}>{get("loyalty.pointsPerRedemption", "100") || "100"}</Text>{" "}points = $1 off
              </Text>
              <TextInput
                style={{ width: 64, fontSize: 13, fontWeight: "700", color: C.pearl, textAlign: "right", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}
                value={get("loyalty.pointsPerRedemption")}
                onChangeText={(v) => set("loyalty.pointsPerRedemption", v)}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={C.smoke}
              />
            </RowBase>
            <TextRow label="Min. to redeem" value={get("loyalty.minRedemption")} onChange={(v) => set("loyalty.minRedemption", v)} placeholder="200" keyboardType="numeric" last />
          </CardWrap>

          <SectionHeader label="Notifications" />
          <CardWrap>
            <ToggleRow label="Waitlist SMS" value={getBool("notifications.waitlistSms")} onChange={(v) => setToggle("notifications.waitlistSms", v)} info="Requires Twilio setup" />
            <ToggleRow label="Low inventory alerts" value={getBool("notifications.lowInventory")} onChange={(v) => setToggle("notifications.lowInventory", v)} last />
          </CardWrap>
        </Animated.ScrollView>
      )}

      {/* Save button */}
      {!isLoading && (
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 12, backgroundColor: C.void, borderTopWidth: 1, borderTopColor: C.rim }}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving || !dirty}
            activeOpacity={0.8}
            style={{
              borderRadius: 16, height: 52, alignItems: "center", justifyContent: "center",
              flexDirection: "row", gap: 8,
              backgroundColor: saving || !dirty ? C.surfaceHi : C.gold,
              ...(dirty && !saving ? shadow.gold : {}),
            }}
          >
            {saving ? <ActivityIndicator color={C.void} size="small" /> : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={dirty ? C.void : C.smoke} />
                <Text style={{ fontWeight: "700", fontSize: 15, color: dirty ? C.void : C.smoke }}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Success toast */}
      <Animated.View
        style={{ opacity: toastOpacity, position: "absolute", top: 96, alignSelf: "center", backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 8 }}
        pointerEvents="none"
      >
        <Ionicons name="checkmark-circle" size={16} color={C.jade} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.jade }}>Settings saved</Text>
      </Animated.View>
    </SafeAreaView>
  );
}
