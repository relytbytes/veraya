import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  RefreshControl, Alert, ActivityIndicator, TextInput, Animated, Share,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEvents, createEvent, patchEvent, deleteEvent, BASE_URL } from "@/lib/api";
import type { CalEvent } from "@/lib/api";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";
import { ScreenMessage } from "@/components/ScreenMessage";
import { EventCheckIn } from "@/components/EventCheckIn";
import { useManualRefresh } from "@/lib/use-manual-refresh";

type Tab = "upcoming" | "past" | "inquiries";

type FormState = {
  name: string; date: string; startTime: string; endTime: string;
  guestCount: string; contactName: string; contactPhone: string; contactEmail: string;
  venue: string; depositAmount: string; totalAmount: string;
  notes: string; menuNotes: string;
};

const EMPTY_FORM: FormState = {
  name: "", date: "", startTime: "", endTime: "",
  guestCount: "", contactName: "", contactPhone: "", contactEmail: "",
  venue: "", depositAmount: "", totalAmount: "",
  notes: "", menuNotes: "",
};

function statusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case "INQUIRY":   return { bg: T.gold,  text: C.gold };
    case "CONFIRMED": return { bg: T.jade,  text: C.jade };
    case "COMPLETED": return { bg: T.sky,   text: C.sky };
    case "CANCELLED": return { bg: T.coral, text: C.coral };
    default:          return { bg: T.mist,  text: C.mist };
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function EventsScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  // iOS can't present the check-in modal while the detail page-sheet is up, so we
  // dismiss the sheet first and open check-in once it has fully animated away.
  const [pendingCheckIn, setPendingCheckIn] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const { data: events = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: getEvents,
    refetchInterval: 120_000,
  });

  const today = todayStr();

  const tabEvents = useMemo(() => {
    if (tab === "upcoming") return events.filter((e) => e.date >= today && e.status !== "CANCELLED" && e.status !== "INQUIRY");
    if (tab === "past") return events.filter((e) => e.date < today || e.status === "COMPLETED" || e.status === "CANCELLED");
    return events.filter((e) => e.status === "INQUIRY");
  }, [events, tab, today]);

  function openDetail(ev: CalEvent) {
    setSelectedEvent(ev);
    setDetailOpen(true);
  }

  function openNewForm() {
    setEditMode(false);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEditForm(ev: CalEvent) {
    setEditMode(true);
    setForm({
      name: ev.name,
      date: ev.date,
      startTime: ev.startTime,
      endTime: ev.endTime ?? "",
      guestCount: ev.guestCount != null ? String(ev.guestCount) : "",
      contactName: ev.contactName,
      contactPhone: ev.contactPhone ?? "",
      contactEmail: ev.contactEmail ?? "",
      venue: ev.venue ?? "",
      depositAmount: ev.depositAmount != null ? String(Number(ev.depositAmount)) : "",
      totalAmount: ev.totalAmount != null ? String(Number(ev.totalAmount)) : "",
      notes: ev.notes ?? "",
      menuNotes: ev.menuNotes ?? "",
    });
    setDetailOpen(false);
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert("Required", "Event name is required."); return; }
    if (!form.date.trim()) { Alert.alert("Required", "Date is required (YYYY-MM-DD)."); return; }
    if (!form.startTime.trim()) { Alert.alert("Required", "Start time is required."); return; }
    if (!form.contactName.trim()) { Alert.alert("Required", "Contact name is required."); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        date: form.date.trim(),
        startTime: form.startTime.trim(),
        endTime: form.endTime.trim() || undefined,
        guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        venue: form.venue.trim() || undefined,
        depositAmount: form.depositAmount ? parseFloat(form.depositAmount) : undefined,
        totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : undefined,
        notes: form.notes.trim() || undefined,
        menuNotes: form.menuNotes.trim() || undefined,
      };
      if (editMode && selectedEvent) {
        const updated = await patchEvent(selectedEvent.id, body);
        setSelectedEvent(updated);
      } else {
        await createEvent(body);
      }
      await qc.invalidateQueries({ queryKey: ["events"] });
      setFormOpen(false);
      if (!editMode) setDetailOpen(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(ev: CalEvent, action: string) {
    setActionLoading(true);
    try {
      const body = action === "DEPOSIT_PAID"
        ? { depositPaid: true }
        : { status: action };
      const updated = await patchEvent(ev.id, body);
      setSelectedEvent(updated);
      await qc.invalidateQueries({ queryKey: ["events"] });
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(ev: CalEvent) {
    Alert.alert(
      "Delete Event",
      `Delete "${ev.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              await deleteEvent(ev.id);
              await qc.invalidateQueries({ queryKey: ["events"] });
              setDetailOpen(false);
              setSelectedEvent(null);
            } catch (e: unknown) {
              Alert.alert("Error", e instanceof Error ? e.message : "Failed to delete event");
            }
          },
        },
      ]
    );
  }

  function Field({
    label, value, onChangeText, placeholder, keyboardType, multiline, required,
  }: {
    label: string; value: string; onChangeText: (v: string) => void;
    placeholder?: string; keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address" | "phone-pad";
    multiline?: boolean; required?: boolean;
  }) {
    return (
      <View className="gap-1.5">
        <Text style={{ fontSize: 10, color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: "600" }}>
          {label}{required && <Text style={{ color: C.coral }}> *</Text>}
        </Text>
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
            ...(multiline ? { minHeight: 72, textAlignVertical: "top" } : {}),
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? ""}
          placeholderTextColor={C.smoke}
          keyboardType={keyboardType ?? "default"}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {/* Detail sheet */}
      {selectedEvent && (
        <Modal
          visible={detailOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setDetailOpen(false)}
          onDismiss={() => { if (pendingCheckIn) { setPendingCheckIn(false); setCheckInOpen(true); } }}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
            <View
              style={{
                paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
                borderBottomWidth: 1, borderBottomColor: C.rim,
                flexDirection: "row", alignItems: "center", gap: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => setDetailOpen(false)}
                style={{
                  height: 32, width: 32, alignItems: "center", justifyContent: "center",
                  borderRadius: 16, backgroundColor: C.surfaceHi,
                }}
              >
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: C.pearl }} numberOfLines={1}>
                {selectedEvent.name}
              </Text>
              {selectedEvent.status === "CONFIRMED" && (
                <TouchableOpacity
                  onPress={() => { setPendingCheckIn(true); setDetailOpen(false); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12 }}
                >
                  <Ionicons name="qr-code-outline" size={14} color={C.gold} />
                  <Text style={{ color: C.pearl, fontSize: 13, fontWeight: "700" }}>Check-in</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => openEditForm(selectedEvent)}
                style={{ paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.gold, borderRadius: 12 }}
              >
                <Text style={{ color: C.void, fontSize: 13, fontWeight: "700" }}>Edit</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              {/* Status + deposit row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {(() => {
                  const b = statusBadge(selectedEvent.status);
                  return (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: b.bg }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: b.text }}>{selectedEvent.status}</Text>
                    </View>
                  );
                })()}
                {selectedEvent.depositPaid ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: T.jade, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                    <Ionicons name="checkmark-circle" size={12} color={C.jade} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade }}>Deposit Paid</Text>
                  </View>
                ) : selectedEvent.depositAmount != null ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: T.ember, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                    <Ionicons name="time-outline" size={12} color={C.ember} />
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.ember }}>Deposit Unpaid</Text>
                  </View>
                ) : null}
              </View>

              {/* Info grid */}
              <View style={{ backgroundColor: C.surfaceHi, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.rim }}>
                <InfoRow icon="calendar-outline" label="Date" value={`${selectedEvent.date} · ${selectedEvent.startTime}${selectedEvent.endTime ? ` – ${selectedEvent.endTime}` : ""}`} />
                {selectedEvent.guestCount != null && (
                  <InfoRow icon="people-outline" label="Guests" value={String(selectedEvent.guestCount)} />
                )}
                {selectedEvent.venue && (
                  <InfoRow icon="location-outline" label="Venue" value={selectedEvent.venue} />
                )}
                <InfoRow icon="person-outline" label="Contact" value={selectedEvent.contactName} />
                {selectedEvent.contactPhone && (
                  <InfoRow icon="call-outline" label="Phone" value={selectedEvent.contactPhone} />
                )}
                {selectedEvent.contactEmail && (
                  <InfoRow icon="mail-outline" label="Email" value={selectedEvent.contactEmail} />
                )}
                {selectedEvent.depositAmount != null && (
                  <InfoRow
                    icon="cash-outline"
                    label="Deposit"
                    value={`$${Number(selectedEvent.depositAmount).toFixed(2)}${selectedEvent.depositPaid ? " (paid)" : " (unpaid)"}`}
                  />
                )}
                {selectedEvent.totalAmount != null && (
                  <InfoRow icon="pricetag-outline" label="Total" value={`$${Number(selectedEvent.totalAmount).toFixed(2)}`} />
                )}
                {selectedEvent.customer && (
                  <InfoRow icon="person-circle-outline" label="Customer" value={selectedEvent.customer.name} />
                )}
              </View>

              {/* Share public booking link */}
              <TouchableOpacity
                onPress={() => {
                  const url = `${BASE_URL}/special-events/${selectedEvent.id}`;
                  Share.share({ message: `${selectedEvent.name} — book here: ${url}`, url });
                }}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: C.gold, backgroundColor: T.gold }}
              >
                <Ionicons name="share-outline" size={16} color={C.gold} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.gold }}>Share booking link</Text>
              </TouchableOpacity>

              {selectedEvent.notes && (
                <View style={{ backgroundColor: T.gold, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.rim }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.gold, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Notes</Text>
                  <Text style={{ fontSize: 13, color: C.pearl }}>{selectedEvent.notes}</Text>
                </View>
              )}

              {selectedEvent.menuNotes && (
                <View style={{ backgroundColor: T.sky, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.rim }}>
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.sky, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Menu Notes</Text>
                  <Text style={{ fontSize: 13, color: C.pearl }}>{selectedEvent.menuNotes}</Text>
                </View>
              )}

              {/* Action buttons */}
              {actionLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <ActivityIndicator color={C.gold} />
                </View>
              ) : (
                <View style={{ gap: 8 }}>
                  {selectedEvent.status === "INQUIRY" && (
                    <TouchableOpacity
                      onPress={() => handleStatusChange(selectedEvent, "CONFIRMED")}
                      style={{ backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={C.jade} />
                      <Text style={{ color: C.jade, fontWeight: "700", fontSize: 15 }}>Confirm Event</Text>
                    </TouchableOpacity>
                  )}
                  {selectedEvent.status === "CONFIRMED" && (
                    <TouchableOpacity
                      onPress={() => handleStatusChange(selectedEvent, "COMPLETED")}
                      style={{ backgroundColor: T.sky, borderWidth: 1, borderColor: C.sky, borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="flag-outline" size={18} color={C.sky} />
                      <Text style={{ color: C.sky, fontWeight: "700", fontSize: 15 }}>Mark Completed</Text>
                    </TouchableOpacity>
                  )}
                  {selectedEvent.depositAmount != null && !selectedEvent.depositPaid && selectedEvent.status !== "CANCELLED" && (
                    <TouchableOpacity
                      onPress={() => handleStatusChange(selectedEvent, "DEPOSIT_PAID")}
                      style={{ backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="checkmark-circle-outline" size={18} color={C.gold} />
                      <Text style={{ color: C.gold, fontWeight: "700", fontSize: 15 }}>Mark Deposit Paid</Text>
                    </TouchableOpacity>
                  )}
                  {selectedEvent.status !== "CANCELLED" && selectedEvent.status !== "COMPLETED" && (
                    <TouchableOpacity
                      onPress={() => handleStatusChange(selectedEvent, "CANCELLED")}
                      style={{ backgroundColor: T.coral, borderWidth: 1, borderColor: C.coral, borderRadius: 16, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={C.coral} />
                      <Text style={{ color: C.coral, fontWeight: "700", fontSize: 15 }}>Cancel Event</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => handleDelete(selectedEvent)}
                    style={{ alignItems: "center", paddingVertical: 10 }}
                  >
                    <Text style={{ fontSize: 12, color: C.coral, fontWeight: "500" }}>Delete Event</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      )}

      {/* New / Edit form sheet */}
      <Modal
        visible={formOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFormOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
          <View
            style={{
              paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
              borderBottomWidth: 1, borderBottomColor: C.rim,
              flexDirection: "row", alignItems: "center", gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={() => setFormOpen(false)}
              style={{
                height: 32, width: 32, alignItems: "center", justifyContent: "center",
                borderRadius: 16, backgroundColor: C.surfaceHi,
              }}
            >
              <Ionicons name="close" size={16} color={C.mist} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: C.pearl }}>
              {editMode ? "Edit Event" : "New Event"}
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              style={{
                paddingHorizontal: 16, paddingVertical: 7, borderRadius: 12,
                backgroundColor: saving ? C.surfaceHi : C.gold,
              }}
            >
              {saving
                ? <ActivityIndicator color={C.pearl} size="small" />
                : <Text style={{ color: C.void, fontWeight: "700", fontSize: 13 }}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 10, color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "600" }}>Event Details</Text>

            <Field label="Event Name" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} required placeholder="e.g. Smith Wedding Reception" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Date" value={form.date} onChangeText={(v) => setForm((f) => ({ ...f, date: v }))} required placeholder="YYYY-MM-DD" />
              </View>
              <View className="flex-1">
                <Field label="Start Time" value={form.startTime} onChangeText={(v) => setForm((f) => ({ ...f, startTime: v }))} required placeholder="HH:MM" />
              </View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="End Time" value={form.endTime} onChangeText={(v) => setForm((f) => ({ ...f, endTime: v }))} placeholder="HH:MM" />
              </View>
              <View className="flex-1">
                <Field label="Guest Count" value={form.guestCount} onChangeText={(v) => setForm((f) => ({ ...f, guestCount: v }))} keyboardType="numeric" placeholder="0" />
              </View>
            </View>
            <Field label="Venue" value={form.venue} onChangeText={(v) => setForm((f) => ({ ...f, venue: v }))} placeholder="Banquet hall, patio, etc." />

            <Text style={{ fontSize: 10, color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "600", marginTop: 8 }}>Contact Info</Text>
            <Field label="Contact Name" value={form.contactName} onChangeText={(v) => setForm((f) => ({ ...f, contactName: v }))} required placeholder="Primary contact" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Phone" value={form.contactPhone} onChangeText={(v) => setForm((f) => ({ ...f, contactPhone: v }))} keyboardType="phone-pad" placeholder="555-000-0000" />
              </View>
              <View className="flex-1">
                <Field label="Email" value={form.contactEmail} onChangeText={(v) => setForm((f) => ({ ...f, contactEmail: v }))} keyboardType="email-address" placeholder="email@example.com" />
              </View>
            </View>

            <Text style={{ fontSize: 10, color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "600", marginTop: 8 }}>Financials</Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="Deposit Amount" value={form.depositAmount} onChangeText={(v) => setForm((f) => ({ ...f, depositAmount: v }))} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
              <View className="flex-1">
                <Field label="Total Amount" value={form.totalAmount} onChangeText={(v) => setForm((f) => ({ ...f, totalAmount: v }))} keyboardType="decimal-pad" placeholder="0.00" />
              </View>
            </View>

            <Text style={{ fontSize: 10, color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "600", marginTop: 8 }}>Notes</Text>
            <Field label="General Notes" value={form.notes} onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} multiline placeholder="Special requests, logistics…" />
            <Field label="Menu Notes" value={form.menuNotes} onChangeText={(v) => setForm((f) => ({ ...f, menuNotes: v }))} multiline placeholder="Dietary restrictions, courses…" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {selectedEvent && (
        <EventCheckIn eventId={selectedEvent.id} eventName={selectedEvent.name} visible={checkInOpen} onClose={() => setCheckInOpen(false)} />
      )}

      <CollapsingHeader
        title="Events & Catering"
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        subtitle={`${events.length} total events`}
        scrollY={scrollY}
      />

      {/* Tab bar */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <View style={{ flexDirection: "row", backgroundColor: C.surfaceHi, borderRadius: 12, padding: 4, gap: 4 }}>
          {(["upcoming", "past", "inquiries"] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              onPress={() => setTab(t)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center",
                backgroundColor: tab === t ? C.gold : "transparent",
              }}
            >
              <Text style={{
                fontSize: 12, fontWeight: "600", textTransform: "capitalize",
                color: tab === t ? C.void : C.mist,
              }}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && (
          <View className="items-center py-12">
            <ActivityIndicator color={C.gold} />
          </View>
        )}

        {!isLoading && isError && events.length === 0 && (
          <ScreenMessage icon="cloud-offline-outline" tone="error" title="Couldn't load events" subtitle="Check your connection and try again." actionLabel="Retry" onAction={() => refetch()} />
        )}

        {!isLoading && !isError && tabEvents.length === 0 && (
          <View className="items-center py-14 gap-4">
            <View style={{ height: 64, width: 64, borderRadius: 16, backgroundColor: C.surfaceHi, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="calendar-outline" size={30} color={C.smoke} />
            </View>
            <Text style={{ color: C.mist, fontSize: 13 }}>No {tab} events</Text>
          </View>
        )}

        {tabEvents.map((ev) => {
          const b = statusBadge(ev.status);
          return (
            <TouchableOpacity
              key={ev.id}
              onPress={() => openDetail(ev)}
              style={{
                backgroundColor: C.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: C.rim,
                padding: 16,
                gap: 8,
                ...shadow.sm,
              }}
              activeOpacity={0.75}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: C.pearl }} numberOfLines={1}>
                  {ev.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {ev.depositPaid && (
                    <Ionicons name="checkmark-circle" size={14} color={C.jade} />
                  )}
                  <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: b.bg }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: b.text }}>{ev.status}</Text>
                  </View>
                </View>
              </View>
              {/* Date chip */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: T.gold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Ionicons name="calendar-outline" size={11} color={C.gold} />
                  <Text style={{ fontSize: 11, color: C.gold, fontWeight: "600" }}>{ev.date} · {ev.startTime}</Text>
                </View>
                {ev.guestCount != null && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="people-outline" size={12} color={C.mist} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: C.pearl }}>{ev.guestCount}</Text>
                    <Text style={{ fontSize: 11, color: C.mist }}>guests</Text>
                  </View>
                )}
              </View>
              {ev.venue && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="location-outline" size={11} color={C.mist} />
                  <Text style={{ fontSize: 11, color: C.mist }}>{ev.venue}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="person-outline" size={11} color={C.smoke} />
                <Text style={{ fontSize: 11, color: C.smoke }}>{ev.contactName}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>

      {/* FAB */}
      <TouchableOpacity
        onPress={openNewForm}
        style={{
          position: "absolute", bottom: 32, right: 20,
          height: 56, width: 56, backgroundColor: C.gold,
          borderRadius: 28, alignItems: "center", justifyContent: "center",
          ...shadow.gold,
        }}
      >
        <Ionicons name="add" size={28} color={C.void} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <Ionicons name={icon as never} size={14} color={C.smoke} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
        <Text style={{ fontSize: 11, color: C.smoke, width: 60, paddingTop: 2 }}>{label}</Text>
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: C.pearl }}>{value}</Text>
      </View>
    </View>
  );
}
