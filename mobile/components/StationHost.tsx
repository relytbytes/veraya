import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Modal, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTables, getOpenOrders, getReservations, getWaitlist,
  patchTable, patchReservation, patchWaitlistEntry, createWaitlistEntry,
  moveTable, splitTables,
  type Table, type Reservation, type WaitlistEntry,
} from "@/lib/api";
import { HostStandMode } from "@/components/HostStandMode";
import { TableActionSheet } from "@/components/TableActionSheet";
import { C, T } from "@/lib/theme";

function toYMD(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

type PickTarget =
  | { kind: "reservation"; res: Reservation }
  | { kind: "waitlist"; entry: WaitlistEntry }
  | null;

/** Full-screen Host Stand for the station system — floor + rail + seat/walk-in flows. */
export function StationHost({ onExit }: { onExit: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  // Read insets HERE (outside the Modal) — they're correct here; SafeAreaView
  // inside HostStandMode's fullscreen Modal would report 0.
  const insets = useSafeAreaInsets();
  const today = toYMD(new Date());
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  // Navigating away from inside a fullscreen <Modal> doesn't reliably dismiss it,
  // so the host stand could stay on screen and the X / switch looked dead. Hide
  // the modal first, then navigate.
  const [visible, setVisible] = useState(true);
  const leave = (go: () => void) => { setVisible(false); go(); };

  const tablesQ = useQuery({ queryKey: ["tables"], queryFn: getTables, refetchInterval: 120_000 });
  const ordersQ = useQuery({ queryKey: ["openOrders"], queryFn: getOpenOrders, refetchInterval: 120_000 });
  const resQ = useQuery({ queryKey: ["reservations", today], queryFn: () => getReservations(today), refetchInterval: 120_000 });
  const waitQ = useQuery({ queryKey: ["waitlist"], queryFn: getWaitlist, refetchInterval: 120_000 });

  const tables = tablesQ.data ?? [];
  const refetchAll = () => { tablesQ.refetch(); ordersQ.refetch(); resQ.refetch(); waitQ.refetch(); };
  // Pull-to-refresh spinner is driven by THIS flag, not query.isFetching — a
  // background poll/SSE refresh must not flash the spinner.
  const [refreshing, setRefreshing] = useState(false);
  const onManualRefresh = async () => {
    setRefreshing(true);
    try { await Promise.all([tablesQ.refetch(), ordersQ.refetch(), resQ.refetch(), waitQ.refetch()]); }
    finally { setRefreshing(false); }
  };

  const [pickFor, setPickFor] = useState<PickTarget>(null);
  const [walkIn, setWalkIn] = useState<{ table: Table | null } | null>(null);
  const [wName, setWName] = useState(""); const [wParty, setWParty] = useState("2");
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [wlName, setWlName] = useState(""); const [wlParty, setWlParty] = useState("2"); const [wlPhone, setWlPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionTable, setActionTable] = useState<Table | null>(null);
  const [moveFrom, setMoveFrom] = useState<Table | null>(null);

  const partyNeeded = pickFor?.kind === "reservation" ? pickFor.res.partySize : pickFor?.kind === "waitlist" ? pickFor.entry.partySize : 2;

  async function seatToTable(t: Table) {
    if (!pickFor) return;
    setBusy(true);
    try {
      if (pickFor.kind === "reservation") {
        await patchReservation(pickFor.res.id, { status: "SEATED", tableId: t.id });
      } else {
        await patchTable(t.id, { status: "OCCUPIED", guestName: pickFor.entry.name, partySize: pickFor.entry.partySize, seatedAt: new Date().toISOString(), serviceStage: "SEATED" });
        await patchWaitlistEntry(pickFor.entry.id, { status: "SEATED" });
      }
      setPickFor(null); refetchAll();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to seat"); }
    finally { setBusy(false); }
  }

  async function seatWalkIn() {
    if (!walkIn?.table || !wName.trim()) { Alert.alert("Required", "Enter a name and pick a table."); return; }
    setBusy(true);
    try {
      await patchTable(walkIn.table.id, { status: "OCCUPIED", guestName: wName.trim(), partySize: Number(wParty) || 2, seatedAt: new Date().toISOString(), serviceStage: "SEATED" });
      setWalkIn(null); setWName(""); setWParty("2"); refetchAll();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function addWaitlist() {
    if (!wlName.trim()) { Alert.alert("Required", "Enter a name."); return; }
    setBusy(true);
    try {
      await createWaitlistEntry({ name: wlName.trim(), partySize: Number(wlParty) || 2, phone: wlPhone.trim() || undefined });
      setWaitlistOpen(false); setWlName(""); setWlParty("2"); setWlPhone(""); waitQ.refetch();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  // ── Occupied-table actions (mirror web host panel) ─────────────────────────
  async function setStage(stage: string) {
    if (!actionTable) return;
    setBusy(true);
    try { await patchTable(actionTable.id, { serviceStage: stage }); setActionTable({ ...actionTable, serviceStage: stage }); refetchAll(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function markBussing() {
    if (!actionTable) return;
    setBusy(true);
    try { await patchTable(actionTable.id, { status: "DIRTY" }); setActionTable(null); refetchAll(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function finishTable() {
    if (!actionTable) return;
    setBusy(true);
    try {
      await patchTable(actionTable.id, { status: "AVAILABLE", seatedAt: null, guestName: null, partySize: null, serviceStage: null, serverId: null });
      setActionTable(null); refetchAll();
    } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function splitTable() {
    if (!actionTable) return;
    setBusy(true);
    try { await splitTables(actionTable.id); setActionTable(null); refetchAll(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function doMove(to: Table) {
    if (!moveFrom) return;
    setBusy(true);
    try { await moveTable(moveFrom.id, to.id); setMoveFrom(null); setActionTable(null); refetchAll(); }
    catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed to move"); }
    finally { setBusy(false); }
  }

  const available = tables.filter((t) => t.status === "AVAILABLE" && !t.primaryTableId).sort((a, b) => a.number - b.number);

  return (
    <View style={{ flex: 1, backgroundColor: C.void }}>
      <HostStandMode
        visible={visible}
        onClose={() => leave(onExit)}
        topInset={insets.top}
        bottomInset={insets.bottom}
        onSwitchStation={() => leave(() => router.replace("/(app)/station"))}
        tables={tables}
        openOrders={(ordersQ.data ?? []).map((o) => ({ id: o.id, tableId: (o as { tableId?: string | null }).tableId ?? null, total: o.total }))}
        tableSize={64}
        amberAt={60}
        redAt={90}
        showServerBadge
        showOrderTotal={false}
        showGuestLabel
        tick={tick}
        onTablePress={(t) => {
          if (t.status === "AVAILABLE") { setWName(""); setWParty("2"); setWalkIn({ table: t }); }
          else if (t.status === "OCCUPIED") { setActionTable(t); }
          else if (t.status === "DIRTY") {
            Alert.alert(`Table ${t.number}`, "Mark this table clean and ready to seat?", [
              { text: "Cancel", style: "cancel" },
              { text: "Mark clean", onPress: async () => { try { await patchTable(t.id, { status: "AVAILABLE" }); refetchAll(); } catch (e: unknown) { Alert.alert("Error", e instanceof Error ? e.message : "Failed"); } } },
            ]);
          }
        }}
        onLayoutSaved={refetchAll}
        onRefresh={onManualRefresh}
        isRefreshing={refreshing}
        todayReservations={resQ.data ?? []}
        waitingList={waitQ.data ?? []}
        onAddWalkIn={() => { setWName(""); setWParty("2"); setWalkIn({ table: null }); }}
        onAddWaitlist={() => setWaitlistOpen(true)}
        onAddReservation={() => router.push("/(app)/reservations")}
        onSeatWaitlistEntry={(entry) => setPickFor({ kind: "waitlist", entry })}
        onSeatReservation={(res) => setPickFor({ kind: "reservation", res })}
        onMarkLeft={async (id) => { await patchWaitlistEntry(id, { status: "LEFT" }); waitQ.refetch(); }}
        onMarkNoShow={async (id) => { await patchReservation(id, { status: "NO_SHOW" }); resQ.refetch(); }}
      />

      {/* Table picker — seat a reservation / waitlist party */}
      {pickFor && (
        <Modal transparent animationType="slide" onRequestClose={() => setPickFor(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "70%", paddingBottom: 28 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>
                  Seat {pickFor.kind === "reservation" ? pickFor.res.name : pickFor.entry.name} · {partyNeeded} {partyNeeded === 1 ? "guest" : "guests"}
                </Text>
                <TouchableOpacity onPress={() => setPickFor(null)}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 }}>
                {available.length === 0 ? <Text style={{ color: C.smoke, fontSize: 13 }}>No open tables.</Text> : available.map((t) => {
                  const fits = t.capacity >= partyNeeded;
                  return (
                    <TouchableOpacity key={t.id} onPress={() => seatToTable(t)} disabled={busy} style={{ width: "30%", flexGrow: 1, borderWidth: 1, borderColor: fits ? C.jade : C.rim, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: fits ? `${C.jade}0F` : C.surfaceHi }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>{t.number}</Text>
                      <Text style={{ fontSize: 10, color: fits ? C.jade : C.smoke }}>{t.capacity} seats</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Walk-in */}
      {walkIn && (
        <Modal transparent animationType="slide" onRequestClose={() => setWalkIn(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, gap: 12, maxHeight: "75%" }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>Seat walk-in{walkIn.table ? ` · Table ${walkIn.table.number}` : ""}</Text>
                <TouchableOpacity onPress={() => setWalkIn(null)}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
              </View>
              <TextInput value={wName} onChangeText={setWName} placeholder="Guest name" placeholderTextColor={C.smoke} style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.pearl }} />
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["1", "2", "3", "4", "5", "6", "8"].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setWParty(n)} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", backgroundColor: wParty === n ? C.gold : C.surfaceHi }}>
                    <Text style={{ fontWeight: "700", fontSize: 13, color: wParty === n ? C.void : C.mist }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!walkIn.table && (
                <>
                  <Text style={{ fontSize: 11, color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>Pick a table</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {available.map((t) => (
                      <TouchableOpacity key={t.id} onPress={() => setWalkIn({ table: t })} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.rim, backgroundColor: C.surfaceHi }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: C.mist }}>T{t.number} · {t.capacity}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <TouchableOpacity onPress={seatWalkIn} disabled={busy || !walkIn.table || !wName.trim()} style={{ paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: (!walkIn.table || !wName.trim()) ? C.surfaceHi : C.gold }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: (!walkIn.table || !wName.trim()) ? C.smoke : C.void }}>{busy ? "Seating…" : "Seat walk-in"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Add to waitlist */}
      {waitlistOpen && (
        <Modal transparent animationType="slide" onRequestClose={() => setWaitlistOpen(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 28, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>Add to waitlist</Text>
                <TouchableOpacity onPress={() => setWaitlistOpen(false)}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
              </View>
              <TextInput value={wlName} onChangeText={setWlName} placeholder="Guest name" placeholderTextColor={C.smoke} style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.pearl }} />
              <TextInput value={wlPhone} onChangeText={setWlPhone} placeholder="Phone (optional)" placeholderTextColor={C.smoke} keyboardType="phone-pad" style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.pearl }} />
              <View style={{ flexDirection: "row", gap: 6 }}>
                {["1", "2", "3", "4", "5", "6", "8"].map((n) => (
                  <TouchableOpacity key={n} onPress={() => setWlParty(n)} style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center", backgroundColor: wlParty === n ? C.gold : C.surfaceHi }}>
                    <Text style={{ fontWeight: "700", fontSize: 13, color: wlParty === n ? C.void : C.mist }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={addWaitlist} disabled={busy || !wlName.trim()} style={{ paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: wlName.trim() ? C.gold : C.surfaceHi }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: wlName.trim() ? C.void : C.smoke }}>{busy ? "Adding…" : "Add to waitlist"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Occupied-table actions (stage / move / bussing / finish) */}
      {actionTable && !moveFrom && (
        <TableActionSheet
          table={actionTable}
          busy={busy}
          onClose={() => setActionTable(null)}
          onSetStage={setStage}
          onStartMove={() => setMoveFrom(actionTable)}
          onBussing={markBussing}
          onFinish={finishTable}
          onSplit={actionTable.primaryTableId ? splitTable : undefined}
        />
      )}

      {/* Move party — pick the destination table */}
      {moveFrom && (
        <Modal transparent animationType="slide" onRequestClose={() => setMoveFrom(null)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
            <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "70%", paddingBottom: 28 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>
                  Move {moveFrom.guestName ?? `Table ${moveFrom.number}`} to…
                </Text>
                <TouchableOpacity onPress={() => setMoveFrom(null)}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 16 }}>
                {available.length === 0 ? <Text style={{ color: C.smoke, fontSize: 13 }}>No open tables to move to.</Text> : available.map((t) => {
                  const fits = t.capacity >= (moveFrom.partySize ?? 1);
                  return (
                    <TouchableOpacity key={t.id} onPress={() => doMove(t)} disabled={busy} style={{ width: "30%", flexGrow: 1, borderWidth: 1, borderColor: fits ? C.jade : C.rim, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: fits ? `${C.jade}0F` : C.surfaceHi }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: C.pearl }}>{t.number}</Text>
                      <Text style={{ fontSize: 10, color: fits ? C.jade : C.smoke }}>{t.capacity} seats</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
