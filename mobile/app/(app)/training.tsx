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
import {
  getTrainingAssignments, getTrainingTemplates, getFullStaff,
  createTrainingAssignment, signOffTrainingItem,
} from "@/lib/api";
import type { TrainingAssignment, TrainingTemplate } from "@/lib/api";
import { C, shadow, roleColor, roleBg } from "@/lib/theme";
import { ScreenMessage } from "@/components/ScreenMessage";
import { useManualRefresh } from "@/lib/use-manual-refresh";

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

function progressColor(pct: number) {
  if (pct === 100) return C.jade;
  if (pct >= 50) return C.gold;
  return C.coral;
}

// ─── Assignment card ──────────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  onPress,
}: {
  assignment: TrainingAssignment;
  onPress: () => void;
}) {
  const total = assignment.template.items.length;
  const done = assignment.signoffs.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const pColor = progressColor(pct);
  const rColor = roleColor[assignment.user.role] ?? C.mist;
  const rBg = roleBg[assignment.user.role] ?? "#f3f4f6";
  const overdue = assignment.dueDate && !assignment.completedAt
    ? new Date(assignment.dueDate) < new Date()
    : false;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: overdue ? C.coral + "55" : C.rim,
        overflow: "hidden",
        ...shadow.sm,
      }}
      activeOpacity={0.7}
    >
      {/* Top accent */}
      <View style={{ height: 3, backgroundColor: pColor, width: `${pct}%` }} />

      <View style={{ padding: 14, gap: 10 }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {/* Avatar */}
          <View style={{
            height: 40, width: 40, borderRadius: 20,
            backgroundColor: rBg, borderWidth: 1.5, borderColor: rColor,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: rColor }}>{initials(assignment.user.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{assignment.user.name}</Text>
            <Text style={{ fontSize: 11, color: C.mist }}>
              {assignment.template.name}
              {assignment.template.role ? ` · ${assignment.template.role}` : ""}
            </Text>
          </View>
          {assignment.completedAt ? (
            <View style={{ backgroundColor: C.jade + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.jade + "44" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.jade }}>DONE</Text>
            </View>
          ) : overdue ? (
            <View style={{ backgroundColor: C.coral + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.coral + "44" }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.coral }}>OVERDUE</Text>
            </View>
          ) : null}
        </View>

        {/* Progress */}
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 11, color: C.smoke }}>{done} / {total} items complete</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: pColor }}>{Math.round(pct)}%</Text>
          </View>
          <View style={{ height: 5, backgroundColor: C.surfaceHi, borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${pct}%`, backgroundColor: pColor, borderRadius: 3 }} />
          </View>
        </View>

        {/* Footer */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 10, color: C.smoke }}>
            Assigned by {assignment.assigner.name} · {new Date(assignment.assignedAt).toLocaleDateString()}
          </Text>
          {assignment.dueDate && !assignment.completedAt && (
            <>
              <Text style={{ fontSize: 10, color: C.smoke }}>·</Text>
              <Text style={{ fontSize: 10, color: overdue ? C.coral : C.mist }}>
                Due {new Date(assignment.dueDate).toLocaleDateString()}
              </Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Checklist Modal ──────────────────────────────────────────────────────────

function ChecklistModal({
  assignment,
  onClose,
  onUpdated,
}: {
  assignment: TrainingAssignment;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [signingOff, setSigningOff] = useState<string | null>(null);

  const signedOffIds = new Set(assignment.signoffs.map((s) => s.itemId));

  async function handleSignOff(itemId: string) {
    setSigningOff(itemId);
    try {
      await signOffTrainingItem(assignment.id, itemId);
      onUpdated();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to sign off");
    } finally {
      setSigningOff(null);
    }
  }

  const total = assignment.template.items.length;
  const done = assignment.signoffs.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const pColor = progressColor(pct);

  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
        {/* Header */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 20, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: C.rim, gap: 12,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>{assignment.template.name}</Text>
            <Text style={{ fontSize: 12, color: C.mist }}>{assignment.user.name}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: pColor }}>{Math.round(pct)}%</Text>
            <Text style={{ fontSize: 10, color: C.smoke }}>{done}/{total}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={{ height: 3, backgroundColor: C.surfaceHi }}>
          <View style={{ height: 3, width: `${pct}%`, backgroundColor: pColor }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}>
          {assignment.template.items.map((item, i) => {
            const isDone = signedOffIds.has(item.id);
            const loading = signingOff === item.id;
            const signoff = assignment.signoffs.find((s) => s.itemId === item.id);

            return (
              <View key={item.id} style={{
                backgroundColor: isDone ? C.jade + "0d" : C.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDone ? C.jade + "33" : C.rim,
                padding: 14,
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
              }}>
                {/* Number / check */}
                <TouchableOpacity
                  onPress={() => !isDone && handleSignOff(item.id)}
                  disabled={isDone || loading}
                  style={{
                    height: 28, width: 28, borderRadius: 14,
                    backgroundColor: isDone ? C.jade : C.surfaceHi,
                    borderWidth: 1.5, borderColor: isDone ? C.jade : C.rim,
                    alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 1,
                  }}
                >
                  {loading
                    ? <ActivityIndicator size="small" color={C.jade} />
                    : isDone
                    ? <Ionicons name="checkmark" size={14} color="#fff" />
                    : <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke }}>{i + 1}</Text>}
                </TouchableOpacity>

                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ fontSize: 14, fontWeight: isDone ? "500" : "600", color: isDone ? C.mist : C.pearl }}>
                    {item.title}
                  </Text>
                  {item.description && (
                    <Text style={{ fontSize: 12, color: C.smoke, lineHeight: 17 }}>{item.description}</Text>
                  )}
                  {signoff && (
                    <Text style={{ fontSize: 11, color: C.jade, marginTop: 2 }}>
                      ✓ Signed off by {signoff.manager.name} · {new Date(signoff.signedOffAt).toLocaleDateString()}
                    </Text>
                  )}
                </View>

                {!isDone && (
                  <TouchableOpacity
                    onPress={() => handleSignOff(item.id)}
                    disabled={loading}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
                      backgroundColor: C.gold + "22", borderWidth: 1, borderColor: C.gold + "55",
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.goldDim }}>Sign Off</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({
  onClose,
  onAssigned,
}: {
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: staff = [] } = useQuery({ queryKey: ["fullStaff"], queryFn: getFullStaff });
  const { data: templates = [] } = useQuery({ queryKey: ["trainingTemplates"], queryFn: getTrainingTemplates });

  const activeStaff = staff.filter((s) => s.isActive);

  async function handleAssign() {
    if (!selectedStaff || !selectedTemplate) {
      Alert.alert("Missing Info", "Select a staff member and a training template.");
      return;
    }
    setSaving(true);
    try {
      await createTrainingAssignment(selectedStaff, selectedTemplate, dueDate || undefined);
      onAssigned();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to assign training");
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
          <ScrollView
            style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center" }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Assign Training</Text>
              <TouchableOpacity onPress={onClose} style={{ height: 32, width: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>

            {/* Staff picker */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Staff Member</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {activeStaff.map((s) => {
                    const sel = selectedStaff === s.id;
                    const rc = roleColor[s.role] ?? C.mist;
                    const rb = roleBg[s.role] ?? "#f3f4f6";
                    return (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setSelectedStaff(s.id)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
                          backgroundColor: sel ? rb : C.surfaceHi,
                          borderWidth: 1.5, borderColor: sel ? rc : C.rim,
                          alignItems: "center", gap: 4, minWidth: 64,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: sel ? rc : C.mist }}>{initials(s.name)}</Text>
                        <Text style={{ fontSize: 10, color: sel ? rc : C.smoke, textAlign: "center" }} numberOfLines={1}>{s.name.split(" ")[0]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {/* Template picker */}
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Training Template</Text>
              <View style={{ gap: 6 }}>
                {templates.map((t: TrainingTemplate) => {
                  const sel = selectedTemplate === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => setSelectedTemplate(t.id)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        padding: 12, borderRadius: 12,
                        backgroundColor: sel ? C.gold + "18" : C.surfaceHi,
                        borderWidth: 1.5, borderColor: sel ? C.gold : C.rim,
                      }}
                    >
                      <View style={{
                        height: 32, width: 32, borderRadius: 10,
                        backgroundColor: sel ? C.gold : C.surface,
                        alignItems: "center", justifyContent: "center",
                        borderWidth: 1, borderColor: sel ? C.gold : C.rim,
                      }}>
                        <Ionicons name="school-outline" size={14} color={sel ? C.void : C.smoke} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: sel ? C.pearl : C.mist }}>{t.name}</Text>
                        <Text style={{ fontSize: 11, color: C.smoke }}>
                          {t.items.length} item{t.items.length !== 1 ? "s" : ""}{t.role ? ` · ${t.role}` : ""}
                        </Text>
                      </View>
                      {sel && <Ionicons name="checkmark-circle" size={18} color={C.gold} />}
                    </TouchableOpacity>
                  );
                })}
                {templates.length === 0 && (
                  <Text style={{ fontSize: 13, color: C.smoke, textAlign: "center", paddingVertical: 12 }}>
                    No training templates yet. Create them in the web app.
                  </Text>
                )}
              </View>
            </View>

            {/* Due date */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Due Date (optional)</Text>
              <TextInput
                style={{
                  backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim,
                  borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
                  fontSize: 14, color: C.pearl,
                }}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={C.smoke}
                keyboardType="numeric"
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              onPress={handleAssign}
              disabled={saving}
              style={[{
                height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center",
                flexDirection: "row", gap: 8,
                backgroundColor: saving ? C.surfaceHi : C.gold,
              }, !saving && shadow.gold]}
            >
              {saving
                ? <ActivityIndicator color={C.pearl} />
                : <>
                    <Ionicons name="school-outline" size={18} color={C.void} />
                    <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Assign Training</Text>
                  </>}
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TrainingScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const [filter, setFilter] = useState<"active" | "done" | "all">("active");
  const [selected, setSelected] = useState<TrainingAssignment | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const { data: assignments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["trainingAssignments"],
    queryFn: getTrainingAssignments,
  });

  const filtered = assignments.filter((a) => {
    if (filter === "active") return !a.completedAt;
    if (filter === "done") return !!a.completedAt;
    return true;
  });

  const activeCount = assignments.filter((a) => !a.completedAt).length;
  const overdueCount = assignments.filter((a) =>
    !a.completedAt && a.dueDate && new Date(a.dueDate) < new Date()
  ).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Training"
        subtitle={`${activeCount} active · ${overdueCount > 0 ? `${overdueCount} overdue` : "none overdue"}`}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
      />

      {/* Filter tabs */}
      <View style={{
        backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim,
        flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8,
      }}>
        {(["active", "done", "all"] as const).map((f) => {
          const active = f === filter;
          const count = f === "active" ? activeCount : f === "done" ? assignments.length - activeCount : assignments.length;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={{
                paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
                backgroundColor: active ? C.gold : C.surfaceHi,
                borderWidth: 1, borderColor: active ? C.gold : C.rim,
                flexDirection: "row", alignItems: "center", gap: 5,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: active ? C.void : C.mist }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
              <View style={{
                backgroundColor: active ? "rgba(255,255,255,0.3)" : C.rim,
                borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1,
              }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: active ? C.void : C.smoke }}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={C.gold} />
          </View>
        )}

        {!isLoading && isError && assignments.length === 0 && (
          <ScreenMessage icon="cloud-offline-outline" tone="error" title="Couldn't load training" subtitle="Check your connection and try again." actionLabel="Retry" onAction={() => refetch()} />
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <View style={{ height: 72, width: 72, borderRadius: 24, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="school-outline" size={32} color={C.smoke} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: C.pearl }}>
              {filter === "active" ? "No active assignments" : filter === "done" ? "None completed yet" : "No assignments yet"}
            </Text>
            <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", paddingHorizontal: 24 }}>
              {filter === "active"
                ? "Tap the + button to assign training to a staff member."
                : "Completed trainings will appear here."}
            </Text>
          </View>
        )}

        {filtered.map((a) => (
          <AssignmentCard key={a.id} assignment={a} onPress={() => setSelected(a)} />
        ))}
      </Animated.ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setAssignOpen(true)}
        style={[{
          position: "absolute", bottom: 32, right: 24,
          height: 56, width: 56, backgroundColor: C.gold,
          borderRadius: 28, alignItems: "center", justifyContent: "center",
        }, shadow.gold]}
      >
        <Ionicons name="add" size={28} color={C.void} />
      </TouchableOpacity>

      {/* Checklist modal */}
      {selected && (
        <ChecklistModal
          assignment={selected}
          onClose={() => setSelected(null)}
          onUpdated={async () => {
            await qc.invalidateQueries({ queryKey: ["trainingAssignments"] });
            // Refresh the selected assignment with latest data
            const fresh = (await qc.fetchQuery({
              queryKey: ["trainingAssignments"],
              queryFn: getTrainingAssignments,
            })).find((a) => a.id === selected.id);
            if (fresh) setSelected(fresh);
          }}
        />
      )}

      {/* Assign modal */}
      {assignOpen && (
        <AssignModal
          onClose={() => setAssignOpen(false)}
          onAssigned={async () => {
            await qc.invalidateQueries({ queryKey: ["trainingAssignments"] });
            setAssignOpen(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}
