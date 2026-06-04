import { useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  useWindowDimensions, RefreshControl, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { TableCanvas } from "./TableCanvas";
import { C, T, shadow } from "@/lib/theme";
import type { Table, Reservation, WaitlistEntry } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HostStandModeProps {
  visible: boolean;
  onClose: () => void;
  tables: Table[];
  openOrders: Array<{ id: string; tableId: string | null; total: string | number }>;
  tableSize: number;
  amberAt: number;
  redAt: number;
  showServerBadge: boolean;
  showOrderTotal: boolean;
  showGuestLabel: boolean;
  tick: number;
  onTablePress: (t: Table) => void;
  onLayoutSaved?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  todayReservations: Reservation[];
  waitingList: WaitlistEntry[];
  // Action callbacks — wired from pos.tsx
  onAddWalkIn?: () => void;
  onAddWaitlist?: () => void;
  onAddReservation?: () => void;
  onSeatWaitlistEntry?: (entry: WaitlistEntry) => void;
  onSeatReservation?: (res: Reservation) => void;
  onMarkLeft?: (entryId: string) => Promise<void>;
  onMarkNoShow?: (resId: string) => Promise<void>;
  // SafeAreaView reports 0 insets inside a fullscreen Modal, so the parent (which
  // can read them correctly) passes them in for manual padding.
  topInset?: number;
  bottomInset?: number;
  // When set, shows a "switch station" button in the header. The floating
  // StationControl pill is covered by this fullscreen modal, so on the host
  // screen this is the only way to switch stations without exiting to the app.
  onSwitchStation?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elapsedMins(seatedAt: string) {
  return Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
}
function elapsedLabel(seatedAt: string) {
  const m = elapsedMins(seatedAt);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function timerColor(seatedAt: string, amberAt: number, redAt: number) {
  const m = elapsedMins(seatedAt);
  return m < amberAt ? C.jade : m < redAt ? C.ember : C.coral;
}
function timerBg(seatedAt: string, amberAt: number, redAt: number) {
  const m = elapsedMins(seatedAt);
  return m < amberAt ? T.jade : m < redAt ? T.ember : T.coral;
}
function estimateWait(position: number, partySize: number, tables: Table[], avgTurnMins = 45): number {
  const fitting = tables.filter((t) => t.capacity >= partySize).length;
  if (fitting === 0) return position * avgTurnMins;
  return Math.ceil(position / Math.max(1, fitting)) * avgTurnMins;
}
function fmt12(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  const h = parseInt(match[1]), m = match[2];
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

/** True when the reservation time is within 20 min ahead or 10 min past */
function isArrivingSoon(resTime: string, now: Date): boolean {
  const [h, m] = resTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return false;
  const diff = (h * 60 + m) - (now.getHours() * 60 + now.getMinutes());
  // "Arriving soon" begins 30 minutes before the reservation time (#1).
  return diff >= -10 && diff <= 30;
}

// Service-stage colors — must match the web floor plan / host stand exactly.
const STAGE_COLOR: Record<string, string> = {
  SEATED:        "#1E7A45",
  APPS:          "#2BB39B",
  ENTREES:       "#E0A82E",
  DESSERT:       "#7C5CBF",
  CHECK_DROPPED: "#2E6EB0",
  CHECK_PAID:    "#2E6EB0",
  BUSSING:       "#D44030",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  label, color, count, onAdd,
}: { label: string; color: string; count?: number; onAdd?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 18, paddingBottom: 6, gap: 6 }}>
      <View style={{ width: 3, height: 13, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ flex: 1, fontSize: 10, fontWeight: "800", color, textTransform: "uppercase", letterSpacing: 1.2 }}>
        {label}{count != null ? `  ${count}` : ""}
      </Text>
      {onAdd && (
        <TouchableOpacity
          onPress={onAdd}
          style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={16} color={color} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptySection({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
      <Ionicons name={icon} size={28} color={C.smoke} />
      <Text style={{ color: C.mist, fontSize: 13 }}>{text}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function HostStandMode({
  visible, onClose,
  tables, openOrders, tableSize, amberAt, redAt,
  showServerBadge, showOrderTotal, showGuestLabel,
  onTablePress, onLayoutSaved,
  onRefresh, isRefreshing,
  todayReservations, waitingList,
  onAddWalkIn, onAddWaitlist, onAddReservation,
  onSeatWaitlistEntry, onSeatReservation,
  onMarkLeft, onMarkNoShow,
  topInset = 0, bottomInset = 0, onSwitchStation,
}: HostStandModeProps) {

  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;

  const [markingId, setMarkingId] = useState<string | null>(null);
  const now = new Date();

  // Derived
  const occupiedTables = [...tables]
    .filter(t => t.status === "OCCUPIED")
    .sort((a, b) => new Date(a.seatedAt ?? 0).getTime() - new Date(b.seatedAt ?? 0).getTime());

  const activeWaitlist = waitingList.filter(w => w.status === "WAITING");
  const upcomingReservations = todayReservations
    .filter(r => r.status === "PENDING" || r.status === "CONFIRMED")
    .sort((a, b) => a.time.localeCompare(b.time));

  const avgTurnMins = occupiedTables.length > 0
    ? Math.round(occupiedTables.reduce((s, t) => s + (t.seatedAt ? elapsedMins(t.seatedAt) : 0), 0) / occupiedTables.length)
    : 0;

  // Leave room for the header (~56) + the color legend (~80) + top/bottom safe
  // insets so the legend isn't pushed off the bottom of a landscape iPad.
  const canvasH = isTablet
    ? height - 250 - topInset - bottomInset
    : Math.max(240, Math.min(380, Math.round(height * 0.38)));

  // ── Derived lists ─────────────────────────────────────────────────────────

  const arrivingSoon = upcomingReservations.filter(r => isArrivingSoon(r.time, now));
  const upcoming     = upcomingReservations.filter(r => !isArrivingSoon(r.time, now));
  const totalCovers  = todayReservations
    .filter(r => r.status !== "CANCELLED" && r.status !== "NO_SHOW")
    .reduce((s, r) => s + r.partySize, 0);

  // ── Unified Sidebar ───────────────────────────────────────────────────────

  function Sidebar() {
    return (
      <View style={{ flex: 1 }}>

        {/* ── Summary bar ─────────────────────────────────────────────── */}
        <View style={{
          flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10,
          borderBottomWidth: 1, borderColor: C.rim, gap: 0,
        }}>
          {[
            { val: occupiedTables.length,                                      label: "seated",   color: C.jade  },
            { val: tables.filter(t => t.status === "AVAILABLE").length,        label: "open",     color: C.sky   },
            { val: activeWaitlist.length,                                      label: "waiting",  color: C.coral },
            { val: totalCovers,                                                label: "guests",   color: C.ember },
            { val: avgTurnMins > 0 ? `${avgTurnMins}m` : "—",                 label: "avg turn", color: C.mist  },
          ].map(({ val, label, color }, i, arr) => (
            <View key={label} style={{ flex: 1, alignItems: "center", borderRightWidth: i < arr.length - 1 ? 1 : 0, borderColor: C.rim }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color, lineHeight: 22 }}>{val}</Text>
              <Text style={{ fontSize: 8, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── Scrollable feed ─────────────────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={onRefresh
            ? <RefreshControl refreshing={!!isRefreshing} onRefresh={onRefresh} tintColor={C.gold} />
            : undefined}
        >

          {/* ── Arriving Soon ─────────────────────────────────────────── */}
          {arrivingSoon.length > 0 && (
            <>
              <SectionHeader label="Arriving Soon" color={C.gold} count={arrivingSoon.length} />
              {arrivingSoon.map((res) => (
                <View
                  key={res.id}
                  style={{
                    marginHorizontal: 12, marginBottom: 8,
                    backgroundColor: C.surface, borderRadius: 14,
                    borderWidth: 2, borderColor: C.gold,
                    padding: 12, gap: 8, ...shadow.sm,
                  }}
                >
                  {/* Time badge */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: "800", color: C.surface }}>{fmt12(res.time)}</Text>
                    </View>
                    <View style={{ backgroundColor: T.gold, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: C.gold }}>ARRIVING</Text>
                    </View>
                  </View>

                  {/* Guest info */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: T.gold, borderWidth: 1.5, borderColor: C.gold, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontWeight: "800", fontSize: 15, color: C.gold }}>{res.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontWeight: "700", color: C.pearl, fontSize: 15, flexShrink: 1 }} numberOfLines={1}>{res.name}</Text>
                        {res.requiresCard && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#1D4ED822", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Ionicons name="card-outline" size={10} color="#3B82F6" />
                            <Text style={{ fontSize: 9, fontWeight: "700", color: "#3B82F6" }}>
                              {res.cardLast4 ? `····${res.cardLast4}` : "CARD"}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 12, color: C.mist }}>
                        {res.partySize} guests{res.phone ? ` · ${res.phone}` : ""}
                      </Text>
                    </View>
                  </View>

                  {res.notes ? (
                    <Text style={{ fontSize: 11, color: C.gold, fontStyle: "italic" }} numberOfLines={1}>{res.notes}</Text>
                  ) : null}

                  {/* Actions */}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                    {onSeatReservation && (
                      <TouchableOpacity
                        onPress={() => onSeatReservation(res)}
                        style={{ flex: 1, paddingVertical: 11, borderRadius: 10, backgroundColor: C.gold, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, ...shadow.gold }}
                      >
                        <Ionicons name="restaurant-outline" size={14} color={C.surface} />
                        <Text style={{ color: C.surface, fontWeight: "800", fontSize: 14 }}>Seat Now</Text>
                      </TouchableOpacity>
                    )}
                    {onMarkNoShow && (
                      <TouchableOpacity
                        onPress={async () => { setMarkingId(res.id); try { await onMarkNoShow(res.id); } finally { setMarkingId(null); } }}
                        disabled={markingId === res.id}
                        style={{ paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}
                      >
                        {markingId === res.id
                          ? <ActivityIndicator size="small" color={C.mist} />
                          : <Text style={{ color: C.mist, fontWeight: "600", fontSize: 13 }}>No Show</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}

          {/* ── Waitlist ──────────────────────────────────────────────── */}
          <SectionHeader label="Waitlist" color={C.sky} count={activeWaitlist.length} onAdd={onAddWaitlist} />
          {activeWaitlist.length === 0 ? (
            EmptySection({ icon: "people-outline", text: "No one waiting" })
          ) : (
            activeWaitlist.map((entry, idx) => {
              const waitMins     = estimateWait(idx + 1, entry.partySize, tables);
              const hasAvailFit  = tables.some(t => t.status === "AVAILABLE" && t.capacity >= entry.partySize);
              const waitedMins   = elapsedMins(entry.addedAt);
              return (
                <View
                  key={entry.id}
                  style={{
                    marginHorizontal: 12, marginBottom: 8,
                    backgroundColor: C.surface, borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: hasAvailFit ? C.jade : waitedMins > 30 ? C.coral : C.rim,
                    padding: 12, gap: 8, ...shadow.sm,
                  }}
                >
                  {/* Position badge */}
                  <View style={{ position: "absolute", top: 10, left: -1, backgroundColor: C.gold, borderTopLeftRadius: 14, borderBottomRightRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: C.surface }}>#{idx + 1}</Text>
                  </View>

                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: hasAvailFit ? T.jade : T.sky,
                      borderWidth: 1.5, borderColor: hasAvailFit ? C.jade : C.sky,
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <Text style={{ fontWeight: "800", fontSize: 15, color: hasAvailFit ? C.jade : C.sky }}>
                        {entry.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <Text style={{ fontWeight: "700", color: C.pearl, fontSize: 14 }}>{entry.name}</Text>
                        {hasAvailFit ? (
                          <View style={{ backgroundColor: T.jade, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: "800", color: C.jade }}>TABLE READY</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 11, color: waitedMins > 30 ? C.coral : C.smoke, fontWeight: "600" }}>{waitMins}m</Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: C.mist, marginTop: 1 }}>
                        {entry.partySize}p · waited {elapsedLabel(entry.addedAt)}
                        {entry.notes ? ` · ${entry.notes}` : ""}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {onSeatWaitlistEntry && (
                      <TouchableOpacity
                        onPress={() => onSeatWaitlistEntry(entry)}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, backgroundColor: hasAvailFit ? C.jade : C.gold }}
                      >
                        <Ionicons name="restaurant-outline" size={13} color={C.surface} />
                        <Text style={{ color: C.surface, fontWeight: "700", fontSize: 13 }}>Seat Party</Text>
                      </TouchableOpacity>
                    )}
                    {onMarkLeft && (
                      <TouchableOpacity
                        onPress={async () => { setMarkingId(entry.id); try { await onMarkLeft(entry.id); } finally { setMarkingId(null); } }}
                        disabled={markingId === entry.id}
                        style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}
                      >
                        {markingId === entry.id
                          ? <ActivityIndicator size="small" color={C.mist} />
                          : <Text style={{ color: C.mist, fontWeight: "600", fontSize: 12 }}>Left</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {/* ── Upcoming Reservations ─────────────────────────────────── */}
          <SectionHeader label="Upcoming" color={C.sky} count={upcoming.length} onAdd={onAddReservation} />
          {upcoming.length === 0 && todayReservations.filter(r => r.status === "PENDING" || r.status === "CONFIRMED").length === arrivingSoon.length ? (
            EmptySection({ icon: "calendar-outline", text: "No upcoming reservations" })
          ) : (
            upcoming.map((res) => (
              <View
                key={res.id}
                style={{
                  marginHorizontal: 12, marginBottom: 8,
                  backgroundColor: C.surface, borderRadius: 12,
                  borderWidth: 1, borderColor: C.rimBright,
                  padding: 12, ...shadow.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {/* Time pill */}
                  <View style={{ backgroundColor: C.surfaceHi, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, minWidth: 52, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "800", color: C.pearl, lineHeight: 16 }}>{fmt12(res.time).split(" ")[0]}</Text>
                    <Text style={{ fontSize: 9, color: C.smoke }}>{fmt12(res.time).split(" ")[1]}</Text>
                  </View>
                  {/* Details */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontWeight: "700", color: C.pearl, fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{res.name}</Text>
                      {res.requiresCard && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#1D4ED822", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                          <Ionicons name="card-outline" size={10} color="#3B82F6" />
                          <Text style={{ fontSize: 9, fontWeight: "700", color: "#3B82F6" }}>
                            {res.cardLast4 ? `····${res.cardLast4}` : "CARD"}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: C.mist, marginTop: 1 }}>
                      {res.partySize}p{res.phone ? ` · ${res.phone}` : ""}
                      {res.notes ? ` · ${res.notes}` : ""}
                    </Text>
                  </View>
                  {/* Seat button */}
                  {onSeatReservation && (
                    <TouchableOpacity
                      onPress={() => onSeatReservation(res)}
                      style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold }}
                    >
                      <Text style={{ color: C.gold, fontWeight: "700", fontSize: 13 }}>Seat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}

          {/* ── Seated Tables ─────────────────────────────────────────── */}
          {occupiedTables.length > 0 && (
            <>
              <SectionHeader label="Seated Tables" color={C.jade} count={occupiedTables.length} />
              {occupiedTables.map(t => {
                const order     = openOrders.find(o => o.tableId === t.id);
                const mins      = t.seatedAt ? elapsedMins(t.seatedAt) : 0;
                const barPct    = Math.min(1, mins / Math.max(amberAt, redAt));
                const barColor  = timerColor(t.seatedAt ?? "", amberAt, redAt);
                const bgTint    = timerBg(t.seatedAt ?? "", amberAt, redAt);
                const stageCol  = t.serviceStage ? (STAGE_COLOR[t.serviceStage] ?? null) : null;
                return (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => onTablePress(t)}
                    activeOpacity={0.75}
                    style={{
                      marginHorizontal: 12, marginBottom: 8,
                      backgroundColor: C.surface, borderRadius: 12,
                      borderWidth: 1, borderColor: stageCol ? stageCol + "55" : C.rim,
                      overflow: "hidden", ...shadow.sm,
                    }}
                  >
                    {/* Stage top strip */}
                    {stageCol && (
                      <View style={{ height: 3, backgroundColor: stageCol }} />
                    )}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
                      {/* Table badge */}
                      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: bgTint, borderWidth: 1.5, borderColor: barColor, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 16, fontWeight: "900", color: barColor }}>{t.number}</Text>
                      </View>
                      {/* Info */}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", color: C.pearl, fontSize: 14 }} numberOfLines={1}>
                          {t.guestName ?? `Table ${t.number}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.mist, marginTop: 1 }}>
                          {t.partySize}p{t.server ? ` · ${t.server.name.split(" ")[0]}` : ""}
                          {t.serviceStage ? ` · ${t.serviceStage.replace(/_/g, " ")}` : ""}
                        </Text>
                      </View>
                      {/* Timer + total */}
                      <View style={{ alignItems: "flex-end" }}>
                        {t.seatedAt && (
                          <Text style={{ fontSize: 18, fontWeight: "800", color: barColor }}>{elapsedLabel(t.seatedAt)}</Text>
                        )}
                        {order && <Text style={{ fontSize: 11, fontWeight: "700", color: C.jade }}>${Number(order.total).toFixed(2)}</Text>}
                      </View>
                    </View>
                    {/* Turn-time progress bar */}
                    <View style={{ height: 3, backgroundColor: C.rim }}>
                      <View style={{ height: "100%", backgroundColor: barColor, width: `${barPct * 100}%` }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {/* All-empty state */}
          {occupiedTables.length === 0 && activeWaitlist.length === 0 && upcomingReservations.length === 0 && (
            <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
              <Ionicons name="restaurant-outline" size={40} color={C.smoke} />
              <Text style={{ color: C.mist, fontSize: 15, fontWeight: "600" }}>Ready for service</Text>
              <Text style={{ color: C.smoke, fontSize: 13, textAlign: "center", paddingHorizontal: 24 }}>
                Use Walk-in, Waitlist, or Reserve to get started.
              </Text>
            </View>
          )}

        </ScrollView>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      presentationStyle="fullScreen"
      // Without this the fullScreen Modal locks to portrait on iPad while the
      // station screen forces landscape — the content renders rotated and every
      // tap lands in a dead zone. Allowing landscape keeps touch coords aligned.
      supportedOrientations={["portrait", "landscape", "landscape-left", "landscape-right"]}
    >
      <View style={{ flex: 1, backgroundColor: C.void }}>

        {/* Header — paddingTop carries the status-bar inset manually, because a
            SafeAreaView reports 0 insets inside a fullscreen Modal on iOS. */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          paddingHorizontal: 16, paddingTop: 10 + topInset, paddingBottom: 10,
          backgroundColor: C.surface,
          borderBottomWidth: 1, borderColor: C.rim, gap: 10,
        }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}
          >
            <Ionicons name="close" size={18} color={C.mist} />
          </TouchableOpacity>

          {onSwitchStation && (
            <TouchableOpacity
              onPress={onSwitchStation}
              style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="swap-horizontal" size={18} color={C.gold} />
            </TouchableOpacity>
          )}

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: "800", color: C.pearl, letterSpacing: -0.3 }}>Host Stand</Text>
            <Text style={{ fontSize: 11, color: C.mist }}>
              {occupiedTables.length} seated · {activeWaitlist.length} waiting · {upcomingReservations.length} upcoming
            </Text>
          </View>

          {/* Quick-add buttons */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {onAddWalkIn && (
              <TouchableOpacity
                onPress={onAddWalkIn}
                style={isTablet
                  ? { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gold, ...shadow.sm }
                  : { width: 36, height: 36, borderRadius: 10, backgroundColor: C.gold, alignItems: "center", justifyContent: "center", ...shadow.sm }
                }
              >
                <Ionicons name="walk-outline" size={16} color={C.surface} />
                {isTablet && <Text style={{ color: C.surface, fontWeight: "700", fontSize: 13 }}>Walk-in</Text>}
              </TouchableOpacity>
            )}
            {onAddWaitlist && (
              <TouchableOpacity
                onPress={onAddWaitlist}
                style={isTablet
                  ? { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.sky }
                  : { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.sky, alignItems: "center", justifyContent: "center" }
                }
              >
                <Ionicons name="person-add-outline" size={16} color={C.sky} />
                {isTablet && <Text style={{ color: C.sky, fontWeight: "700", fontSize: 13 }}>Waitlist</Text>}
              </TouchableOpacity>
            )}
            {onAddReservation && (
              <TouchableOpacity
                onPress={onAddReservation}
                style={isTablet
                  ? { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.gold }
                  : { width: 36, height: 36, borderRadius: 10, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.gold, alignItems: "center", justifyContent: "center" }
                }
              >
                <Ionicons name="calendar-outline" size={16} color={C.gold} />
                {isTablet && <Text style={{ color: C.gold, fontWeight: "700", fontSize: 13 }}>Reserve</Text>}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Body */}
        {isTablet ? (
          // Two-panel tablet layout
          <View style={{ flex: 1, flexDirection: "row" }}>
            {/* Left: floor plan */}
            <View style={{ flex: 1, borderRightWidth: 1, borderColor: C.rim }}>
              <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset + 8 }}>
                <TableCanvas
                  tables={tables}
                  openOrders={openOrders}
                  canvasH={canvasH}
                  tableSize={tableSize}
                  amberAt={amberAt}
                  redAt={redAt}
                  showServerBadge={showServerBadge}
                  showOrderTotal={showOrderTotal}
                  showGuestLabel={showGuestLabel}
                  tick={0}
                  onTablePress={onTablePress}
                  onLayoutSaved={onLayoutSaved}
                />
              </ScrollView>
            </View>
            {/* Right: sidebar */}
            <View style={{ width: 340, backgroundColor: C.void }}>
              {Sidebar()}
            </View>
          </View>
        ) : (
          // Phone: stacked layout
          <View style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: bottomInset + 8 }}>
              <TableCanvas
                tables={tables}
                openOrders={openOrders}
                canvasH={canvasH}
                tableSize={tableSize}
                amberAt={amberAt}
                redAt={redAt}
                showServerBadge={showServerBadge}
                showOrderTotal={showOrderTotal}
                showGuestLabel={showGuestLabel}
                tick={0}
                onTablePress={onTablePress}
                onLayoutSaved={onLayoutSaved}
              />
            </ScrollView>
            <View style={{ height: 1, backgroundColor: C.rim }} />
            {Sidebar()}
          </View>
        )}

      </View>
    </Modal>
  );
}
