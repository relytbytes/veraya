import {
  View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Image,
} from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { getVeraData, VeraAlert, VeraIndicator, getPredictedRunouts, getVeraAnomalies, sendVeraFeedback } from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ── Colours ───────────────────────────────────────────────────────────────────

// Bands mirror the web Vera panel: green → teal → amber → orange → red, so a
// "Fair" score reads as caution (amber), not a healthy teal.
function healthColor(score: number) {
  if (score >= 90) return { ring: C.jade,    text: C.jade,    label: "Excellent" };
  if (score >= 75) return { ring: C.gold,    text: C.gold,    label: "Good" };      // teal
  if (score >= 60) return { ring: C.ember,   text: C.ember,   label: "Fair" };      // amber
  if (score >= 45) return { ring: "#E8722C", text: "#E8722C", label: "Strained" };  // orange
  return                   { ring: C.coral,  text: C.coral,   label: "Critical" };  // red
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
  // Accounting format: negatives in parentheses, e.g. ($505).
  const v = "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `(${v})` : v;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VeraCard() {
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["vera"],
    queryFn: getVeraData,
    staleTime: 45 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnMount: true,
  });
  const { data: predData } = useQuery({ queryKey: ["vera-predicted"], queryFn: getPredictedRunouts, staleTime: 60_000, refetchInterval: 3 * 60_000 });
  const { data: anomData } = useQuery({ queryKey: ["vera-anomalies"], queryFn: getVeraAnomalies, staleTime: 10 * 60_000 });
  const predictions = (predData?.predictions ?? []).filter((p) => p.severity !== "ok").slice(0, 3);
  const anomalies = anomData?.anomalies ?? [];
  const [hiddenInd, setHiddenInd] = useState<Set<string>>(new Set());
  const [openDim, setOpenDim] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [expanded, setExpanded] = useState(false); // progressive disclosure — keep the landing card tight

  function indicatorFeedback(ind: VeraIndicator, action: "dismissed" | "helpful") {
    if (action === "dismissed") setHiddenInd((prev) => new Set(prev).add(ind.text));
    sendVeraFeedback(ind.key, action, ind.text).catch(() => { /* fire-and-forget */ });
  }

  function runsOut(p: { severity: string; estimatedRunsOut: string | null; hoursUntilMin: number | null }): string {
    if (p.severity === "out") return "out now";
    if (p.estimatedRunsOut) return new Date(p.estimatedRunsOut).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (p.hoursUntilMin != null) return `${p.hoursUntilMin.toFixed(1)}h`;
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
  // De-duplicate: don't repeat an alert in the bottom list if it already shows
  // as a "What stands out" indicator above (e.g. the out-of-stock line).
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const shownIndicatorKeys = new Set(
    (data.indicators ?? []).filter((ind) => !hiddenInd.has(ind.text)).map((ind) => norm(ind.text)),
  );
  const dedupedAlerts = data.alerts.filter((a) => !shownIndicatorKeys.has(norm(a.message)));
  // Collapsed view doesn't show the indicators, so don't hide their matching alerts there.
  const alertsList = expanded ? dedupedAlerts : data.alerts;
  const highAlerts  = alertsList.filter(a => a.severity === "HIGH");
  const otherAlerts = alertsList.filter(a => a.severity !== "HIGH");

  return (
    <View style={{
      backgroundColor: C.surface, borderRadius: 20,
      borderWidth: 1, borderColor: C.rim,
      overflow: "hidden", ...shadow.sm,
    }}>
      {/* Health accent strip — tracks the score color (green→amber→red), matching web */}
      <View style={{ height: 5, backgroundColor: hc.ring }} />
      {/* Vera header — identity + score on one row, narrative full-width below */}
      <View style={{ padding: 18, paddingBottom: 14, gap: 13 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          {/* Vera mark — face logo on a white chip so it reads on any surface */}
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "#fff", padding: 3, alignItems: "center", justifyContent: "center", ...shadow.sm }}>
            <Image source={require("../assets/vera-avatar.png")} style={{ width: "100%", height: "100%", borderRadius: 9 }} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: C.pearl, letterSpacing: -0.2 }}>Vera</Text>
              <Ionicons name="sparkles" size={12} color={C.ember} />
            </View>
            <Text style={{ fontSize: 10, fontWeight: "700", color: C.gold, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 2 }}>
              Right now
            </Text>
          </View>
          {/* Health score */}
          <View style={{ alignItems: "center" }}>
            <View style={{
              width: 58, height: 58, borderRadius: 16,
              borderWidth: 2.5, borderColor: hc.ring,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 23, fontWeight: "800", color: hc.text, lineHeight: 26 }}>{data.healthScore}</Text>
              <Text style={{ fontSize: 8, color: C.smoke, fontWeight: "700" }}>/ 100</Text>
            </View>
            <Text style={{ fontSize: 10, color: hc.text, fontWeight: "700", marginTop: 3 }}>{hc.label}</Text>
          </View>
        </View>
        {/* Narrative — full width, larger, higher-contrast */}
        <Text style={{ fontSize: 14.5, color: C.pearl, lineHeight: 21 }}>
          {data.narrative}
        </Text>
      </View>

      {/* Day P&L projection */}
      {data.projection && (
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rim }}>
          {[
            { label: "On pace for", value: fmt(data.projection.projectedRevenue), color: C.pearl },
            { label: "Projected net", value: fmt(data.projection.projectedNet), color: data.projection.projectedNet >= 0 ? C.jade : C.coral },
            { label: "Break-even", value: fmt(data.projection.breakEvenRevenue), color: C.pearl },
          ].map((cell, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderLeftWidth: i ? 1 : 0, borderColor: C.rim }}>
              <Text style={{ fontSize: 9, color: C.smoke, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{cell.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: cell.color, marginTop: 2 }}>{cell.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Needs attention — the action items, always visible up top */}
      {(data.alerts.length === 0 || alertsList.length > 0) && (
        <>
          <View style={{ height: 1, backgroundColor: C.rim, marginHorizontal: 18 }} />
          <View style={{ padding: 14, gap: 9 }}>
            {data.alerts.length === 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <Ionicons name="checkmark-circle-outline" size={16} color={C.jade} />
                <Text style={{ fontSize: 13.5, color: C.jade }}>All systems looking good.</Text>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 11, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>Needs attention</Text>
                {[...highAlerts, ...otherAlerts].map((alert, i) => (
                  <AlertRow key={i} alert={alert} onPress={() => router.push(linkToRoute(alert.link) as never)} />
                ))}
              </>
            )}
          </View>
        </>
      )}

      {/* Show full breakdown — keeps the landing card tight; everything below is on tap */}
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderTopWidth: 1, borderColor: C.rim }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: C.gold }}>{expanded ? "Hide breakdown" : "Show full breakdown"}</Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.gold} />
      </TouchableOpacity>

      {expanded && (<>

      {/* Where the money goes — projected P&L waterfall explaining the net above */}
      {data.projection && (
        <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.rim }}>
          <TouchableOpacity
            onPress={() => setShowBreakdown((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 9 }}
          >
            <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke }}>
              Where the money goes
              <Text style={{ color: C.smoke, fontWeight: "400" }}>  ·  {Math.round(data.projection.serviceElapsedPct)}% of service done</Text>
            </Text>
            <Ionicons name={showBreakdown ? "chevron-up" : "chevron-down"} size={15} color={C.smoke} />
          </TouchableOpacity>
          {showBreakdown && (() => {
            const p = data.projection;
            const pctOf = (n: number) => p.projectedRevenue > 0 ? `  ·  ${Math.round((n / p.projectedRevenue) * 100)}%` : "";
            const otherOpex = Math.max(0, p.projectedRevenue - p.projectedCOGS - p.projectedLabor - p.fixedDaily - p.projectedNet);
            const Row = ({ label, value, sub, strong, net }: { label: string; value: string; sub?: string; strong?: boolean; net?: boolean }) => (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 }}>
                <Text style={{ fontSize: 12.5, color: net ? C.pearl : C.mist, fontWeight: net ? "800" : "400" }}>{label}</Text>
                <Text style={{ fontSize: 12.5, color: net ? (p.projectedNet >= 0 ? C.jade : C.coral) : strong ? C.pearl : C.smoke, fontWeight: strong || net ? "800" : "500" }}>
                  {value}<Text style={{ color: C.smoke, fontWeight: "400" }}>{sub ?? ""}</Text>
                </Text>
              </View>
            );
            return (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2 }}>
                <Row label="Projected revenue" value={fmt(p.projectedRevenue)} strong />
                <Row label="Food & beverage cost" value={`(${fmt(p.projectedCOGS)})`} sub={pctOf(p.projectedCOGS)} />
                <Row label="Labor" value={`(${fmt(p.projectedLabor)})`} sub={pctOf(p.projectedLabor)} />
                <Row label="Fixed (rent, salaries)" value={`(${fmt(p.fixedDaily)})`} sub={pctOf(p.fixedDaily)} />
                {otherOpex > 0 && <Row label="Other operating" value={`(${fmt(otherOpex)})`} sub={pctOf(otherOpex)} />}
                <View style={{ height: 1, backgroundColor: C.rim, marginVertical: 5 }} />
                <Row label="Projected net" value={`${fmt(p.projectedNet)}`} sub={`  ·  ${Math.round(p.projectedMarginPct)}%`} net />
              </View>
            );
          })()}
        </View>
      )}

      {/* What stands out — vs the learned normal (tap icons to teach Vera) */}
      {data.indicators && data.indicators.some((ind) => !hiddenInd.has(ind.text)) && (
        <View style={{ paddingHorizontal: 14, paddingTop: 14, gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase" }}>What stands out</Text>
          {data.indicators.filter((ind) => !hiddenInd.has(ind.text)).map((ind, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
              <Ionicons
                name={ind.tone === "positive" ? "trending-up" : ind.tone === "concern" ? "warning-outline" : "information-circle-outline"}
                size={15}
                color={ind.tone === "positive" ? C.jade : ind.tone === "concern" ? C.ember : C.smoke}
                style={{ marginTop: 1 }}
              />
              <Text style={{ flex: 1, fontSize: 12.5, color: C.mist, lineHeight: 18 }}>{ind.text}</Text>
              <TouchableOpacity onPress={() => indicatorFeedback(ind, "helpful")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 2 }}>
                <Ionicons name="thumbs-up-outline" size={13} color={C.smoke} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => indicatorFeedback(ind, "dismissed")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingHorizontal: 2 }}>
                <Ionicons name="close" size={14} color={C.smoke} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* How the day grades — one row per dimension, tap to expand inline */}
      {data.dimensions && data.dimensions.length > 0 && (
        <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6, gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>How the day grades</Text>
          {data.dimensions.map((d) => {
            const dc = d.score >= 75 ? C.jade : d.score >= 60 ? C.gold : d.score >= 45 ? C.ember : C.coral;
            const open = openDim === d.key;
            const topIssue = d.issues[0];
            const sevColor = (s: string) => s === "HIGH" ? C.coral : s === "MEDIUM" ? C.ember : C.sky;
            const metColor = (s: string) => s === "excellent" || s === "good" ? C.jade : s === "fair" ? C.ember : C.coral;
            return (
              <View key={d.key} style={{ borderWidth: 1, borderColor: open ? dc : C.rim, borderRadius: 14, backgroundColor: open ? `${dc}0D` : C.surfaceHi, overflow: "hidden" }}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => setOpenDim(open ? null : d.key)} style={{ padding: 13, gap: 9 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: C.pearl }}>{d.label}</Text>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: dc }}>{d.score}</Text>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={15} color={C.smoke} />
                  </View>
                  {/* Score bar */}
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: C.rim, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${Math.max(2, Math.min(100, d.score))}%`, backgroundColor: dc, borderRadius: 3 }} />
                  </View>
                  <Text style={{ fontSize: 12.5, color: C.mist, lineHeight: 18 }} numberOfLines={open ? undefined : 2}>
                    {topIssue ? (topIssue.action ?? topIssue.message) : (d.wins[0] ?? d.summary)}
                  </Text>
                  {d.confidence < 0.5 && !open && (
                    <Text style={{ fontSize: 10.5, color: C.smoke }}>Early read — firms up as the shift fills in</Text>
                  )}
                </TouchableOpacity>

                {/* Inline expanded detail */}
                {open && (
                  <View style={{ borderTopWidth: 1, borderColor: `${dc}33`, paddingHorizontal: 13, paddingVertical: 12, gap: 11 }}>
                    <Text style={{ fontSize: 12.5, color: C.mist, lineHeight: 18 }}>{d.summary}</Text>

                    {d.metrics.length > 0 && (
                      <View style={{ gap: 6 }}>
                        {d.metrics.map((m, i) => (
                          <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: metColor(m.status) }} />
                              <Text style={{ fontSize: 12.5, color: C.mist }}>{m.label}</Text>
                            </View>
                            <Text style={{ fontSize: 12.5, fontWeight: "600", color: C.pearl }}>
                              {m.value}{m.target ? <Text style={{ color: C.smoke, fontWeight: "400" }}>{`  / ${m.target}`}</Text> : null}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {d.issues.map((iss, i) => (
                      <TouchableOpacity
                        key={`iss-${i}`}
                        activeOpacity={iss.link ? 0.7 : 1}
                        onPress={() => iss.link && router.push(linkToRoute(iss.link) as never)}
                        style={{ flexDirection: "row", gap: 8, borderLeftWidth: 2, borderLeftColor: sevColor(iss.severity), paddingLeft: 9 }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: "600", color: C.pearl }}>{iss.message}</Text>
                          {iss.action ? <Text style={{ fontSize: 11.5, color: C.mist, marginTop: 1 }}>{iss.action}</Text> : null}
                        </View>
                        {iss.link ? <Ionicons name="chevron-forward" size={14} color={C.smoke} /> : null}
                      </TouchableOpacity>
                    ))}

                    {d.wins.map((w, i) => (
                      <View key={`win-${i}`} style={{ flexDirection: "row", gap: 7, alignItems: "flex-start" }}>
                        <Ionicons name="checkmark-circle" size={14} color={C.jade} style={{ marginTop: 1 }} />
                        <Text style={{ fontSize: 12.5, color: C.mist, flex: 1 }}>{w}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
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

      {/* end full breakdown */}
      </>)}

      {/* What drives your profit — learned-weights detail */}
      {showTuning && data.learning && !data.learning.learning && data.learning.topDrivers.length > 0 && (
        <View style={{ borderTopWidth: 1, borderColor: C.rim, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: C.surfaceHi }}>
          <Text style={{ fontSize: 10, fontWeight: "800", color: C.smoke, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>What drives your profit</Text>
          {[...data.learning.topDrivers].sort((a, b) => b.weight - a.weight).map((t) => (
            <View key={t.key} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <Text style={{ width: 78, fontSize: 11, color: C.mist }} numberOfLines={1}>{t.label}</Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.rim, overflow: "hidden" }}>
                <View style={{ height: "100%", borderRadius: 3, backgroundColor: C.gold, width: `${Math.round(t.weight * 100)}%` }} />
              </View>
              <Text style={{ width: 30, textAlign: "right", fontSize: 11, fontWeight: "700", color: C.pearl }}>{Math.round(t.weight * 100)}%</Text>
              <Text style={{ width: 44, textAlign: "right", fontSize: 10, color: C.smoke }}>
                {t.corr != null ? `r ${t.corr >= 0 ? "+" : ""}${t.corr.toFixed(2)}` : "—"}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 10, color: C.smoke, marginTop: 4, lineHeight: 14 }}>
            Weight = how much Vera leans on each dimension, learned from {data.learning.daysObserved} days. r = how tightly it tracked your margin.
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={{
        borderTopWidth: 1, borderColor: C.rim,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 18, paddingVertical: 10,
      }}>
        {data.learning && !data.learning.learning && data.learning.topDrivers.length > 0 ? (
          <TouchableOpacity onPress={() => setShowTuning((v) => !v)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 10, color: C.smoke, flex: 1 }} numberOfLines={1}>
              Tuned to your data · {data.learning.topDrivers.slice(0, 2).map((t) => t.label).join(" + ")} drive your profit
            </Text>
            <Ionicons name={showTuning ? "chevron-up" : "chevron-down"} size={11} color={C.smoke} />
          </TouchableOpacity>
        ) : (
          <Text style={{ fontSize: 10, color: C.smoke, flex: 1 }} numberOfLines={1}>
            {data.learning
              ? `Vera is learning your patterns · ${data.learning.daysObserved}/${data.learning.minDays} days`
              : "Vera · always watching your restaurant's live data"}
          </Text>
        )}
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
