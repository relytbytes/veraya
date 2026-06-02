import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getVeraData, VeraAlert, getPredictedRunouts, getVeraAnomalies } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ── Colours ───────────────────────────────────────────────────────────────────

function healthColor(score: number) {
  if (score >= 90) return { ring: C.jade,  text: C.jade,  label: "Excellent" };
  if (score >= 75) return { ring: C.jade,  text: C.jade,  label: "Good" };
  if (score >= 60) return { ring: C.gold,  text: C.gold,  label: "Fair" };
  if (score >= 45) return { ring: C.ember, text: C.ember, label: "Strained" };
  return                   { ring: C.coral, text: C.coral, label: "Critical" };
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
        {/* Vera mark — the face logo */}
        <Image source={require("../assets/vera-avatar.png")} style={{ width: 44, height: 44, borderRadius: 12 }} />

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

      {/* Day P&L projection */}
      {data.projection && (
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rim }}>
          {[
            { label: "On pace", value: fmt(data.projection.projectedRevenue), color: C.pearl },
            { label: "Net", value: fmt(data.projection.projectedNet), color: data.projection.projectedNet >= 0 ? C.jade : C.coral },
            { label: "Break-even", value: fmt(data.projection.breakEvenRevenue), color: C.pearl },
          ].map((cell, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderLeftWidth: i ? 1 : 0, borderColor: C.rim }}>
              <Text style={{ fontSize: 9, color: C.smoke, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{cell.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: cell.color, marginTop: 2 }}>{cell.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Dimension chips — tap to jump to the issue */}
      {data.dimensions && data.dimensions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 14 }}>
          {data.dimensions.map((d) => {
            const dc = d.score >= 75 ? C.jade : d.score >= 60 ? C.gold : d.score >= 45 ? C.ember : C.coral;
            const topIssue = d.issues[0];
            return (
              <TouchableOpacity
                key={d.key}
                activeOpacity={0.7}
                onPress={() => topIssue?.link && router.push(linkToRoute(topIssue.link) as never)}
                style={{ width: "47%", flexGrow: 1, borderWidth: 1, borderColor: C.rim, borderRadius: 12, padding: 10, backgroundColor: C.surfaceHi }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: C.pearl }}>{d.label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: dc }}>{d.score}</Text>
                </View>
                <Text style={{ fontSize: 10, color: C.mist, marginTop: 3 }} numberOfLines={2}>
                  {topIssue ? (topIssue.action ?? topIssue.message) : (d.wins[0] ?? d.summary)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

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
