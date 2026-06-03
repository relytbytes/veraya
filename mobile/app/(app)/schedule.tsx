import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  RefreshControl, ActivityIndicator, Alert, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getSchedule, getFullStaff, createShift, patchShift, deleteShift, publishSchedule,
  getSchedulingAnalysis,
} from "@/lib/api";
import type { Shift, StaffMember, SchedulingAnalysis } from "@/lib/api";
import { C, T, shadow, roleColor, roleBg } from "@/lib/theme";
import { ScreenMessage } from "@/components/ScreenMessage";
import { useManualRefresh } from "@/lib/use-manual-refresh";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

const POSITIONS = ["Floor", "Bar", "Kitchen", "Host", "Takeout"] as const;
type Position = (typeof POSITIONS)[number];

// ─── Types ───────────────────────────────────────────────────────────────────

type SheetMode = "add" | "edit";

interface SheetState {
  mode: SheetMode;
  shift?: Shift;
  staffId: string;
  date: string;
  startTime: string;
  endTime: string;
  position: string;
  notes: string;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekEnd = addDays(weekStart, 6);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [saving, setSaving] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const fromStr = toDateStr(weekStart);
  const toStr = toDateStr(weekEnd);

  const { data: shifts = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["schedule", fromStr],
    queryFn: () => getSchedule(fromStr, toStr),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["fullStaff"],
    queryFn: getFullStaff,
  });

  const activeStaff = staff.filter((s) => s.isActive);

  // Publish week mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      for (const day of weekDays) {
        await publishSchedule(toDateStr(day));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }),
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  function openAdd(staffId: string, date: string) {
    setSheet({
      mode: "add",
      staffId,
      date,
      startTime: "09:00",
      endTime: "17:00",
      position: "",
      notes: "",
    });
  }

  function openEdit(shift: Shift) {
    setSheet({
      mode: "edit",
      shift,
      staffId: shift.userId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      position: shift.position ?? "",
      notes: shift.notes ?? "",
    });
  }

  function closeSheet() {
    setSheet(null);
  }

  async function handleSave() {
    if (!sheet) return;
    if (!sheet.staffId || !sheet.startTime || !sheet.endTime) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }
    setSaving(true);
    try {
      if (sheet.mode === "add") {
        await createShift({
          userId: sheet.staffId,
          date: sheet.date,
          startTime: sheet.startTime,
          endTime: sheet.endTime,
          position: sheet.position || undefined,
          notes: sheet.notes || undefined,
        });
      } else if (sheet.shift) {
        await patchShift(sheet.shift.id, {
          startTime: sheet.startTime,
          endTime: sheet.endTime,
          position: sheet.position || null,
          notes: sheet.notes || null,
        });
      }
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      closeSheet();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save shift");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!sheet?.shift) return;
    Alert.alert("Delete Shift", "Remove this shift?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await deleteShift(sheet.shift!.id);
            await qc.invalidateQueries({ queryKey: ["schedule"] });
            closeSheet();
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete shift");
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  // Map: staffId -> date -> shift
  const shiftMap = useMemo(() => {
    const map: Record<string, Record<string, Shift>> = {};
    for (const s of shifts) {
      if (!map[s.userId]) map[s.userId] = {};
      map[s.userId][s.date] = s;
    }
    return map;
  }, [shifts]);

  const unpublishedCount = shifts.filter((s) => !s.isPublished).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {/* Header */}
      <CollapsingHeader
        title="Schedule"
        subtitle={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity
            onPress={() => {
              if (unpublishedCount === 0) {
                Alert.alert("Already Published", "All shifts for this week are published.");
                return;
              }
              Alert.alert(
                "Publish Week",
                `Publish ${unpublishedCount} unpublished shift${unpublishedCount !== 1 ? "s" : ""}?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Publish", onPress: () => publishMutation.mutate() },
                ]
              );
            }}
            style={[{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: unpublishedCount > 0 ? C.gold : T.jade,
              borderWidth: unpublishedCount > 0 ? 0 : 1,
              borderColor: C.jade,
            }, unpublishedCount > 0 && shadow.gold]}
          >
            {publishMutation.isPending ? (
              <ActivityIndicator size="small" color={unpublishedCount > 0 ? C.void : C.jade} />
            ) : (
              <>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={16}
                  color={unpublishedCount > 0 ? C.void : C.jade}
                />
                <Text style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color: unpublishedCount > 0 ? C.void : C.jade,
                }}>
                  {unpublishedCount > 0 ? `Publish (${unpublishedCount})` : "Published"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        }
      />
      {/* Week nav */}
      <View style={{
        backgroundColor: C.surface,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.rim,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <TouchableOpacity
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          style={{
            height: 36,
            width: 36,
            borderRadius: 12,
            backgroundColor: C.surfaceHi,
            borderWidth: 1,
            borderColor: C.rim,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-back" size={18} color={C.mist} />
        </TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>
          {weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
        <TouchableOpacity
          onPress={() => setWeekStart((w) => addDays(w, 7))}
          style={{
            height: 36,
            width: 36,
            borderRadius: 12,
            backgroundColor: C.surfaceHi,
            borderWidth: 1,
            borderColor: C.rim,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="chevron-forward" size={18} color={C.mist} />
        </TouchableOpacity>
      </View>

      {/* Labor Analysis button */}
      <TouchableOpacity
        onPress={() => setAnalysisOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginTop: 10,
          marginBottom: 4,
          backgroundColor: "rgba(212,168,83,0.08)",
          borderWidth: 1,
          borderColor: "rgba(212,168,83,0.25)",
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Ionicons name="stats-chart-outline" size={16} color={C.goldDim} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>Labor Analysis</Text>
          <Text style={{ fontSize: 11, color: C.mist }}>Labor %, overtime alerts & DOW insights</Text>
        </View>
        <Ionicons name="chevron-forward" size={15} color={C.goldDim} />
      </TouchableOpacity>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={C.gold} />
        </View>
      ) : (
        <Animated.ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {/* Day headers */}
          <View style={{
            flexDirection: "row",
            backgroundColor: C.surface,
            borderBottomWidth: 1,
            borderBottomColor: C.rim,
            paddingLeft: 80,
          }}>
            {weekDays.map((day) => {
              const isToday = toDateStr(day) === toDateStr(new Date());
              return (
                <View key={toDateStr(day)} style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 8,
                  backgroundColor: isToday ? "rgba(212,168,83,0.08)" : "transparent",
                }}>
                  <Text style={{
                    fontSize: 10,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: isToday ? C.gold : C.smoke,
                  }}>
                    {formatDay(day)}
                  </Text>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: isToday ? C.gold : C.pearl,
                    marginTop: 1,
                  }}>
                    {day.getDate()}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Staff rows */}
          {isError && shifts.length === 0 ? (
            <ScreenMessage icon="cloud-offline-outline" tone="error" title="Couldn't load the schedule" subtitle="Check your connection and try again." actionLabel="Retry" onAction={() => refetch()} />
          ) : activeStaff.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 56, gap: 12 }}>
              <Ionicons name="people-outline" size={40} color={C.smoke} />
              <Text style={{ color: C.mist, fontSize: 14 }}>No active staff found</Text>
            </View>
          ) : (
            activeStaff.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                weekDays={weekDays}
                shiftMap={shiftMap[member.id] ?? {}}
                onAdd={(date) => openAdd(member.id, date)}
                onEdit={openEdit}
              />
            ))
          )}
        </Animated.ScrollView>
      )}

      {/* Sheet */}
      {sheet && (
        <ShiftSheet
          sheet={sheet}
          staff={activeStaff}
          saving={saving}
          onChange={(update) => setSheet((s) => s ? { ...s, ...update } : s)}
          onSave={handleSave}
          onDelete={sheet.mode === "edit" ? handleDelete : undefined}
          onClose={closeSheet}
        />
      )}

      {/* Labor Analysis Modal */}
      {analysisOpen && (
        <LaborAnalysisModal
          from={fromStr}
          to={toStr}
          weekLabel={`${formatDate(weekStart)} – ${formatDate(weekEnd)}`}
          onClose={() => setAnalysisOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Staff row ────────────────────────────────────────────────────────────────

function StaffRow({
  member,
  weekDays,
  shiftMap,
  onAdd,
  onEdit,
}: {
  member: StaffMember;
  weekDays: Date[];
  shiftMap: Record<string, Shift>;
  onAdd: (date: string) => void;
  onEdit: (shift: Shift) => void;
}) {
  const ini = member.name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const rColor = roleColor[member.role] ?? C.mist;
  const rBg = roleBg[member.role] ?? T.mist;

  return (
    <View style={{
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: C.rim,
      backgroundColor: C.void,
    }}>
      {/* Name col */}
      <View style={{
        width: 80,
        paddingHorizontal: 8,
        paddingVertical: 12,
        justifyContent: "center",
        alignItems: "center",
        borderRightWidth: 1,
        borderRightColor: C.rim,
      }}>
        <View style={{
          height: 32,
          width: 32,
          borderRadius: 16,
          backgroundColor: rBg,
          borderWidth: 1,
          borderColor: rColor,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 4,
        }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: rColor }}>{ini}</Text>
        </View>
        <Text style={{ fontSize: 9, fontWeight: "600", color: C.pearl, textAlign: "center", lineHeight: 12 }} numberOfLines={2}>
          {member.name.split(" ")[0]}
        </Text>
        <Text style={{ fontSize: 8, color: C.mist, textAlign: "center" }} numberOfLines={1}>
          {member.role}
        </Text>
      </View>

      {/* Day cells */}
      {weekDays.map((day) => {
        const dateStr = toDateStr(day);
        const shift = shiftMap[dateStr];
        const isToday = dateStr === toDateStr(new Date());
        const shiftRoleColor = shift ? (roleColor[member.role] ?? C.mist) : C.rimBright;
        const shiftRoleBg = shift ? (roleBg[member.role] ?? T.mist) : "transparent";

        return (
          <View key={dateStr} style={{
            flex: 1,
            padding: 3,
            borderRightWidth: 1,
            borderRightColor: C.rim,
            backgroundColor: isToday ? "rgba(212,168,83,0.04)" : "transparent",
          }}>
            {shift ? (
              <TouchableOpacity
                onPress={() => onEdit(shift)}
                style={{
                  flex: 1,
                  borderRadius: 8,
                  padding: 5,
                  backgroundColor: shiftRoleBg,
                  borderWidth: 1,
                  borderColor: shiftRoleColor,
                  minHeight: 52,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 9, fontWeight: "700", color: C.pearl, lineHeight: 13 }} numberOfLines={1}>
                  {shift.startTime}
                </Text>
                <Text style={{ fontSize: 9, color: C.mist, lineHeight: 12 }} numberOfLines={1}>
                  {shift.endTime}
                </Text>
                {shift.position && (
                  <Text style={{ fontSize: 8, color: C.mist, marginTop: 2 }} numberOfLines={1}>
                    {shift.position}
                  </Text>
                )}
                <View style={{
                  height: 4,
                  width: 4,
                  borderRadius: 2,
                  marginTop: 2,
                  alignSelf: "flex-end",
                  backgroundColor: shift.isPublished ? C.jade : C.smoke,
                }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => onAdd(dateStr)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  minHeight: 52,
                  borderWidth: 1,
                  borderColor: C.rimBright,
                  borderStyle: "dashed",
                  backgroundColor: C.surfaceHi,
                }}
                activeOpacity={0.6}
              >
                <Ionicons name="add" size={16} color={C.smoke} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Shift sheet ─────────────────────────────────────────────────────────────

function ShiftSheet({
  sheet,
  staff,
  saving,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  sheet: SheetState;
  staff: StaffMember[];
  saving: boolean;
  onChange: (update: Partial<SheetState>) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const selectedStaff = staff.find((s) => s.id === sheet.staffId);

  const inputStyle = {
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.rim,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600" as const,
    color: C.pearl,
  };

  const labelStyle = {
    fontSize: 11,
    fontWeight: "600" as const,
    color: C.smoke,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  };

  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{
            backgroundColor: C.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 40,
            gap: 16,
            borderTopWidth: 1,
            borderColor: C.rim,
          }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 4 }} />

            {/* Title */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>
                {sheet.mode === "add" ? "Add Shift" : "Edit Shift"}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={{ height: 32, width: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>

            {/* Staff picker (only for add mode) */}
            {sheet.mode === "add" ? (
              <View style={{ gap: 6 }}>
                <Text style={labelStyle}>Staff Member</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {staff.map((s) => {
                    const selected = sheet.staffId === s.id;
                    const rc = roleColor[s.role] ?? C.mist;
                    const rb = roleBg[s.role] ?? T.mist;
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => onChange({ staffId: s.id })}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 12,
                          backgroundColor: selected ? rb : C.surfaceHi,
                          borderWidth: 1,
                          borderColor: selected ? rc : C.rim,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? rc : C.mist }}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: C.surfaceHi,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: C.rim,
              }}>
                <View style={{
                  height: 36,
                  width: 36,
                  backgroundColor: roleBg[selectedStaff?.role ?? ""] ?? T.mist,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: roleColor[selectedStaff?.role ?? ""] ?? C.mist,
                }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: roleColor[selectedStaff?.role ?? ""] ?? C.mist }}>
                    {selectedStaff?.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase() ?? "?"}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{selectedStaff?.name ?? "Unknown"}</Text>
                  <Text style={{ fontSize: 12, color: C.mist }}>{sheet.date}</Text>
                </View>
              </View>
            )}

            {/* Times */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={labelStyle}>Start</Text>
                <TextInput
                  style={inputStyle}
                  value={sheet.startTime}
                  onChangeText={(v) => onChange({ startTime: v })}
                  placeholder="09:00"
                  placeholderTextColor={C.smoke}
                />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={labelStyle}>End</Text>
                <TextInput
                  style={inputStyle}
                  value={sheet.endTime}
                  onChangeText={(v) => onChange({ endTime: v })}
                  placeholder="17:00"
                  placeholderTextColor={C.smoke}
                />
              </View>
            </View>

            {/* Position chips */}
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Position</Text>
              <View className="flex-row flex-wrap gap-2">
                {POSITIONS.map((pos) => {
                  const selected = sheet.position === pos;
                  return (
                    <TouchableOpacity
                      key={pos}
                      onPress={() => onChange({ position: sheet.position === pos ? "" : pos })}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 99,
                        backgroundColor: selected ? T.gold : C.surfaceHi,
                        borderWidth: 1,
                        borderColor: selected ? C.gold : C.rim,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? C.gold : C.mist }}>
                        {pos}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Notes</Text>
              <TextInput
                style={[inputStyle, { fontWeight: "400", fontSize: 14 }]}
                value={sheet.notes}
                onChangeText={(v) => onChange({ notes: v })}
                placeholder="Optional notes…"
                placeholderTextColor={C.smoke}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Actions */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {onDelete && (
                <TouchableOpacity
                  onPress={onDelete}
                  disabled={saving}
                  style={{
                    height: 48,
                    width: 48,
                    borderRadius: 16,
                    backgroundColor: T.coral,
                    borderWidth: 1,
                    borderColor: C.coral,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={C.coral} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onSave}
                disabled={saving}
                style={[{
                  flex: 1,
                  height: 48,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                  backgroundColor: saving ? C.surfaceHi : C.gold,
                }, !saving && shadow.gold]}
              >
                {saving ? (
                  <ActivityIndicator color={C.pearl} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                    <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Shift</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Labor Analysis Modal ─────────────────────────────────────────────────────

function LaborAnalysisModal({
  from,
  to,
  weekLabel,
  onClose,
}: {
  from: string;
  to: string;
  weekLabel: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<SchedulingAnalysis>({
    queryKey: ["laborAnalysis", from, to],
    queryFn: () => getSchedulingAnalysis(from, to),
  });

  const laborColor = (pct: number) => {
    if (pct > 35) return C.coral;
    if (pct > 28) return "#f59e0b";
    return C.jade;
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: C.rim,
          gap: 12,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: C.pearl }}>Labor Analysis</Text>
            <Text style={{ fontSize: 12, color: C.mist }}>{weekLabel}</Text>
          </View>
          <Ionicons name="stats-chart-outline" size={20} color={C.goldDim} />
        </View>

        {isLoading && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
            <ActivityIndicator color={C.gold} size="large" />
            <Text style={{ color: C.mist, fontSize: 13 }}>Crunching the numbers…</Text>
          </View>
        )}

        {error && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 }}>
            <Ionicons name="alert-circle-outline" size={40} color={C.coral} />
            <Text style={{ color: C.coral, fontSize: 14, textAlign: "center" }}>
              {(error as Error).message}
            </Text>
          </View>
        )}

        {data && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>

            {/* Summary stats */}
            <View style={{
              backgroundColor: C.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: C.rim,
              overflow: "hidden",
            }}>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                  Week Summary
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {[
                  { label: "Labor %", value: `${data.summary.laborPct.toFixed(1)}%`, color: laborColor(data.summary.laborPct) },
                  { label: "Revenue", value: `$${data.summary.revenue.toLocaleString()}`, color: C.jade },
                  { label: "Sched Hours", value: `${data.summary.scheduledHours.toFixed(1)}h`, color: C.pearl },
                  { label: "Actual Hours", value: `${data.summary.actualHours.toFixed(1)}h`, color: C.pearl },
                  { label: "Sched Cost", value: `$${data.summary.scheduledLaborCost.toFixed(0)}`, color: C.mist },
                  { label: "$/Labor Hr", value: `$${data.summary.salesPerLaborHour.toFixed(0)}`, color: C.goldDim },
                ].map((stat) => (
                  <View key={stat.label} style={{
                    width: "33.33%",
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    alignItems: "center",
                    borderTopWidth: 1,
                    borderTopColor: C.rim,
                  }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: stat.color }}>{stat.value}</Text>
                    <Text style={{ fontSize: 10, color: C.smoke, marginTop: 2, textAlign: "center" }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Overtime alerts */}
            {data.overtimeAlerts.length > 0 && (
              <View style={{
                backgroundColor: "rgba(239,68,68,0.06)",
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.25)",
                padding: 14,
                gap: 10,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="warning-outline" size={16} color={C.coral} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: C.coral }}>
                    Overtime Alerts ({data.overtimeAlerts.length})
                  </Text>
                </View>
                {data.overtimeAlerts.map((alert) => (
                  <View key={alert.userId} style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    backgroundColor: C.surface,
                    borderRadius: 12,
                    padding: 10,
                  }}>
                    <View style={{
                      height: 32,
                      width: 32,
                      borderRadius: 16,
                      backgroundColor: "rgba(239,68,68,0.1)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: C.coral }}>
                        {alert.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{alert.name}</Text>
                      <Text style={{ fontSize: 11, color: C.mist }}>{alert.role}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: C.coral }}>
                        {alert.weekHours.toFixed(1)}h
                      </Text>
                      <Text style={{ fontSize: 10, color: C.coral }}>
                        +{alert.overtimeHours.toFixed(1)}h OT
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* DOW optimal staffing */}
            {data.dowOptimal.length > 0 && (
              <View style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.rim,
                padding: 14,
                gap: 10,
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                  Day-of-Week Insights
                </Text>
                {data.dowOptimal.map((dow) => (
                  <View key={dow.dow} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.mist, width: 34 }}>{dow.dow}</Text>
                    <View style={{ flex: 1 }}>
                      {/* Labor % bar */}
                      <View style={{ height: 6, backgroundColor: C.surfaceHi, borderRadius: 3, overflow: "hidden" }}>
                        <View style={{
                          height: 6,
                          width: `${Math.min(dow.avgLaborPct * 2.5, 100)}%`,
                          backgroundColor: laborColor(dow.avgLaborPct),
                          borderRadius: 3,
                        }} />
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: laborColor(dow.avgLaborPct), fontWeight: "700", width: 42, textAlign: "right" }}>
                      {dow.avgLaborPct.toFixed(1)}%
                    </Text>
                    <View style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      backgroundColor: C.surfaceHi,
                      borderRadius: 8,
                      minWidth: 60,
                      alignItems: "center",
                    }}>
                      <Text style={{ fontSize: 10, color: C.mist }}>
                        {dow.suggestedStaff} staff
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Role breakdown */}
            {data.roleBreakdown.length > 0 && (
              <View style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.rim,
                overflow: "hidden",
              }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                    By Role
                  </Text>
                </View>
                {data.roleBreakdown.map((rb, i) => (
                  <View key={rb.role} style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 1 : 0,
                    borderTopColor: C.rim,
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl, width: 80 }}>{rb.role}</Text>
                    <Text style={{ fontSize: 12, color: C.mist, flex: 1 }}>
                      {rb.headcount} ppl · {rb.actualHours.toFixed(0)}h
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: laborColor(rb.laborPct) }}>
                      {rb.laborPct.toFixed(1)}%
                    </Text>
                    <Text style={{ fontSize: 12, color: C.mist, width: 56, textAlign: "right" }}>
                      ${rb.laborCost.toFixed(0)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Daily breakdown */}
            {data.dailyAnalysis.length > 0 && (
              <View style={{
                backgroundColor: C.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: C.rim,
                overflow: "hidden",
              }}>
                <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                    Daily Breakdown
                  </Text>
                </View>
                {data.dailyAnalysis.map((day, i) => (
                  <View key={day.date} style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 1 : 0,
                    borderTopColor: C.rim,
                    gap: 8,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist, width: 40 }}>
                      {new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.pearl }}>
                        {day.actualHours.toFixed(1)}h · ${day.revenue.toFixed(0)} rev
                      </Text>
                    </View>
                    <Text style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: day.laborPct > 0 ? laborColor(day.laborPct) : C.smoke,
                    }}>
                      {day.laborPct > 0 ? `${day.laborPct.toFixed(1)}%` : "—"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
