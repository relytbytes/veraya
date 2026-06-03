import { useState, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  RefreshControl, ActivityIndicator, Alert, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getActiveClockIns, clockAction, getFullStaff, getClockHistory, editClockEntry } from "@/lib/api";
import type { ClockEntryWithUser, StaffMember, ClockEntry } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

function formatElapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDuration(clockIn: string, clockOut: string): string {
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function TimeClockScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  useNow();

  const today = toDateStr(new Date());

  const { data: activeClockIns = [], isLoading: loadingActive, refetch: refetchActive } = useQuery({
    queryKey: ["activeClockIns"],
    queryFn: getActiveClockIns,
    refetchInterval: 120_000,
  });

  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["fullStaff"],
    queryFn: getFullStaff,
  });

  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["clockHistory", today],
    queryFn: () => getClockHistory("", today, today),
    refetchInterval: 120_000,
  });

  const [clockingId, setClockingId] = useState<string | null>(null);
  const [notesModal, setNotesModal] = useState<{ userId: string; action: "IN" | "OUT"; name: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [editEntry, setEditEntry] = useState<(ClockEntry & { user?: { name: string } }) | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const clockedInIds = new Set(activeClockIns.map((e) => e.userId));
  const activeStaff = staff.filter((s) => s.isActive);
  const offClockStaff = activeStaff.filter((s) => !clockedInIds.has(s.id));

  function openClockAction(userId: string, action: "IN" | "OUT", name: string) {
    setNotes("");
    setNotesModal({ userId, action, name });
  }

  async function submitClockAction() {
    if (!notesModal) return;
    setSubmitting(true);
    try {
      await clockAction({ userId: notesModal.userId, action: notesModal.action, notes: notes.trim() || undefined });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["activeClockIns"] }),
        qc.invalidateQueries({ queryKey: ["clockHistory"] }),
      ]);
      setNotesModal(null);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Clock action failed");
    } finally {
      setSubmitting(false);
      setClockingId(null);
    }
  }

  async function refetchAll() { await Promise.all([refetchActive(), refetchHistory()]); }

  const isLoading = loadingActive || loadingStaff;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Time Clock"
        subtitle={`${activeClockIns.length} clocked in`}
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
      />

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetchAll)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View style={{ alignItems: "center", paddingVertical: 48 }}>
            <ActivityIndicator color={C.gold} />
          </View>
        )}

        {/* Currently clocked in */}
        {!isLoading && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Clocked In ({activeClockIns.length})
            </Text>
            {activeClockIns.length === 0 ? (
              <View style={{
                backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim,
                padding: 24, alignItems: "center", gap: 8,
              }}>
                <Ionicons name="timer-outline" size={28} color={C.smoke} />
                <Text style={{ fontSize: 13, color: C.mist }}>No one is clocked in</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {activeClockIns.map((entry) => (
                  <ClockedInCard
                    key={entry.id}
                    entry={entry}
                    loading={clockingId === entry.userId}
                    onClockOut={() => openClockAction(entry.userId, "OUT", entry.user.name)}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Off-clock staff */}
        {!isLoading && offClockStaff.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Clock In
            </Text>
            <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
              {offClockStaff.map((member, i) => (
                <StaffClockRow
                  key={member.id}
                  member={member}
                  last={i === offClockStaff.length - 1}
                  loading={clockingId === member.id}
                  onClockIn={() => openClockAction(member.id, "IN", member.name)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Today's history */}
        {!isLoading && history.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>
              Today's History
            </Text>
            <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
              {history.map((entry, i) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry as ClockEntry & { user?: { name: string } }}
                  staff={staff}
                  last={i === history.length - 1}
                  onEdit={() => setEditEntry(entry as ClockEntry & { user?: { name: string } })}
                />
              ))}
            </View>
          </View>
        )}
      </Animated.ScrollView>

      {/* Notes modal */}
      {notesModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setNotesModal(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
            activeOpacity={1}
            onPress={() => setNotesModal(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={{
                backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
                paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16,
                borderTopWidth: 1, borderTopColor: C.rim,
              }}>
                <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 4 }} />
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>
                      Clock {notesModal.action === "IN" ? "In" : "Out"}
                    </Text>
                    <Text style={{ fontSize: 13, color: C.mist, marginTop: 2 }}>{notesModal.name}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setNotesModal(null)}
                    style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name="close" size={16} color={C.mist} />
                  </TouchableOpacity>
                </View>

                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Notes (optional)
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim,
                      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
                      fontSize: 14, color: C.pearl,
                    }}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Any notes for this clock entry…"
                    placeholderTextColor={C.smoke}
                    multiline
                    numberOfLines={2}

                  />
                </View>

                <TouchableOpacity
                  onPress={submitClockAction}
                  disabled={submitting}
                  style={{
                    height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center",
                    flexDirection: "row", gap: 8,
                    backgroundColor: submitting ? C.surfaceHi : notesModal.action === "IN" ? C.jade : C.coral,
                    ...shadow.sm,
                  }}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={notesModal.action === "IN" ? "log-in-outline" : "log-out-outline"}
                        size={18} color="#fff"
                      />
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                        Confirm Clock {notesModal.action === "IN" ? "In" : "Out"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {editEntry && (
        <EditPunchModal
          entry={editEntry}
          name={editEntry.user?.name ?? staff.find((s) => s.id === editEntry.userId)?.name ?? "Staff"}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); refetchAll(); }}
        />
      )}
    </SafeAreaView>
  );
}

function ClockedInCard({ entry, loading, onClockOut }: { entry: ClockEntryWithUser; loading: boolean; onClockOut: () => void }) {
  const ini = entry.user.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderLeftWidth: 3,
      borderColor: C.rim, borderLeftColor: C.jade,
      paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: "row", alignItems: "center", gap: 12, ...shadow.sm,
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade,
        alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.jade }}>{ini}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{entry.user.name}</Text>
        <Text style={{ fontSize: 11, color: C.jade, fontWeight: "600", marginTop: 2, fontVariant: ["tabular-nums"] }}>
          {formatTime(entry.clockIn)} · {formatElapsed(entry.clockIn)}
        </Text>
        {entry.notes && (
          <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }} numberOfLines={1}>{entry.notes}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onClockOut}
        disabled={loading}
        style={{
          backgroundColor: T.coral, borderWidth: 1, borderColor: C.coral,
          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={C.coral} />
        ) : (
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.coral }}>Clock Out</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function StaffClockRow({ member, last, loading, onClockIn }: { member: StaffMember; last: boolean; loading: boolean; onClockIn: () => void }) {
  const ini = member.name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
  return (
    <View style={{
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 12, gap: 12,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: C.rim,
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: T.gold, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 11, fontWeight: "700", color: C.gold }}>{ini}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>{member.name}</Text>
        <Text style={{ fontSize: 11, color: C.mist }}>{member.role}</Text>
      </View>
      <TouchableOpacity
        onPress={onClockIn}
        disabled={loading}
        style={{
          backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade,
          paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={C.jade} />
        ) : (
          <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade }}>Clock In</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function HistoryRow({ entry, staff, last, onEdit }: { entry: ClockEntry & { user?: { name: string } }; staff: StaffMember[]; last: boolean; onEdit: () => void }) {
  const name = entry.user?.name ?? staff.find((s) => s.id === entry.userId)?.name ?? "Unknown";
  const duration = entry.clockOut ? formatDuration(entry.clockIn, entry.clockOut) : "—";
  return (
    <View style={{
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 12, gap: 12,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: C.rim,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>{name}</Text>
        <Text style={{ fontSize: 11, color: C.mist, marginTop: 2 }}>
          {formatTime(entry.clockIn)}{entry.clockOut ? ` → ${formatTime(entry.clockOut)}` : ""}
        </Text>
        {entry.notes && (
          <Text style={{ fontSize: 11, color: C.smoke, marginTop: 2 }} numberOfLines={1}>{entry.notes}</Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{duration}</Text>
        <Text style={{ fontSize: 10, color: C.smoke }}>total</Text>
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ padding: 4 }}>
        <Ionicons name="create-outline" size={17} color={C.smoke} />
      </TouchableOpacity>
    </View>
  );
}

// ── Manager punch edit (reason mandatory, audited server-side) ──────────────────
function toHHMM(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function applyTime(baseISO: string, hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const d = new Date(baseISO);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

function EditPunchModal({ entry, name, onClose, onSaved }: {
  entry: ClockEntry; name: string; onClose: () => void; onSaved: () => void;
}) {
  const [inT, setInT] = useState(toHHMM(entry.clockIn));
  const [outT, setOutT] = useState(entry.clockOut ? toHHMM(entry.clockOut) : "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!reason.trim()) { Alert.alert("Reason required", "Enter why this punch is being edited."); return; }
    const clockIn = applyTime(entry.clockIn, inT);
    if (!clockIn) { Alert.alert("Invalid time", "Clock-in must be HH:MM (24-hour)."); return; }
    let clockOut: string | null | undefined;
    if (outT.trim()) {
      clockOut = applyTime(entry.clockOut ?? entry.clockIn, outT);
      if (!clockOut) { Alert.alert("Invalid time", "Clock-out must be HH:MM (24-hour)."); return; }
    }
    setSaving(true);
    try {
      await editClockEntry(entry.id, { clockIn, ...(clockOut !== undefined ? { clockOut } : {}), reason: reason.trim() });
      onSaved();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save edit");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = { backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl } as const;
  const labelStyle = { fontSize: 10, fontWeight: "700" as const, color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" as const };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16, borderTopWidth: 1, borderTopColor: C.rim }}>
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center" }} />
            <View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>Edit Punch</Text>
              <Text style={{ fontSize: 13, color: C.mist, marginTop: 2 }}>{name} · {new Date(entry.clockIn).toLocaleDateString()}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={labelStyle}>Clock In (HH:MM)</Text>
                <TextInput style={fieldStyle} value={inT} onChangeText={setInT} placeholder="09:00" placeholderTextColor={C.smoke} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={labelStyle}>Clock Out (HH:MM)</Text>
                <TextInput style={fieldStyle} value={outT} onChangeText={setOutT} placeholder="—" placeholderTextColor={C.smoke} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={labelStyle}>Reason (required)</Text>
              <TextInput style={[fieldStyle, { minHeight: 60 }]} value={reason} onChangeText={setReason} placeholder="e.g. Forgot to clock out; left at 10pm" placeholderTextColor={C.smoke} multiline />
            </View>
            <TouchableOpacity onPress={save} disabled={saving} style={{ height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: C.gold, opacity: saving ? 0.6 : 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.void }}>{saving ? "Saving…" : "Save Edit"}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
