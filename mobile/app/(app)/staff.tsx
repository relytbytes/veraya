import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  RefreshControl, ActivityIndicator, Alert, Switch, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getFullStaff, createStaff, patchStaff, getActiveClockIns, getStaffNotes, createStaffNote, deleteStaffNote } from "@/lib/api";
import type { StaffMember, StaffNote } from "@/lib/api";
import { C, T, shadow, roleColor, roleBg } from "@/lib/theme";
import { ScreenMessage } from "@/components/ScreenMessage";
import { useManualRefresh } from "@/lib/use-manual-refresh";

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLES = ["ADMIN", "MANAGER", "SERVER", "KITCHEN", "CASHIER"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  SERVER: "Server",
  KITCHEN: "Kitchen",
  CASHIER: "Cashier",
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function StaffScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: staff = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["fullStaff"],
    queryFn: getFullStaff,
  });

  const { data: activeClockIns = [] } = useQuery({
    queryKey: ["activeClockIns"],
    queryFn: getActiveClockIns,
    refetchInterval: 120_000,
  });

  const clockedInIds = new Set(activeClockIns.map((e) => e.userId));

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Staff"
        subtitle={`${staff.length} members`}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
      />

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />
        }
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View className="items-center py-12">
            <ActivityIndicator color={C.gold} />
          </View>
        )}
        {!isLoading && isError && staff.length === 0 && (
          <ScreenMessage icon="cloud-offline-outline" tone="error" title="Couldn't load staff" subtitle="Check your connection and try again." actionLabel="Retry" onAction={() => refetch()} />
        )}
        {!isLoading && !isError && staff.length === 0 && (
          <View className="items-center py-14 gap-3">
            <Ionicons name="people-outline" size={40} color={C.smoke} />
            <Text style={{ color: C.mist, fontSize: 14 }}>No staff members yet</Text>
          </View>
        )}
        {staff.map((member) => (
          <StaffCard
            key={member.id}
            member={member}
            expanded={expandedId === member.id}
            clockedIn={clockedInIds.has(member.id)}
            onToggle={() => toggleExpand(member.id)}
            onEdit={() => setEditMember(member)}
          />
        ))}
      </Animated.ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setAddOpen(true)}
        style={[{
          position: "absolute",
          bottom: 32,
          right: 24,
          height: 56,
          width: 56,
          backgroundColor: C.gold,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
        }, shadow.gold]}
      >
        <Ionicons name="person-add-outline" size={24} color={C.void} />
      </TouchableOpacity>

      {/* Edit sheet */}
      {editMember && (
        <EditStaffSheet
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["fullStaff"] });
            setEditMember(null);
          }}
        />
      )}

      {/* Add sheet */}
      {addOpen && (
        <AddStaffSheet
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["fullStaff"] });
            setAddOpen(false);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Staff card ───────────────────────────────────────────────────────────────

function StaffCard({
  member,
  expanded,
  clockedIn,
  onToggle,
  onEdit,
}: {
  member: StaffMember;
  expanded: boolean;
  clockedIn: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const rColor = roleColor[member.role] ?? C.mist;
  const rBg = roleBg[member.role] ?? T.mist;
  const roleLabel = ROLE_LABELS[member.role as Role] ?? member.role;
  const ini = initials(member.name);

  return (
    <View style={{
      backgroundColor: C.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: C.rim,
      overflow: "hidden",
      opacity: member.isActive ? 1 : 0.55,
      ...shadow.sm,
    }}>
      {/* Left accent bar */}
      <View style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 3,
        backgroundColor: rColor,
        borderTopLeftRadius: 18,
        borderBottomLeftRadius: 18,
      }} />

      <TouchableOpacity
        onPress={onToggle}
        style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 16, paddingVertical: 12, gap: 12 }}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <View style={{ position: "relative" }}>
          <View style={{
            height: 44,
            width: 44,
            borderRadius: 22,
            backgroundColor: rBg,
            borderWidth: 1.5,
            borderColor: rColor,
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: rColor }}>{ini}</Text>
          </View>
          {/* Clocked-in dot */}
          <View style={{
            position: "absolute",
            bottom: -1,
            right: -1,
            height: 12,
            width: 12,
            borderRadius: 6,
            backgroundColor: clockedIn ? C.jade : C.smoke,
            borderWidth: 2,
            borderColor: C.surface,
          }} />
        </View>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <View className="flex-row items-center gap-2">
            <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{member.name}</Text>
            {!member.isActive && (
              <View style={{ backgroundColor: T.mist, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99 }}>
                <Text style={{ fontSize: 9, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.5 }}>Inactive</Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            {/* Role badge */}
            <View style={{ backgroundColor: rBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: rColor }}>{roleLabel}</Text>
            </View>
            {member.hourlyRate && (
              <Text style={{ fontSize: 12, fontWeight: "700", color: C.jade }}>
                ${Number(member.hourlyRate).toFixed(2)}/hr
              </Text>
            )}
          </View>
        </View>

        {/* Clocked-in badge */}
        {clockedIn && (
          <View style={{
            backgroundColor: T.jade,
            borderWidth: 1,
            borderColor: C.jade,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
          }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.jade }}>Clocked In</Text>
          </View>
        )}

        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={C.smoke}
        />
      </TouchableOpacity>

      {/* Expanded details */}
      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, borderTopWidth: 1, borderTopColor: C.rim, gap: 12 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 11, color: C.smoke }}>Email</Text>
            <Text style={{ fontSize: 13, color: C.pearl }}>{member.email}</Text>
          </View>
          <View className="flex-row gap-4">
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11, color: C.smoke }}>Status</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: member.isActive ? C.jade : C.coral }}>
                {member.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11, color: C.smoke }}>Clock Status</Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: clockedIn ? C.jade : C.smoke }}>
                {clockedIn ? "Clocked In" : "Off Clock"}
              </Text>
            </View>
            {member.employmentType === "SALARY" && member.annualSalary != null ? (
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 11, color: C.smoke }}>Annual Salary</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.jade }}>
                  ${Number(member.annualSalary).toLocaleString("en-US")}/yr
                </Text>
              </View>
            ) : member.hourlyRate ? (
              <View style={{ gap: 2 }}>
                <Text style={{ fontSize: 11, color: C.smoke }}>Hourly Rate</Text>
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.jade }}>
                  ${Number(member.hourlyRate).toFixed(2)}/hr
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onEdit}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: C.surfaceHi,
              borderWidth: 1,
              borderColor: C.rimBright,
              borderRadius: 12,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="create-outline" size={16} color={C.mist} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: C.mist }}>Edit Member</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Edit sheet ───────────────────────────────────────────────────────────────

function EditStaffSheet({
  member,
  onClose,
  onSaved,
}: {
  member: StaffMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<Role>(member.role as Role);
  const [hourlyRate, setHourlyRate] = useState(
    member.hourlyRate ? String(Number(member.hourlyRate)) : ""
  );
  const [employmentType, setEmploymentType] = useState(member.employmentType ?? "HOURLY");
  const [annualSalary, setAnnualSalary] = useState(
    member.annualSalary ? String(Number(member.annualSalary)) : ""
  );
  const [managerPin, setManagerPin] = useState("");
  const [isActive, setIsActive] = useState(member.isActive);
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data: notes = [], refetch: refetchNotes } = useQuery({
    queryKey: ["staffNotes", member.id],
    queryFn: () => getStaffNotes(member.id),
  });

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await createStaffNote(member.id, noteText.trim());
      setNoteText("");
      refetchNotes();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(noteId: string) {
    Alert.alert("Delete Note", "Remove this note permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteStaffNote(member.id, noteId);
            refetchNotes();
          } catch (e: unknown) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete note");
          }
        },
      },
    ]);
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Error", "Name is required."); return; }
    setSaving(true);
    try {
      await patchStaff(member.id, {
        name: name.trim(),
        role,
        isActive,
        employmentType,
        hourlyRate: employmentType === "HOURLY" && hourlyRate.trim() ? Number(hourlyRate) : null,
        annualSalary: employmentType === "SALARY" && annualSalary.trim() ? Number(annualSalary) : null,
        ...(managerPin.trim() ? { managerPin: managerPin.trim() } : {}),
      });
      onSaved();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet onClose={onClose} title="Edit Staff Member">
      <View style={{ gap: 16 }}>
        {/* Name */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Name</Text>
          <TextInput
            style={{
              backgroundColor: C.surfaceHi,
              borderWidth: 1,
              borderColor: C.rim,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 15,
              color: C.pearl,
            }}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={C.smoke}
          />
        </View>

        {/* Role */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Role</Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => {
              const selected = role === r;
              const rc = roleColor[r] ?? C.mist;
              const rb = roleBg[r] ?? T.mist;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 99,
                    backgroundColor: selected ? rb : C.surfaceHi,
                    borderWidth: 1,
                    borderColor: selected ? rc : C.rim,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? rc : C.mist }}>
                    {ROLE_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Employment type */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Employment Type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["HOURLY", "SALARY"] as const).map((t) => {
              const sel = employmentType === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setEmploymentType(t)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: sel ? T.gold : C.surfaceHi, borderWidth: 1, borderColor: sel ? C.gold : C.rim }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: sel ? C.gold : C.mist }}>{t === "HOURLY" ? "Hourly" : "Salary"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pay rate — hourly or salary depending on type */}
        {employmentType === "HOURLY" ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Hourly Rate</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
              <Text style={{ paddingLeft: 16, color: C.jade, fontWeight: "700" }}>$</Text>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                placeholder="0.00"
                placeholderTextColor={C.smoke}
                keyboardType="decimal-pad"
              />
              <Text style={{ paddingRight: 16, fontSize: 13, color: C.mist }}>/hr</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Annual Salary</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
              <Text style={{ paddingLeft: 16, color: C.jade, fontWeight: "700" }}>$</Text>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={annualSalary}
                onChangeText={setAnnualSalary}
                placeholder="0"
                placeholderTextColor={C.smoke}
                keyboardType="number-pad"
              />
              <Text style={{ paddingRight: 16, fontSize: 13, color: C.mist }}>/yr</Text>
            </View>
            <Text style={{ fontSize: 11, color: C.smoke }}>Salaried staff are excluded from hourly labor and counted as fixed cost in the P&L.</Text>
          </View>
        )}

        {/* Manager PIN — only relevant for manager/admin POS access */}
        {(role === "MANAGER" || role === "ADMIN") && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Manager PIN</Text>
            <TextInput
              style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: C.pearl, letterSpacing: 4 }}
              value={managerPin}
              onChangeText={(t) => setManagerPin(t.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder={member.hasManagerPin ? "•••• (set — type to change)" : "Set a 4–6 digit PIN"}
              placeholderTextColor={C.smoke}
              keyboardType="number-pad"
              secureTextEntry
            />
            <Text style={{ fontSize: 11, color: C.smoke }}>Used to approve comps, voids, and check reopens on the POS.</Text>
          </View>
        )}

        {/* Active toggle */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: C.surfaceHi,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: C.rim,
        }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>Active</Text>
            <Text style={{ fontSize: 12, color: C.mist }}>Inactive staff cannot log in</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: C.gold, false: C.rim }}
            thumbColor={C.pearl}
          />
        </View>

        {/* Notes */}
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
            Manager Notes
          </Text>

          {/* Existing notes */}
          {notes.length > 0 && (
            <View style={{ gap: 6 }}>
              {notes.map((note: StaffNote) => (
                <View
                  key={note.id}
                  style={{
                    backgroundColor: C.surfaceHi,
                    borderWidth: 1,
                    borderColor: C.rim,
                    borderRadius: 12,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.pearl, lineHeight: 19 }}>{note.body}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 11, color: C.smoke }}>
                      {note.author.name} · {new Date(note.createdAt).toLocaleDateString()}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteNote(note.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={13} color={C.coral} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Add note input */}
          <View style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "flex-end",
          }}>
            <TextInput
              style={{
                flex: 1,
                backgroundColor: C.surfaceHi,
                borderWidth: 1,
                borderColor: C.rim,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 13,
                color: C.pearl,
                minHeight: 40,
              }}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a note…"
              placeholderTextColor={C.smoke}
              multiline
              returnKeyType="default"
            />
            <TouchableOpacity
              onPress={handleAddNote}
              disabled={savingNote || !noteText.trim()}
              style={{
                height: 40,
                width: 40,
                borderRadius: 12,
                backgroundColor: noteText.trim() ? C.gold : C.surfaceHi,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {savingNote
                ? <ActivityIndicator size="small" color={C.pearl} />
                : <Ionicons name="send" size={16} color={noteText.trim() ? C.void : C.smoke} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: C.rim }} />

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[{
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
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── Add sheet ────────────────────────────────────────────────────────────────

function AddStaffSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("SERVER");
  const [hourlyRate, setHourlyRate] = useState("");
  const [employmentType, setEmploymentType] = useState("HOURLY");
  const [annualSalary, setAnnualSalary] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Error", "Name, email, and password are required.");
      return;
    }
    setSaving(true);
    try {
      await createStaff({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
        employmentType,
        hourlyRate: employmentType === "HOURLY" && hourlyRate.trim() ? Number(hourlyRate) : undefined,
        annualSalary: employmentType === "SALARY" && annualSalary.trim() ? Number(annualSalary) : undefined,
      });
      onSaved();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create staff");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.rim,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
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
    <BottomSheet onClose={onClose} title="Add Staff Member">
      <View style={{ gap: 16 }}>
        {/* Name */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Full Name *</Text>
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={setName}
            placeholder="Jane Smith"
            placeholderTextColor={C.smoke}
            autoFocus
          />
        </View>

        {/* Email */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Email *</Text>
          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            placeholder="jane@example.com"
            placeholderTextColor={C.smoke}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Password */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Password *</Text>
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder="Temporary password"
            placeholderTextColor={C.smoke}
            secureTextEntry
          />
        </View>

        {/* Role */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Role</Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => {
              const selected = role === r;
              const rc = roleColor[r] ?? C.mist;
              const rb = roleBg[r] ?? T.mist;
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setRole(r)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 99,
                    backgroundColor: selected ? rb : C.surfaceHi,
                    borderWidth: 1,
                    borderColor: selected ? rc : C.rim,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: selected ? rc : C.mist }}>
                    {ROLE_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Employment type */}
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>Employment Type</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["HOURLY", "SALARY"] as const).map((t) => {
              const sel = employmentType === t;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => setEmploymentType(t)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", backgroundColor: sel ? T.gold : C.surfaceHi, borderWidth: 1, borderColor: sel ? C.gold : C.rim }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: sel ? C.gold : C.mist }}>{t === "HOURLY" ? "Hourly" : "Salary"}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Pay rate */}
        {employmentType === "HOURLY" ? (
          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>Hourly Rate</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
              <Text style={{ paddingLeft: 16, color: C.jade, fontWeight: "700" }}>$</Text>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                placeholder="0.00"
                placeholderTextColor={C.smoke}
                keyboardType="decimal-pad"
              />
              <Text style={{ paddingRight: 16, fontSize: 13, color: C.mist }}>/hr</Text>
            </View>
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Text style={labelStyle}>Annual Salary</Text>
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
              <Text style={{ paddingLeft: 16, color: C.jade, fontWeight: "700" }}>$</Text>
              <TextInput
                style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 12, fontSize: 15, color: C.pearl }}
                value={annualSalary}
                onChangeText={setAnnualSalary}
                placeholder="0"
                placeholderTextColor={C.smoke}
                keyboardType="number-pad"
              />
              <Text style={{ paddingRight: 16, fontSize: 13, color: C.mist }}>/yr</Text>
            </View>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[{
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
              <Ionicons name="person-add-outline" size={18} color={C.void} />
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Add Staff Member</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

// ─── Shared bottom sheet wrapper ─────────────────────────────────────────────

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 12 }} />
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={{ height: 32, width: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
              >
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>
            {children}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
