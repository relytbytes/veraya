import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  RefreshControl, ActivityIndicator, Alert, Animated, Switch,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getManagerLog, createManagerLogEntry } from "@/lib/api";
import type { ManagerLogEntry } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

const LOG_TYPES = ["INCIDENT", "NOTE", "CASH", "MAINTENANCE", "STAFF", "OTHER"] as const;
type LogType = typeof LOG_TYPES[number];

const TYPE_META: Record<LogType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  INCIDENT:    { label: "Incident",    icon: "warning-outline",    color: C.coral },
  NOTE:        { label: "Note",        icon: "document-text-outline", color: C.sky },
  CASH:        { label: "Cash Drop",   icon: "cash-outline",       color: C.jade },
  MAINTENANCE: { label: "Maintenance", icon: "construct-outline",  color: C.ember },
  STAFF:       { label: "Staff",       icon: "people-outline",     color: C.gold },
  OTHER:       { label: "Other",       icon: "ellipsis-horizontal-outline", color: C.mist },
};

const SEVERITY_META = {
  HIGH:   { label: "High",   color: C.coral, bg: T.coral },
  MEDIUM: { label: "Medium", color: C.ember, bg: T.ember },
  LOW:    { label: "Low",    color: C.sky,   bg: T.sky   },
};

function timeSince(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Entry card ───────────────────────────────────────────────────────────────

function EntryCard({ entry }: { entry: ManagerLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const type = (entry.type as LogType) in TYPE_META ? entry.type as LogType : "OTHER";
  const meta = TYPE_META[type];
  const sevMeta = entry.severity && entry.severity in SEVERITY_META
    ? SEVERITY_META[entry.severity as keyof typeof SEVERITY_META]
    : null;

  return (
    <TouchableOpacity
      onPress={() => setExpanded((e) => !e)}
      activeOpacity={0.75}
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: sevMeta?.color ? sevMeta.color + "33" : C.rim,
        overflow: "hidden",
        ...shadow.sm,
      }}
    >
      {/* Left accent */}
      <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, backgroundColor: meta.color, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />

      <View style={{ paddingLeft: 16, paddingRight: 14, paddingVertical: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        {/* Icon */}
        <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: meta.color + "18", alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 }}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl, flex: 1 }}>{entry.title}</Text>
            {sevMeta && (
              <View style={{ backgroundColor: sevMeta.bg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: sevMeta.color }}>{sevMeta.label.toUpperCase()}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <View style={{ backgroundColor: meta.color + "18", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: meta.color }}>{meta.label}</Text>
            </View>
            {entry.shift && (
              <Text style={{ fontSize: 11, color: C.smoke }}>{entry.shift} shift</Text>
            )}
            <Text style={{ fontSize: 11, color: C.smoke }}>
              {entry.author.name} · {timeSince(entry.createdAt)}
            </Text>
          </View>

          {expanded && (
            <View style={{ marginTop: 6, gap: 6 }}>
              <Text style={{ fontSize: 13, color: C.pearl, lineHeight: 19 }}>{entry.body}</Text>

              {/* Cash fields */}
              {(entry.openingBank != null || entry.closingBank != null) && (
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                  {entry.openingBank != null && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.smoke }}>Opening Bank</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.jade }}>${Number(entry.openingBank).toFixed(2)}</Text>
                    </View>
                  )}
                  {entry.closingBank != null && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.smoke }}>Closing Bank</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.jade }}>${Number(entry.closingBank).toFixed(2)}</Text>
                    </View>
                  )}
                  {entry.totalDrop != null && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.smoke }}>Total Drop</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.gold }}>${Number(entry.totalDrop).toFixed(2)}</Text>
                    </View>
                  )}
                  {entry.discrepancy != null && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.smoke }}>Discrepancy</Text>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: Number(entry.discrepancy) !== 0 ? C.coral : C.jade }}>
                        {Number(entry.discrepancy) > 0 ? "+" : ""}${Number(entry.discrepancy).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {entry.followUp && (
                <View style={{ backgroundColor: C.gold + "12", borderRadius: 8, padding: 8, flexDirection: "row", gap: 6 }}>
                  <Ionicons name="flag-outline" size={13} color={C.goldDim} />
                  <Text style={{ flex: 1, fontSize: 12, color: C.goldDim }}>{entry.followUp}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.smoke} style={{ marginTop: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Add entry modal ──────────────────────────────────────────────────────────

function AddEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<LogType>("NOTE");
  const [shift, setShift] = useState<"AM" | "PM" | "MID" | "">("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<"HIGH" | "MEDIUM" | "LOW" | "">("");
  const [followUp, setFollowUp] = useState("");
  const [cashMode, setCashMode] = useState(false);
  const [openingBank, setOpeningBank] = useState("");
  const [closingBank, setClosingBank] = useState("");
  const [totalDrop, setTotalDrop] = useState("");
  const [saving, setSaving] = useState(false);

  const discrepancy = openingBank && closingBank && totalDrop
    ? (Number(closingBank) + Number(totalDrop)) - Number(openingBank)
    : null;

  async function handleSave() {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing Info", "Title and details are required.");
      return;
    }
    setSaving(true);
    try {
      await createManagerLogEntry({
        type,
        title: title.trim(),
        body: body.trim(),
        shift: shift || undefined,
        severity: severity || undefined,
        followUp: followUp.trim() || undefined,
        openingBank: openingBank ? Number(openingBank) : undefined,
        closingBank: closingBank ? Number(closingBank) : undefined,
        totalDrop: totalDrop ? Number(totalDrop) : undefined,
        discrepancy: discrepancy ?? undefined,
      });
      onSaved();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: C.pearl,
  };
  const labelStyle = { fontSize: 11, fontWeight: "600" as const, color: C.smoke, textTransform: "uppercase" as const, letterSpacing: 1 };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <ScrollView
            style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 16 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center" }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>New Log Entry</Text>
              <TouchableOpacity onPress={onClose} style={{ height: 32, width: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>

            {/* Type */}
            <View style={{ gap: 8 }}>
              <Text style={labelStyle}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {LOG_TYPES.map((t) => {
                    const m = TYPE_META[t];
                    const sel = type === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { setType(t); setCashMode(t === "CASH"); }}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                          backgroundColor: sel ? m.color + "22" : C.surfaceHi,
                          borderWidth: 1.5, borderColor: sel ? m.color : C.rim,
                          flexDirection: "row", alignItems: "center", gap: 6,
                        }}
                      >
                        <Ionicons name={m.icon} size={14} color={sel ? m.color : C.smoke} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: sel ? m.color : C.mist }}>{m.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Shift + Severity row */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={labelStyle}>Shift</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["AM", "PM", "MID", ""] as const).map((s) => (
                    <TouchableOpacity
                      key={s || "any"}
                      onPress={() => setShift(s)}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                        backgroundColor: shift === s ? C.gold + "22" : C.surfaceHi,
                        borderWidth: 1, borderColor: shift === s ? C.gold : C.rim,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: shift === s ? C.goldDim : C.mist }}>
                        {s || "Any"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              {(type === "INCIDENT" || type === "STAFF") && (
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={labelStyle}>Severity</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["HIGH", "MEDIUM", "LOW"] as const).map((s) => {
                      const sm = SEVERITY_META[s];
                      return (
                        <TouchableOpacity
                          key={s}
                          onPress={() => setSeverity(severity === s ? "" : s)}
                          style={{
                            flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
                            backgroundColor: severity === s ? sm.bg : C.surfaceHi,
                            borderWidth: 1, borderColor: severity === s ? sm.color : C.rim,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: "700", color: severity === s ? sm.color : C.smoke }}>{s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {/* Title */}
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Title *</Text>
              <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Brief summary…" placeholderTextColor={C.smoke} autoFocus />
            </View>

            {/* Details */}
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Details *</Text>
              <TextInput
                style={[inputStyle, { minHeight: 80, textAlignVertical: "top" }]}
                value={body}
                onChangeText={setBody}
                placeholder="Full description of what happened…"
                placeholderTextColor={C.smoke}
                multiline
              />
            </View>

            {/* Cash fields */}
            {cashMode && (
              <View style={{ gap: 10, padding: 14, backgroundColor: C.jade + "0d", borderRadius: 14, borderWidth: 1, borderColor: C.jade + "33" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.jade }}>Cash Reconciliation</Text>
                {[
                  { label: "Opening Bank", value: openingBank, onChange: setOpeningBank },
                  { label: "Closing Bank", value: closingBank, onChange: setClosingBank },
                  { label: "Total Drop",   value: totalDrop,   onChange: setTotalDrop },
                ].map((f) => (
                  <View key={f.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontSize: 12, color: C.mist, width: 100 }}>{f.label}</Text>
                    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, overflow: "hidden" }}>
                      <Text style={{ paddingLeft: 10, color: C.jade, fontWeight: "700" }}>$</Text>
                      <TextInput
                        style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 9, fontSize: 14, color: C.pearl }}
                        value={f.value}
                        onChangeText={f.onChange}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={C.smoke}
                      />
                    </View>
                  </View>
                ))}
                {discrepancy !== null && (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: C.mist }}>Discrepancy</Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: discrepancy === 0 ? C.jade : C.coral }}>
                      {discrepancy > 0 ? "+" : ""}${discrepancy.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Follow-up */}
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Follow-up Needed (optional)</Text>
              <TextInput style={inputStyle} value={followUp} onChangeText={setFollowUp} placeholder="Action item or note for next manager…" placeholderTextColor={C.smoke} />
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={[{ height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: saving ? C.surfaceHi : C.gold }, !saving && shadow.gold]}
            >
              {saving
                ? <ActivityIndicator color={C.pearl} />
                : <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                    <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Entry</Text>
                  </>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ManagerLogScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [filter, setFilter] = useState<"" | LogType>("");
  const [addOpen, setAddOpen] = useState(false);

  const { data: entries = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["managerLog", filter],
    queryFn: () => getManagerLog(filter || undefined),
  });

  const highCount = entries.filter((e) => e.severity === "HIGH").length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Manager Log"
        subtitle={`${entries.length} entries${highCount > 0 ? ` · ${highCount} high severity` : ""}`}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            onPress={() => setAddOpen(true)}
            style={[{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }, shadow.gold]}
          >
            <Ionicons name="add" size={22} color={C.void} />
          </TouchableOpacity>
        }
      />

      {/* Filter chips */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim, paddingHorizontal: 16, paddingVertical: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([["", "All", "apps-outline", C.mist], ...LOG_TYPES.map((t) => [t, TYPE_META[t as LogType].label, TYPE_META[t as LogType].icon, TYPE_META[t as LogType].color])] as [string, string, keyof typeof Ionicons.glyphMap, string][]).map(([key, label, icon, color]) => {
              const active = filter === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setFilter(key as typeof filter)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: active ? color + "22" : C.surfaceHi,
                    borderWidth: 1, borderColor: active ? color : C.rim,
                  }}
                >
                  <Ionicons name={icon} size={13} color={active ? color : C.smoke} />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? color : C.mist }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={C.gold} />
          </View>
        )}
        {!isLoading && entries.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 64, gap: 12 }}>
            <View style={{ height: 72, width: 72, borderRadius: 24, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text-outline" size={32} color={C.smoke} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: C.pearl }}>No log entries</Text>
            <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", paddingHorizontal: 24 }}>
              Tap + to add your first manager log entry.
            </Text>
          </View>
        )}
        {entries.map((entry) => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </Animated.ScrollView>

      {addOpen && (
        <AddEntryModal
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["managerLog"] });
            setAddOpen(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}
