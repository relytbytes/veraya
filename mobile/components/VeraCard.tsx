import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getVeraData, VeraAlert, getPredictedRunouts, getVeraAnomalies } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ── Colours ───────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 90) return { ring: C.jade,  text: C.jade,  label: "Strong Day" };
  if (score >= 75) return { ring: C.ember, text: C.ember, label: "Attention Needed" };
  if (score >= 60) return { ring: C.gold,  text: C.gold,  label: "Multiple Issues" };
  return                   { ring: C.coral, text: C.coral, label: "Action Required" };
}

function severityColor(severity: VeraAlert["severity"]) {
  switch (severity) {
    case "HIGH":   return { dot: C.coral, text: C.coral, border: `${C.coral}28`, bg: T.coral };
    case "MEDIUM": return { dot: C.ember, text: C.ember, border: `${C.ember}28`, bg: T.ember };
    default:       return { dot: C.sky,   text: C.sky,   border: `${C.sky}28`,   bg: T.sky   };
  }
}

function categoryIcon(category: VeraAlert["category"]): IoniconName {
  switch (category) {
    case "SALES":        return "trending-up-outline";
    case "LABOR":        return "people-outline";
    case "INVENTORY":    return "cube-outline";
    case "COSTS":        return "cash-outline";
    case "RESERVATIONS": return "calendar-outline";
    case "OPERATIONS":   return "restaurant-outline";
    default:             return "bar-chart-outline";
  }
}

// Map web links → mobile routes
function linkToRoute(link: string): string {
  const map: Record<string, string> = {
    "/reports":     "/(app)/reports",
    "/inventory":   "/(app)/inventory",
    "/purchasing":  "/(app)/invoices",
    "/pos":         "/(app)/pos",
    "/staff":       "/(app)/staff",
    "/host":        "/(app)/reservations",
    "/manager-log": "/(app)/more",
  };
  return map[link] ?? "/(app)/reports";
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VeraCard() {
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["vera"],
    queryFn: getVeraData,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
  const { data: predData } = useQuery({ queryKey: ["vera-predicted"], queryFn: getPredictedRunouts, staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 });
  const { data: anomData } = useQuery({ queryKey: ["vera-anomalies"], queryFn: getVeraAnomalies, staleTime: 10 * 60_000 });
  const predictions = (predData?.predictions ?? []).filter((p) => p.severity !== "ok").slice(0, 3);
  const anomalies = anomData?.anomalies ?? [];

  function runsOut(p: { severity: string; estimatedRunsOut: string | null; hoursUntilMin: number | null }): string {
    if (p.severity === "out") return "out now";
    if (p.estimatedRunsOut) return "~" + new Date(p.estimatedRunsOut).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (p.hoursUntilMin != null) return `~${p.hoursUntilMin.toFixed(1)}h`;
    return "soon";
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{
        backgroundColor: C.surface, borderRadius: 20,
        borderWidth: 1, borderColor: C.rim,
        padding: 20, gap: 16, ...shadow.sm,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.surfaceHi }} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={{ height: 10, width: 120, backgroundColor: C.surfaceHi, borderRadius: 6 }} />
            <View style={{ height: 8, width: 180, backgroundColor: C.surfaceHi, borderRadius: 6 }} />
          </View>
          <ActivityIndicator color={C.gold} size="small" />
        </View>
        <View style={{ height: 32, backgroundColor: C.surfaceHi, borderRadius: 8 }} />
        {[1, 2].map(i => (
          <View key={i} style={{ height: 44, backgroundColor: C.surfaceHi, borderRadius: 10 }} />
        ))}
      </View>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────
  if (isError || !data) {
    return (
      <View style={{
        backgroundColor: C.surface, borderRadius: 20,
        borderWidth: 1, borderColor: C.rim,
        padding: 20, flexDirection: "row", alignItems: "center", gap: 12,
      }}>
        <Ionicons name="warning-outline" size={20} color={C.ember} />
        <Text style={{ flex: 1, fontSize: 13, color: C.mist }}>Could not load operational analysis.</Text>
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={{ fontSize: 12, color: C.gold, fontWeight: "600" }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hc = healthColor(data.healthScore);
  const highAlerts  = data.alerts.filter(a => a.severity === "HIGH");
  const otherAlerts = data.alerts.filter(a => a.severity !== "HIGH");
  const sig = data.rawSignals;

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 20,
      borderWidth: 1, borderColor: C.rim,
      overflow: "hidden", ...shadow.sm,
    }}>
      {/* Vera header band */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", padding: 18, gap: 14, backgroundColor: "#0C1A1E" }}>
        {/* Vera mark — navy coin, teal V, gold sparkle */}
        <View style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: "#11302C", borderWidth: 1.5, borderColor: "#244A44",
          alignItems: "center", justifyContent: "center",
        }}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: C.gold, lineHeight: 24 }}>V</Text>
          <Ionicons name="sparkles" size={11} color={C.ember} style={{ position: "absolute", top: 5, right: 5 }} />
        </View>

        {/* Identity + narrative */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2 }}>Vera</Text>
            <Ionicons name="sparkles" size={11} color={C.ember} />
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#5EEAD4", letterSpacing: 1.2, textTransform: "uppercase" }}>
              Always Working
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: "#C7D2DE", lineHeight: 19 }}>
            {data.narrative}
          </Text>
        </View>

        {/* Health score */}
        <View style={{ alignItems: "center", gap: 4 }}>
          <View style={{
            width: 52, height: 52, borderRadius: 14,
            backgroundColor: C.surface,
            borderWidth: 2, borderColor: hc.ring,
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: hc.text, lineHeight: 24 }}>
              {data.healthScore}
            </Text>
            <Text style={{ fontSize: 8, color: C.smoke, fontWeight: "600" }}>/100</Text>
          </View>
          <Text style={{ fontSize: 9, color: "#E5E8EC", fontWeight: "700", textAlign: "center", maxWidth: 52 }}>
            {hc.label}
          </Text>
        </View>
      </View>

      {/* Signal pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 14, gap: 8 }}
      >
        {sig.pacingRatio !== null && (
          <SignalPill
            icon={sig.pacingRatio >= 0.95 ? "trending-up-outline" : "trending-down-outline"}
            label="Sales pace"
            value={`${(sig.pacingRatio * 100).toFixed(0)}%`}
            ok={sig.pacingRatio >= 0.93}
            warn={sig.pacingRatio >= 0.80}
            onPress={() => router.push("/(app)/reports" as never)}
          />
        )}
        {sig.salesToday > 0 && (
          <SignalPill icon="cash-outline" label="Today" value={fmt(sig.salesToday)} ok onPress={() => router.push("/(app)/reports" as never)} />
        )}
        {sig.projectedLaborPct !== null && (
          <SignalPill
            icon="people-outline"
            label="Labor"
            value={`${sig.projectedLaborPct.toFixed(1)}%`}
            ok={sig.projectedLaborPct < 33}
            warn={sig.projectedLaborPct < 38}
            onPress={() => router.push("/(app)/staff" as never)}
          />
        )}
        {sig.lowStockCount > 0 && (
          <SignalPill icon="cube-outline" label="Low stock" value={String(sig.lowStockCount)} ok={false} warn={sig.lowStockCount < 4} onPress={() => router.push("/(app)/inventory" as never)} />
        )}
        {sig.active86Count > 0 && (
          <SignalPill icon="close-circle-outline" label="86'd" value={String(sig.active86Count)} ok={false} warn onPress={() => router.push("/(app)/pos" as never)} />
        )}
        {sig.confirmedCovers > 0 && (
          <SignalPill icon="calendar-outline" label="Covers" value={String(sig.confirmedCovers)} ok onPress={() => router.push("/(app)/reservations" as never)} />
        )}
      </ScrollView>

      {/* Vera caught — anomalies */}
      {anomalies.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Vera caught</Text>
          {anomalies.map((a, i) => {
            const high = a.severity === "HIGH";
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: high ? `${C.coral}33` : `${C.ember}33`, backgroundColor: high ? T.coral : T.ember, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 }}>
                <Ionicons name="alert-circle-outline" size={14} color={high ? C.coral : C.ember} />
                <Text style={{ flex: 1, fontSize: 12, color: C.pearl, lineHeight: 16 }}>{a.title}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Vera predicts — run-outs */}
      {predictions.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Vera predicts</Text>
          {predictions.map((p, i) => {
            const crit = p.severity === "out" || p.severity === "critical";
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, borderColor: crit ? `${C.coral}33` : `${C.ember}33`, backgroundColor: crit ? T.coral : T.ember, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6 }}>
                <Ionicons name="time-outline" size={14} color={crit ? C.coral : C.ember} />
                <Text style={{ flex: 1, fontSize: 12, color: C.pearl, lineHeight: 16 }}>
                  <Text style={{ fontWeight: "700" }}>{p.name}</Text> runs out <Text style={{ fontWeight: "600" }}>{runsOut(p)}</Text>
                  {p.affectedMenuItems.length > 0 ? `  ·  86s ${p.affectedMenuItems.slice(0, 2).join(", ")}` : ""}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: C.rim, marginHorizontal: 18 }} />

      {/* Alerts */}
      <View style={{ padding: 14, gap: 8 }}>
        {data.alerts.length === 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
            <Ionicons name="checkmark-circle-outline" size={16} color={C.jade} />
            <Text style={{ fontSize: 13, color: C.jade }}>All systems looking good.</Text>
          </View>
        ) : (
          [...highAlerts, ...otherAlerts].map((alert, i) => (
            <AlertRow key={i} alert={alert} onPress={() => router.push(linkToRoute(alert.link) as never)} />
          ))
        )}
      </View>

      {/* Footer */}
      <View style={{
        borderTopWidth: 1, borderColor: C.rim,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 18, paddingVertical: 10,
      }}>
        <Text style={{ fontSize: 10, color: C.smoke }}>Vera · always watching your live data</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          disabled={isRefetching}
          style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
        >
          <Ionicons name="refresh-outline" size={12} color={isRefetching ? C.smoke : C.mist} />
          <Text style={{ fontSize: 11, color: isRefetching ? C.smoke : C.mist }}>
            {isRefetching ? "Analyzing…" : "Refresh"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AlertRow({ alert, onPress }: { alert: VeraAlert; onPress: () => void }) {
  const cfg = severityColor(alert.severity);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row", alignItems: "center", gap: 10,
        borderRadius: 10, borderWidth: 1, borderColor: cfg.border,
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: cfg.bg,
      }}
    >
      {/* Severity dot */}
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.dot }} />

      {/* Category icon */}
      <Ionicons name={categoryIcon(alert.category)} size={13} color={cfg.text} />

      {/* Message */}
      <Text style={{ flex: 1, fontSize: 12, color: C.pearl, lineHeight: 17 }}>
        {alert.message}
      </Text>

      {/* Severity label */}
      <Text style={{ fontSize: 9, fontWeight: "800", color: cfg.text, letterSpacing: 0.5 }}>
        {alert.severity}
      </Text>
    </TouchableOpacity>
  );
}

function SignalPill({
  icon, label, value, ok, warn, onPress,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  ok: boolean;
  warn?: boolean;
  onPress: () => void;
}) {
  const color = ok
    ? { text: C.jade,  border: `${C.jade}30`,  bg: T.jade  }
    : warn
    ? { text: C.ember, border: `${C.ember}30`, bg: T.ember }
    : { text: C.coral, border: `${C.coral}30`, bg: T.coral };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row", alignItems: "center", gap: 5,
        paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 8, borderWidth: 1,
        borderColor: color.border, backgroundColor: color.bg,
      }}
    >
      <Ionicons name={icon} size={12} color={color.text} />
      <Text style={{ fontSize: 10, color: C.smoke }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: "700", color: color.text }}>{value}</Text>
    </TouchableOpacity>
  );
}
