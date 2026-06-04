import { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPreShift, type PreShiftEntry, type PreShiftFlag } from "@/lib/api";
import { C, T } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(ymd: string) {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}
function money(cents: number) { return `$${(cents / 100).toFixed(0)}`; }

const FLAG_COLOR: Record<PreShiftFlag["kind"], { fg: string; bg: string }> = {
  positive: { fg: C.jade, bg: T.jade },
  watch: { fg: C.ember, bg: T.ember },
  info: { fg: C.sky, bg: T.sky },
};

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 10 }}>
      <Text style={{ fontSize: 20, fontWeight: "800", color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: C.smoke, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function GuestRow({ e }: { e: PreShiftEntry }) {
  const ins = e.insights;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rim, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "800", color: C.gold, width: 64 }}>{fmtTime(e.time)}</Text>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.pearl }}>{e.name}</Text>
        <Text style={{ fontSize: 11, color: C.smoke }}>{e.partySize} {e.partySize === 1 ? "guest" : "guests"}{e.tableNumber ? ` · T${e.tableNumber}` : ""}</Text>
      </View>

      {e.flags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {e.flags.map((f, i) => {
            const c = FLAG_COLOR[f.kind];
            return (
              <View key={i} style={{ backgroundColor: c.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: c.fg }}>{f.label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {ins && ins.visits > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Text style={{ fontSize: 11, color: C.mist }}>{ins.visits} visit{ins.visits === 1 ? "" : "s"}</Text>
          {ins.avgCheckCents > 0 && <Text style={{ fontSize: 11, color: C.mist }}>avg {money(ins.avgCheckCents)}</Text>}
          {ins.avgDwellMins ? <Text style={{ fontSize: 11, color: C.mist }}>{ins.avgDwellMins}m</Text> : null}
          {ins.avgTipPct != null && <Text style={{ fontSize: 11, color: C.mist }}>tips {ins.avgTipPct}%</Text>}
          {ins.favoriteItems.length > 0 && (
            <Text style={{ fontSize: 11, color: C.mist, flexShrink: 1 }} numberOfLines={1}>loves {ins.favoriteItems.slice(0, 2).map((f) => f.name).join(", ")}</Text>
          )}
        </View>
      )}

      {(e.guestNotes || e.notes) && (
        <Text style={{ fontSize: 11, color: C.smoke, fontStyle: "italic" }}>{e.guestNotes || e.notes}</Text>
      )}
    </View>
  );
}

export default function PreShiftScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [date, setDate] = useState(() => toYMD(new Date()));

  const { data, isLoading, refetch } = useQuery({ queryKey: ["preShift", date], queryFn: () => getPreShift(date) });
  const s = data?.summary;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Pre-Shift Brief"
        subtitle="Who's coming and what to watch"
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
      />

      {/* Date nav */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.surface, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <TouchableOpacity onPress={() => setDate(toYMD(addDays(new Date(date + "T12:00:00"), -1)))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={20} color={C.gold} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDate(toYMD(new Date()))}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{fmtDate(date)}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDate(toYMD(addDays(new Date(date + "T12:00:00"), 1)))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-forward" size={20} color={C.gold} />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(() => refetch())} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 64 }}><ActivityIndicator color={C.gold} /></View>
        ) : !data || data.entries.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 56, gap: 8 }}>
            <Ionicons name="calendar-clear-outline" size={34} color={C.smoke} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>No reservations booked</Text>
            <Text style={{ fontSize: 12, color: C.smoke }}>Nothing on the book for this date yet.</Text>
          </View>
        ) : (
          <>
            {/* Summary KPIs */}
            {s && (
              <View style={{ flexDirection: "row", backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                <Kpi label="Parties" value={s.parties} color={C.pearl} />
                <Kpi label="Guests" value={s.covers} color={C.pearl} />
                <Kpi label="PPX" value={s.ppx} color={C.jade} />
                <Kpi label="VIP" value={s.vip} color={C.gold} />
                <Kpi label="Watch" value={s.watch} color={s.watch > 0 ? C.ember : C.smoke} />
              </View>
            )}

            {/* Vera narrative */}
            {s && (
              <View style={{ flexDirection: "row", gap: 10, backgroundColor: T.gold, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: `${C.gold}33` }}>
                <Ionicons name="sparkles" size={16} color={C.gold} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: C.pearl, lineHeight: 19 }}>
                  {s.parties} {s.parties === 1 ? "party" : "parties"}, {s.covers} guests tonight. {s.ppx} to make feel special{s.watch ? `, ${s.watch} to keep an eye on` : ""}.
                </Text>
              </View>
            )}

            {/* Guest list */}
            <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
              {data.entries.map((e) => <GuestRow key={e.id} e={e} />)}
            </View>
          </>
        )}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
