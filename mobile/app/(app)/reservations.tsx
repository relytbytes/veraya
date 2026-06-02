import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getReservations,
  createReservation,
  patchReservation,
  deleteReservation,
  searchCustomers,
  type Reservation,
  type Customer,
} from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  // Use local date, not UTC — prevents rollover at late-night hours
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDisplay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatDayShort(ymd: string): { day: string; num: string } {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: date.toLocaleDateString("en-US", { weekday: "short" }),
    num: String(d),
  };
}

// ── Status config ─────────────────────────────────────────────────────────────

type StatusKey = "PENDING" | "CONFIRMED" | "SEATED" | "CANCELLED" | "NO_SHOW";

const STATUS_CONFIG: Record<StatusKey, { color: string; tint: string; label: string; bar: string }> = {
  PENDING:   { color: C.ember,  tint: T.ember,  label: "Pending",   bar: C.ember  },
  CONFIRMED: { color: C.jade,   tint: T.jade,   label: "Confirmed", bar: C.jade   },
  SEATED:    { color: C.sky,    tint: T.sky,    label: "Seated",    bar: C.sky    },
  CANCELLED: { color: C.smoke,  tint: T.mist,   label: "Cancelled", bar: C.smoke  },
  NO_SHOW:   { color: C.coral,  tint: T.coral,  label: "No Show",   bar: C.coral  },
};

const ALL_STATUSES = ["All", "Pending", "Confirmed", "Seated", "Cancelled"] as const;
type FilterStatus = (typeof ALL_STATUSES)[number];

const STATUS_FILTER_MAP: Record<FilterStatus, string | null> = {
  All: null,
  Pending: "PENDING",
  Confirmed: "CONFIRMED",
  Seated: "SEATED",
  Cancelled: "CANCELLED",
};

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ReservationsScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const today = toYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("All");
  const [detailRes, setDetailRes] = useState<Reservation | null>(null);
  const [showNew, setShowNew] = useState(false);

  const qc = useQueryClient();

  const { data: reservations = [], isLoading, refetch } = useQuery({
    queryKey: ["reservations", selectedDate],
    queryFn: () => getReservations(selectedDate),
    refetchInterval: 60_000,
  });

  // Build 14-day strip starting 3 days before today
  const dateStrip = useMemo(() => {
    const base = new Date(today.split("-")[0] as unknown as number, parseInt(today.split("-")[1]) - 1, parseInt(today.split("-")[2]));
    return Array.from({ length: 14 }, (_, i) => toYMD(addDays(base, i - 3)));
  }, [today]);

  // Filter by status
  const filtered = useMemo(() => {
    const statusFilter = STATUS_FILTER_MAP[filterStatus];
    if (!statusFilter) return reservations;
    return reservations.filter((r) => r.status === statusFilter);
  }, [reservations, filterStatus]);

  // Summary stats (active only)
  const stats = useMemo(() => {
    const totalCovers = reservations
      .filter((r) => r.status === "PENDING" || r.status === "CONFIRMED")
      .reduce((s, r) => s + r.partySize, 0);
    const confirmed = reservations.filter((r) => r.status === "CONFIRMED").length;
    const pending = reservations.filter((r) => r.status === "PENDING").length;
    return { totalCovers, confirmed, pending };
  }, [reservations]);

  // Group filtered reservations by time
  const grouped = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of filtered) {
      const list = map.get(r.time) ?? [];
      list.push(r);
      map.set(r.time, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["reservations", selectedDate] });
  }, [qc, selectedDate]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Reservations"
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        right={
          <TouchableOpacity
            onPress={() => setShowNew(true)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, ...shadow.gold }}
          >
            <Ionicons name="add" size={16} color={C.void} />
            <Text style={{ color: C.void, fontWeight: "700", fontSize: 13 }}>New</Text>
          </TouchableOpacity>
        }
      />

      {/* Date navigation strip */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim, paddingHorizontal: 20 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 12, paddingTop: 12 }}
        >
          {dateStrip.map((d) => {
            const { day, num } = formatDayShort(d);
            const isToday = d === today;
            const isSelected = d === selectedDate;
            const bgColor = isSelected ? C.gold : isToday ? C.rimBright : "transparent";
            const dayColor = isSelected ? C.void : C.mist;
            const numColor = isSelected ? C.void : C.pearl;
            return (
              <TouchableOpacity
                key={d}
                onPress={() => setSelectedDate(d)}
                style={{
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  minWidth: 52,
                  backgroundColor: bgColor,
                  borderWidth: isToday && !isSelected ? 1 : 0,
                  borderColor: C.rimBright,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2, color: dayColor }}>{day}</Text>
                <Text style={{ fontSize: 16, fontWeight: "700", color: numColor, marginTop: 2 }}>{num}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Stats bar */}
      <View style={{ flexDirection: "row", backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim, paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
        <StatChip label="Covers" value={stats.totalCovers} color={C.gold} />
        <View style={{ width: 1, backgroundColor: C.rim }} />
        <StatChip label="Confirmed" value={stats.confirmed} color={C.jade} />
        <View style={{ width: 1, backgroundColor: C.rim }} />
        <StatChip label="Pending" value={stats.pending} color={C.ember} />
      </View>

      {/* Status filter chips */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim, paddingHorizontal: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
          {ALL_STATUSES.map((s) => {
            const active = filterStatus === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setFilterStatus(s)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  borderRadius: 20,
                  backgroundColor: active ? C.gold : C.surfaceHi,
                  borderWidth: 1,
                  borderColor: active ? C.gold : C.rim,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "600", color: active ? C.void : C.mist }}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Reservation list */}
      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View className="items-center py-16">
            <ActivityIndicator color={C.gold} />
          </View>
        )}

        {!isLoading && filtered.length === 0 && (
          <View className="items-center py-16" style={{ gap: 12 }}>
            <View style={{ height: 64, width: 64, borderRadius: 20, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="calendar-outline" size={30} color={C.smoke} />
            </View>
            <Text style={{ color: C.mist, fontWeight: "500" }}>No reservations for {formatDisplay(selectedDate)}</Text>
            <TouchableOpacity
              onPress={() => setShowNew(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: T.gold, borderRadius: 12, borderWidth: 1, borderColor: C.goldDim }}
            >
              <Ionicons name="add" size={14} color={C.gold} />
              <Text style={{ color: C.gold, fontWeight: "600", fontSize: 13 }}>Add Reservation</Text>
            </TouchableOpacity>
          </View>
        )}

        {grouped.map(([time, group]) => (
          <View key={time} style={{ gap: 8 }}>
            <View className="flex-row items-center" style={{ gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>{formatTime(time)}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
              <Text style={{ fontSize: 11, color: C.smoke }}>{group.length} {group.length === 1 ? "party" : "parties"}</Text>
            </View>
            <View style={{ gap: 8 }}>
              {group.map((r) => (
                <ReservationCard key={r.id} reservation={r} onPress={() => setDetailRes(r)} />
              ))}
            </View>
          </View>
        ))}
      </Animated.ScrollView>

      {/* Detail / Edit sheet */}
      {detailRes && (
        <DetailSheet
          reservation={detailRes}
          onClose={() => setDetailRes(null)}
          onUpdated={(updated) => {
            setDetailRes(updated);
            invalidate();
          }}
          onDeleted={() => {
            setDetailRes(null);
            invalidate();
          }}
        />
      )}

      {/* New reservation sheet */}
      {showNew && (
        <NewReservationSheet
          defaultDate={selectedDate}
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            invalidate();
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: C.smoke, marginTop: 2, textTransform: "uppercase", letterSpacing: 1.2 }}>{label}</Text>
    </View>
  );
}

// ── Time formatter ────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// ── Reservation card ──────────────────────────────────────────────────────────

function ReservationCard({ reservation: r, onPress }: { reservation: Reservation; onPress: () => void }) {
  const st = STATUS_CONFIG[r.status as StatusKey] ?? STATUS_CONFIG.PENDING;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: C.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: C.rim,
        flexDirection: "row",
        overflow: "hidden",
        ...shadow.sm,
      }}
    >
      {/* Left accent bar */}
      <View style={{ width: 4, backgroundColor: st.bar }} />

      <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
          <View style={{ flex: 1 }}>
            <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{r.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.surfaceHi, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                <Ionicons name="people-outline" size={11} color={C.mist} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: C.mist }}>{r.partySize}</Text>
              </View>
              {r.notes ? (
                <Ionicons name="document-text-outline" size={13} color={C.smoke} />
              ) : null}
            </View>

            <View className="flex-row flex-wrap items-center" style={{ gap: 12, marginTop: 6 }}>
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Ionicons name="time-outline" size={12} color={C.smoke} />
                <Text style={{ fontSize: 12, color: C.mist }}>{formatTime(r.time)}</Text>
              </View>
              {r.phone ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${r.phone}`)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <Ionicons name="call-outline" size={12} color={C.gold} />
                  <Text style={{ fontSize: 12, color: C.gold, fontWeight: "500" }}>{r.phone}</Text>
                </TouchableOpacity>
              ) : null}
              {r.table ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="grid-outline" size={12} color={C.smoke} />
                  <Text style={{ fontSize: 12, color: C.mist }}>Table {r.table.number}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Status badge */}
          <View style={{ backgroundColor: st.tint, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: st.color }}>{st.label}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Detail / Edit sheet ───────────────────────────────────────────────────────

function DetailSheet({
  reservation,
  onClose,
  onUpdated,
  onDeleted,
}: {
  reservation: Reservation;
  onClose: () => void;
  onUpdated: (r: Reservation) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(reservation.name);
  const [time, setTime] = useState(reservation.time);
  const [partySize, setPartySize] = useState(reservation.partySize);
  const [phone, setPhone] = useState(reservation.phone ?? "");
  const [email, setEmail] = useState(reservation.email ?? "");
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Customer lookup (edit mode)
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState<Customer[]>([]);
  const [linkedCustomer, setLinkedCustomer] = useState<{ id: string; name: string; phone: string | null; visitCount: number; loyaltyPoints: number } | null>(reservation.customer ?? null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCustomerSearch(val: string) {
    setCustomerQuery(val);
    setLinkedCustomer(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setCustomerMatches([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const hits = await searchCustomers(val.trim());
        setCustomerMatches(hits.slice(0, 5));
      } catch { setCustomerMatches([]); }
    }, 350);
  }

  function selectCustomer(c: Customer) {
    setLinkedCustomer(c);
    setCustomerQuery(c.name);
    setCustomerMatches([]);
    setName(c.name);
    if (c.phone) setPhone(c.phone);
    if (c.email) setEmail(c.email);
  }

  function clearCustomer() {
    setLinkedCustomer(null);
    setCustomerQuery("");
    setCustomerMatches([]);
  }

  const st = STATUS_CONFIG[reservation.status as StatusKey] ?? STATUS_CONFIG.PENDING;

  async function handleStatusAction(status: string) {
    setSaving(true);
    try {
      const updated = await patchReservation(reservation.id, { status });
      onUpdated(updated);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Required", "Name is required."); return; }
    const timeRegex = /^\d{1,2}:\d{2}$/;
    if (!timeRegex.test(time.trim())) { Alert.alert("Invalid", "Time must be HH:MM format."); return; }
    setSaving(true);
    try {
      const updated = await patchReservation(reservation.id, {
        name: name.trim(),
        time: time.trim(),
        partySize,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || undefined,
        customerId: linkedCustomer?.id ?? null,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete Reservation",
      `Delete reservation for ${reservation.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteReservation(reservation.id);
              onDeleted();
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete");
            }
          },
        },
      ]
    );
  }

  return (
    <Modal
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <TouchableOpacity activeOpacity={1}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, maxHeight: "90%" }}>
            {/* Drag handle */}
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header row */}
              <View className="flex-row items-start justify-between" style={{ marginBottom: 16, gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: C.pearl }}>{reservation.name}</Text>
                  <Text style={{ fontSize: 13, color: C.mist, marginTop: 4 }}>
                    {formatTime(reservation.time)} · {reservation.partySize} {reservation.partySize === 1 ? "guest" : "guests"}
                  </Text>
                </View>
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View style={{ backgroundColor: st.tint, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: st.color }}>{st.label}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: C.surfaceHi }}
                  >
                    <Ionicons name="close" size={16} color={C.mist} />
                  </TouchableOpacity>
                </View>
              </View>

              {!editing ? (
                /* View mode */
                <View style={{ gap: 12 }}>
                  {linkedCustomer && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#0a2218", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.jade }}>
                      <Ionicons name="person-circle-outline" size={20} color={C.jade} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: C.jade }}>{linkedCustomer.name}</Text>
                        <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }}>{linkedCustomer.visitCount} visits · {linkedCustomer.loyaltyPoints} pts</Text>
                      </View>
                    </View>
                  )}
                  <InfoRow icon="calendar-outline" label="Date" value={formatDisplay(reservation.date)} />
                  <InfoRow icon="time-outline" label="Time" value={formatTime(reservation.time)} />
                  <InfoRow icon="people-outline" label="Party size" value={String(reservation.partySize)} />
                  {reservation.phone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${reservation.phone}`)}>
                      <InfoRow icon="call-outline" label="Phone" value={reservation.phone} highlight />
                    </TouchableOpacity>
                  ) : null}
                  {reservation.email ? (
                    <InfoRow icon="mail-outline" label="Email" value={reservation.email} />
                  ) : null}
                  {reservation.table ? (
                    <InfoRow icon="grid-outline" label="Table" value={`Table ${reservation.table.number}`} />
                  ) : null}
                  {reservation.notes ? (
                    <View style={{ backgroundColor: C.surfaceHi, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.rim }}>
                      <View className="flex-row items-center" style={{ gap: 6, marginBottom: 6 }}>
                        <Ionicons name="document-text-outline" size={13} color={C.smoke} />
                        <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Notes</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: C.pearl }}>{reservation.notes}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => setEditing(true)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: C.rim, borderRadius: 14, paddingVertical: 12, marginTop: 8, backgroundColor: C.surfaceHi }}
                  >
                    <Ionicons name="create-outline" size={16} color={C.mist} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.mist }}>Edit Details</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* Edit mode */
                <View style={{ gap: 16 }}>
                  {/* Customer lookup */}
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Link to CRM</Text>
                    {linkedCustomer ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#0a2218", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.jade }}>
                        <Ionicons name="person-circle-outline" size={20} color={C.jade} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: C.jade }}>{linkedCustomer.name}</Text>
                          <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }}>{linkedCustomer.visitCount} visits · {linkedCustomer.loyaltyPoints} pts</Text>
                        </View>
                        <TouchableOpacity onPress={clearCustomer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color={C.smoke} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: C.rim, paddingHorizontal: 14 }}>
                          <Ionicons name="search-outline" size={14} color={C.smoke} style={{ marginRight: 8 }} />
                          <TextInput
                            value={customerQuery}
                            onChangeText={handleCustomerSearch}
                            placeholder="Search customer…"
                            placeholderTextColor={C.smoke}
                            style={{ flex: 1, paddingVertical: 12, fontSize: 14, color: C.pearl }}
                          />
                        </View>
                        {customerMatches.length > 0 && (
                          <View style={{ backgroundColor: C.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: C.rim, marginTop: 4, overflow: "hidden" }}>
                            {customerMatches.map((c, i) => (
                              <TouchableOpacity
                                key={c.id}
                                onPress={() => selectCustomer(c)}
                                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < customerMatches.length - 1 ? 1 : 0, borderColor: C.rim, gap: 10 }}
                              >
                                <Ionicons name="person-outline" size={14} color={C.smoke} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{c.name}</Text>
                                  {c.phone ? <Text style={{ fontSize: 11, color: C.smoke }}>{c.phone}</Text> : null}
                                </View>
                                <Text style={{ fontSize: 11, color: C.jade }}>{c.visitCount} visits</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                  <FormField label="Name *" value={name} onChangeText={setName} placeholder="Guest name" />
                  <FormField label="Time (HH:MM) *" value={time} onChangeText={setTime} placeholder="18:00" keyboardType="numbers-and-punctuation" />

                  <View>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Party Size</Text>
                    <PartySizePicker value={partySize} onChange={setPartySize} />
                  </View>

                  <FormField label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" />
                  <FormField label="Email" value={email} onChangeText={setEmail} placeholder="guest@example.com" keyboardType="email-address" />
                  <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Special requests…" multiline />

                  <View className="flex-row" style={{ gap: 12, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={() => setEditing(false)}
                      style={{ flex: 1, borderWidth: 1, borderColor: C.rim, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: C.surfaceHi }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: "600", color: C.mist }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={saving}
                      style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center", backgroundColor: saving ? C.smoke : C.gold }}
                    >
                      {saving
                        ? <ActivityIndicator color={C.void} size="small" />
                        : <Text style={{ color: C.void, fontWeight: "700", fontSize: 13 }}>Save Changes</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Status actions */}
              {!editing && (
                <View style={{ marginTop: 20, gap: 12 }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Actions</Text>
                  <View style={{ gap: 8 }}>
                    {reservation.status === "PENDING" && (
                      <>
                        <StatusActionButton label="Confirm" icon="checkmark-circle-outline" color={C.jade} onPress={() => handleStatusAction("CONFIRMED")} loading={saving} />
                        <StatusActionButton label="No Show" icon="person-remove-outline" color={C.ember} onPress={() => handleStatusAction("NO_SHOW")} loading={saving} />
                        <StatusActionButton label="Cancel" icon="close-circle-outline" color={C.coral} onPress={() => handleStatusAction("CANCELLED")} loading={saving} />
                      </>
                    )}
                    {reservation.status === "CONFIRMED" && (
                      <>
                        <StatusActionButton label="Seat Guests" icon="restaurant-outline" color={C.sky} onPress={() => handleStatusAction("SEATED")} loading={saving} />
                        <StatusActionButton label="No Show" icon="person-remove-outline" color={C.ember} onPress={() => handleStatusAction("NO_SHOW")} loading={saving} />
                        <StatusActionButton label="Cancel" icon="close-circle-outline" color={C.coral} onPress={() => handleStatusAction("CANCELLED")} loading={saving} />
                      </>
                    )}
                    {reservation.status === "SEATED" && (
                      <StatusActionButton label="Mark Complete" icon="checkmark-done-circle-outline" color={C.smoke} onPress={() => handleStatusAction("CANCELLED")} loading={saving} />
                    )}
                  </View>

                  {/* Delete */}
                  <TouchableOpacity
                    onPress={confirmDelete}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: C.coral, backgroundColor: T.coral }}
                  >
                    <Ionicons name="trash-outline" size={15} color={C.coral} />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: C.coral }}>Delete Reservation</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── New reservation sheet ─────────────────────────────────────────────────────

function NewReservationSheet({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Customer lookup
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState<Customer[]>([]);
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCustomerSearch(val: string) {
    setCustomerQuery(val);
    setLinkedCustomer(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setCustomerMatches([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const hits = await searchCustomers(val.trim());
        setCustomerMatches(hits.slice(0, 5));
      } catch { setCustomerMatches([]); }
    }, 350);
  }

  function selectCustomer(c: Customer) {
    setLinkedCustomer(c);
    setCustomerQuery(c.name);
    setCustomerMatches([]);
    setName(c.name);
    if (c.phone) setPhone(c.phone);
    if (c.email) setEmail(c.email);
  }

  function clearCustomer() {
    setLinkedCustomer(null);
    setCustomerQuery("");
    setCustomerMatches([]);
    setName(""); setPhone(""); setEmail("");
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Required", "Guest name is required."); return; }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date.trim())) { Alert.alert("Invalid", "Date must be YYYY-MM-DD format."); return; }
    const timeRegex = /^\d{1,2}:\d{2}$/;
    if (!timeRegex.test(time.trim())) { Alert.alert("Invalid", "Time must be HH:MM format."); return; }

    setSaving(true);
    try {
      await createReservation({
        date: date.trim(),
        time: time.trim(),
        partySize,
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
        customerId: linkedCustomer?.id,
      });
      onCreated();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to create reservation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 justify-end"
      >
        <TouchableOpacity className="flex-1" activeOpacity={1} onPress={onClose} />
        <TouchableOpacity activeOpacity={1}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
            {/* Drag handle */}
            <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 16 }} />

            <View className="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>New Reservation</Text>
              <TouchableOpacity
                onPress={onClose}
                style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: C.surfaceHi }}
              >
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ gap: 16 }}>
                <View className="flex-row" style={{ gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <FormField label="Date *" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField label="Time * (HH:MM)" value={time} onChangeText={setTime} placeholder="18:00" keyboardType="numbers-and-punctuation" />
                  </View>
                </View>

                <View>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Party Size</Text>
                  <PartySizePicker value={partySize} onChange={setPartySize} />
                </View>

                {/* Customer lookup */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>
                    Returning Guest
                  </Text>
                  {linkedCustomer ? (
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 10 }}>
                      <Ionicons name="person-circle-outline" size={20} color={C.jade} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: C.jade }}>{linkedCustomer.name}</Text>
                        <Text style={{ fontSize: 11, color: C.jade, opacity: 0.8 }}>
                          {linkedCustomer.visitCount} visits · {linkedCustomer.loyaltyPoints} pts
                        </Text>
                      </View>
                      <TouchableOpacity onPress={clearCustomer} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close-circle" size={18} color={C.jade} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
                        <Ionicons name="search-outline" size={15} color={C.smoke} />
                        <TextInput
                          style={{ flex: 1, paddingVertical: 11, fontSize: 14, color: C.pearl }}
                          value={customerQuery}
                          onChangeText={handleCustomerSearch}
                          placeholder="Search by name or phone…"
                          placeholderTextColor={C.smoke}
                        />
                      </View>
                      {customerMatches.length > 0 && (
                        <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, borderRadius: 12, marginTop: 4, overflow: "hidden" }}>
                          {customerMatches.map((c, i) => (
                            <TouchableOpacity
                              key={c.id}
                              onPress={() => selectCustomer(c)}
                              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < customerMatches.length - 1 ? 1 : 0, borderColor: C.rim, gap: 10 }}
                            >
                              <Ionicons name="person-outline" size={15} color={C.mist} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{c.name}</Text>
                                <Text style={{ fontSize: 11, color: C.mist }}>{c.phone ?? c.email ?? `${c.visitCount} visits`}</Text>
                              </View>
                              <Text style={{ fontSize: 11, color: C.gold, fontWeight: "600" }}>{c.loyaltyPoints} pts</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <FormField label="Guest Name *" value={name} onChangeText={setName} placeholder="Full name" />
                <FormField label="Phone" value={phone} onChangeText={setPhone} placeholder="+1 555 000 0000" keyboardType="phone-pad" />
                <FormField label="Email" value={email} onChangeText={setEmail} placeholder="guest@example.com" keyboardType="email-address" />
                <FormField label="Notes" value={notes} onChangeText={setNotes} placeholder="Special requests, allergies…" multiline />

                <TouchableOpacity
                  onPress={handleSave}
                  disabled={saving}
                  style={{
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 8,
                    backgroundColor: saving ? C.smoke : C.gold,
                    ...shadow.gold,
                  }}
                >
                  {saving
                    ? <ActivityIndicator color={C.void} />
                    : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color={C.void} />
                        <Text style={{ color: C.void, fontWeight: "700", fontSize: 15 }}>Save Reservation</Text>
                      </>
                    )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 12, paddingVertical: 4 }}>
      <View style={{ width: 28, alignItems: "center" }}>
        <Ionicons name={icon as never} size={16} color={highlight ? C.gold : C.smoke} />
      </View>
      <Text style={{ fontSize: 12, color: C.mist, width: 80 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: highlight ? C.gold : C.pearl }}>{value}</Text>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "numbers-and-punctuation" | "url" | "number-pad" | "name-phone-pad" | "decimal-pad" | "twitter" | "web-search" | "ascii-capable" | "visible-password";
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: C.surfaceHi,
          borderWidth: 1,
          borderColor: C.rim,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          fontSize: 14,
          color: C.pearl,
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? "top" : undefined,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.smoke}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : undefined}
      />
    </View>
  );
}

function PartySizePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => {
        const active = value === n;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              backgroundColor: active ? C.gold : C.surfaceHi,
              borderColor: active ? C.gold : C.rim,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: active ? C.void : C.mist }}>{n}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatusActionButton({
  label,
  icon,
  color,
  onPress,
  loading,
}: {
  label: string;
  icon: string;
  color: string;
  onPress: () => void;
  loading?: boolean;
}) {
  // Use the tint map to derive background
  const tintMap: Record<string, string> = {
    [C.jade]:  T.jade,
    [C.ember]: T.ember,
    [C.coral]: T.coral,
    [C.sky]:   T.sky,
    [C.smoke]: T.mist,
  };
  const tint = tintMap[color] ?? T.mist;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: loading ? C.surfaceHi : tint,
        borderWidth: 1,
        borderColor: loading ? C.rim : color,
      }}
    >
      {loading
        ? <ActivityIndicator color={C.mist} size="small" />
        : (
          <>
            <Ionicons name={icon as never} size={16} color={color} />
            <Text style={{ fontWeight: "700", fontSize: 13, color }}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );
}
