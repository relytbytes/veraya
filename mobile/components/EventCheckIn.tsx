import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator, ScrollView, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getEventTicketing, eventOrderAction, type EventTicketingData, type EventAttendee } from "@/lib/api";
import { Scanner } from "@/components/Scanner";
import { C, shadow } from "@/lib/theme";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function EventCheckIn({ eventId, eventName, visible, onClose }: { eventId: string; eventName: string; visible: boolean; onClose: () => void }) {
  const [data, setData] = useState<EventTicketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await getEventTicketing(eventId)); } catch { /* ignore */ } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { if (visible) { setLoading(true); load(); } }, [visible, load]);

  async function toggle(o: EventAttendee) {
    if (o.status === "REFUNDED") return;
    setBusyId(o.id);
    try {
      await eventOrderAction(eventId, o.id, o.status === "CHECKED_IN" ? "uncheckin" : "checkin");
      await load();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  }

  async function onScan(code: string) {
    setScanning(false);
    const norm = code.trim().toUpperCase();
    const match = data?.orders.find((o) => o.confirmationCode.toUpperCase() === norm);
    if (!match) { Alert.alert("Not found", `No ticket matches code ${norm}.`); return; }
    if (match.status === "CHECKED_IN") { Alert.alert("Already in", `${match.name} is already checked in.`); return; }
    await toggle(match);
    Alert.alert("Checked in", `${match.name} · ${match.seats} ${match.seats === 1 ? "seat" : "seats"}`);
  }

  const orders = (data?.orders ?? []).filter((o) =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.confirmationCode.toLowerCase().includes(search.toLowerCase()),
  );
  const s = data?.summary;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.void }}>
        {/* Scanner overlays the check-in list within the SAME modal. Swapping to a
            separate <Modal> while this one is presented fails to appear on iOS
            (the Scan button looks dead), so render it as a full-screen overlay. */}
        {scanning && (
          <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: "#000" }}>
            <Scanner onScan={onScan} onClose={() => setScanning(false)} hint="Scan the guest's ticket QR" />
          </View>
        )}
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderColor: C.rim, backgroundColor: C.surface }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={24} color={C.mist} /></TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl, flex: 1, textAlign: "center" }} numberOfLines={1}>{eventName}</Text>
          <TouchableOpacity onPress={() => setScanning(true)} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
            <Ionicons name="qr-code-outline" size={15} color={C.void} /><Text style={{ fontSize: 12, fontWeight: "700", color: C.void }}>Scan</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={C.gold} /></View>
        ) : !data?.enabled ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="ticket-outline" size={40} color={C.smoke} />
            <Text style={{ color: C.mist, fontSize: 14, marginTop: 12, textAlign: "center" }}>Ticketing isn&apos;t enabled for this event.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Summary */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[
                { label: "seats", value: String(s?.seatsSold ?? 0), color: C.pearl },
                { label: "collected", value: money(s?.revenueCents ?? 0), color: C.jade },
                { label: "checked in", value: `${s?.checkedIn ?? 0}/${s?.orders ?? 0}`, color: C.gold },
              ].map((k) => (
                <View key={k.label} style={[{ flex: 1, backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.rim, paddingVertical: 10, alignItems: "center" }, shadow.sm]}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: k.color }}>{k.value}</Text>
                  <Text style={{ fontSize: 10, color: C.smoke, marginTop: 1 }}>{k.label}</Text>
                </View>
              ))}
            </View>

            <TextInput value={search} onChangeText={setSearch} placeholder="Search name or code" placeholderTextColor={C.smoke}
              style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: C.pearl }} />

            {orders.length === 0 ? (
              <Text style={{ color: C.smoke, fontSize: 13, textAlign: "center", paddingVertical: 24 }}>No tickets {search ? "match" : "sold yet"}.</Text>
            ) : orders.map((o) => {
              const inHouse = o.status === "CHECKED_IN";
              const refunded = o.status === "REFUNDED";
              return (
                <TouchableOpacity key={o.id} disabled={refunded || busyId === o.id} onPress={() => toggle(o)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: inHouse ? C.jade : C.rim, padding: 14, opacity: refunded ? 0.5 : 1 }}>
                  <View style={{ height: 28, width: 28, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: inHouse ? C.jade : C.surfaceHi, borderWidth: inHouse ? 0 : 1, borderColor: C.rim }}>
                    {busyId === o.id ? <ActivityIndicator size="small" color={inHouse ? C.void : C.mist} /> : <Ionicons name={inHouse ? "checkmark" : "ellipse-outline"} size={16} color={inHouse ? C.void : C.smoke} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{o.name}{refunded ? " · refunded" : ""}</Text>
                    <Text style={{ fontSize: 11, color: C.mist, marginTop: 1 }}>
                      {o.items.map((it) => `${it.quantity}× ${it.tierName}`).join(", ")} · <Text style={{ fontFamily: "monospace" as never }}>{o.confirmationCode}</Text>
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: C.smoke }}>{o.seats} {o.seats === 1 ? "seat" : "seats"}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
