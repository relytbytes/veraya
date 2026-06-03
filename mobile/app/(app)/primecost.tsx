import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getCogsReport } from "@/lib/api";
import { C, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

// ── Date helpers ──────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

type RangeKey = "week" | "month" | "quarter" | "ytd";

function getRangeDates(key: RangeKey): { from: string; to: string; label: string } {
  const now = new Date();
  const today = toYMD(now);
  switch (key) {
    case "week": {
      const dow = now.getDay(); // 0=Sun
      const start = addDays(now, -dow);
      return { from: toYMD(start), to: today, label: "This Week" };
    }
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toYMD(start), to: today, label: "This Month" };
    }
    case "quarter": {
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { from: toYMD(qStart), to: today, label: "This Quarter" };
    }
    case "ytd": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: toYMD(start), to: today, label: "Year to Date" };
    }
  }
}

// ── Prime cost thresholds ─────────────────────────────────────────────────────
// Industry: food ~28-32%, labor ~28-35%, prime cost <62% = excellent

function primeCostColor(pct: number) {
  if (pct <= 55) return C.jade;
  if (pct <= 62) return C.gold;
  if (pct <= 68) return "#f97316"; // orange
  return C.coral;
}

function primeCostLabel(pct: number) {
  if (pct <= 55) return "Excellent";
  if (pct <= 62) return "On Target";
  if (pct <= 68) return "Watch";
  return "Over Target";
}

function foodCostColor(pct: number) {
  if (pct <= 28) return C.jade;
  if (pct <= 32) return C.gold;
  return C.coral;
}

function laborCostColor(pct: number) {
  if (pct <= 28) return C.jade;
  if (pct <= 35) return C.gold;
  return C.coral;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

function fmtDollars(n: number) {
  // Accounting format: negatives in parentheses.
  const a = Math.abs(n);
  const v = a >= 1_000_000 ? `$${(a / 1_000_000).toFixed(1)}M`
    : a >= 1_000 ? `$${(a / 1_000).toFixed(1)}K`
    : `$${a.toFixed(0)}`;
  return n < 0 ? `(${v})` : v;
}

function deltaBadge(curr: number, prev: number, lower_is_better = false) {
  if (prev === 0) return null;
  const diff = curr - prev;
  const pctChange = (diff / prev) * 100;
  const isGood = lower_is_better ? diff <= 0 : diff >= 0;
  const sign = diff > 0 ? "+" : "";
  return { text: `${sign}${pctChange.toFixed(1)}%`, good: isGood };
}

// ── Weekly bucketing ──────────────────────────────────────────────────────────

function groupByWeek(dailyPL: { date: string; revenue: number; cogs: number; laborCost: number; grossProfit: number }[]) {
  const weeks = new Map<string, { revenue: number; cogs: number; laborCost: number; days: number }>();
  for (const d of dailyPL) {
    const date = new Date(d.date + "T12:00:00");
    const dow = date.getDay();
    const weekStart = addDays(date, -dow);
    const key = toYMD(weekStart);
    const ex = weeks.get(key) ?? { revenue: 0, cogs: 0, laborCost: 0, days: 0 };
    ex.revenue += d.revenue;
    ex.cogs += d.cogs;
    ex.laborCost += d.laborCost;
    ex.days += 1;
    weeks.set(key, ex);
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, v]) => ({
      weekStart,
      revenue: v.revenue,
      cogs: v.cogs,
      laborCost: v.laborCost,
      primeCostPct: v.revenue > 0 ? ((v.cogs + v.laborCost) / v.revenue) * 100 : 0,
      foodCostPct: v.revenue > 0 ? (v.cogs / v.revenue) * 100 : 0,
      laborCostPct: v.revenue > 0 ? (v.laborCost / v.revenue) * 100 : 0,
      days: v.days,
    }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "QTD" },
  { key: "ytd", label: "YTD" },
];

export default function PrimeCostScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [range, setRange] = useState<RangeKey>("month");

  const { from, to } = useMemo(() => getRangeDates(range), [range]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["primecost", from, to],
    queryFn: () => getCogsReport(from, to),
  });

  const n = (v: unknown) => Number(v ?? 0);

  const primeCostAmt = data ? n(data.theoreticalCOGS) + n(data.laborCost) + n(data.salaryCost) : 0;
  const primeCostPct = data && n(data.revenue) > 0
    ? (primeCostAmt / n(data.revenue)) * 100
    : 0;

  const prevPrimeCostAmt = data ? n(data.prevCOGS) + n(data.prevLaborCost) : 0;
  const prevPrimeCostPct = data && n(data.prevRevenue) > 0
    ? (prevPrimeCostAmt / n(data.prevRevenue)) * 100
    : 0;

  const weeklyData = useMemo(
    () => data ? groupByWeek(data.dailyPL ?? []) : [],
    [data]
  );

  const maxWeekRevenue = useMemo(
    () => Math.max(...weeklyData.map((w) => w.revenue), 1),
    [weeklyData]
  );

  const delta = data ? deltaBadge(primeCostPct, prevPrimeCostPct, true) : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Prime Cost"
        subtitle={data ? `${fmtPct(primeCostPct)} · ${fmtDollars(n(data.revenue))} revenue` : "Food + Labor vs Revenue"}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
      />

      {/* Range selector */}
      <View style={{
        flexDirection: "row", backgroundColor: C.surface,
        borderBottomWidth: 1, borderBottomColor: C.rim,
        paddingHorizontal: 16, paddingVertical: 10, gap: 8,
      }}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.key}
            onPress={() => setRange(r.key)}
            style={{
              flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 10,
              backgroundColor: range === r.key ? C.gold : C.surfaceHi,
              borderWidth: 1, borderColor: range === r.key ? C.gold : C.rim,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: range === r.key ? "#fff" : C.mist }}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={C.gold} size="large" />
          <Text style={{ color: C.mist, fontSize: 13 }}>Calculating prime cost…</Text>
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {data && (
            <>
              {/* ── Prime Cost Hero ── */}
              <View style={{
                backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.rim,
                padding: 20, alignItems: "center", gap: 8, ...shadow.sm,
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                  Prime Cost %
                </Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
                  <Text style={{ fontSize: 56, fontWeight: "800", color: primeCostColor(primeCostPct), lineHeight: 64 }}>
                    {fmtPct(primeCostPct)}
                  </Text>
                  {delta && (
                    <View style={{
                      marginBottom: 12,
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                      backgroundColor: delta.good ? C.jade + "18" : C.coral + "18",
                    }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: delta.good ? C.jade : C.coral }}>
                        {delta.text}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Status chip */}
                <View style={{
                  paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: primeCostColor(primeCostPct) + "18",
                  borderWidth: 1, borderColor: primeCostColor(primeCostPct) + "44",
                }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: primeCostColor(primeCostPct) }}>
                    {primeCostLabel(primeCostPct)}
                  </Text>
                </View>

                {/* Target bar */}
                <View style={{ width: "100%", marginTop: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, color: C.smoke }}>0%</Text>
                    <Text style={{ fontSize: 10, color: C.jade }}>Target ≤62%</Text>
                    <Text style={{ fontSize: 10, color: C.smoke }}>100%</Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: C.surfaceHi, borderRadius: 3, overflow: "hidden" }}>
                    {/* Zones */}
                    <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "55%", backgroundColor: C.jade + "30" }} />
                    <View style={{ position: "absolute", left: "55%", top: 0, bottom: 0, width: "7%", backgroundColor: C.gold + "30" }} />
                    <View style={{ position: "absolute", left: "62%", top: 0, bottom: 0, width: "6%", backgroundColor: "#f97316" + "30" }} />
                    <View style={{ position: "absolute", left: "68%", top: 0, bottom: 0, right: 0, backgroundColor: C.coral + "30" }} />
                    {/* Indicator */}
                    <View style={{
                      position: "absolute", top: 0, bottom: 0,
                      left: 0, width: `${Math.min(primeCostPct, 100)}%`,
                      backgroundColor: primeCostColor(primeCostPct) + "88",
                      borderRadius: 3,
                    }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 4 }}>
                    <Text style={{ fontSize: 9, color: C.jade }}>✓ Excellent ≤55%</Text>
                    <Text style={{ fontSize: 9, color: C.gold }}>On Target ≤62%</Text>
                    <Text style={{ fontSize: 9, color: C.coral }}>Over ›68%</Text>
                  </View>
                </View>
              </View>

              {/* ── KPI tiles ── */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[
                  {
                    label: "Revenue",
                    value: fmtDollars(n(data.revenue)),
                    sub: `vs ${fmtDollars(n(data.prevRevenue))} prior`,
                    color: C.sky,
                    icon: "trending-up-outline" as const,
                  },
                  {
                    label: "Food Cost",
                    value: fmtPct(n(data.cogsPercent)),
                    sub: fmtDollars(n(data.theoreticalCOGS)),
                    color: foodCostColor(n(data.cogsPercent)),
                    icon: "restaurant-outline" as const,
                  },
                  {
                    label: "Labor",
                    value: fmtPct(n(data.laborPercent)),
                    sub: fmtDollars(n(data.laborCost) + n(data.salaryCost)),
                    color: laborCostColor(n(data.laborPercent)),
                    icon: "people-outline" as const,
                  },
                  {
                    label: "Gross Margin",
                    value: fmtPct(n(data.grossMargin)),
                    sub: fmtDollars(n(data.grossProfit)),
                    color: C.jade,
                    icon: "cash-outline" as const,
                  },
                ].map((tile) => (
                  <View key={tile.label} style={{
                    flex: 1, backgroundColor: C.surface, borderRadius: 14,
                    padding: 12, gap: 4, borderWidth: 1, borderColor: C.rim, alignItems: "center",
                  }}>
                    <View style={{
                      width: 30, height: 30, borderRadius: 9,
                      backgroundColor: tile.color + "18", alignItems: "center", justifyContent: "center",
                      marginBottom: 2,
                    }}>
                      <Ionicons name={tile.icon} size={15} color={tile.color} />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: tile.color }}>{tile.value}</Text>
                    <Text style={{ fontSize: 9, color: C.smoke, textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5 }}>{tile.label}</Text>
                    <Text style={{ fontSize: 9, color: C.mist, textAlign: "center" }}>{tile.sub}</Text>
                  </View>
                ))}
              </View>

              {/* ── Breakdown: Food vs Labor stacked bar ── */}
              <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                  Cost Breakdown
                </Text>

                {/* Stacked bar */}
                <View>
                  <View style={{ flexDirection: "row", height: 28, borderRadius: 8, overflow: "hidden", gap: 1 }}>
                    {/* Food cost */}
                    <View style={{
                      flex: n(data.cogsPercent),
                      backgroundColor: foodCostColor(n(data.cogsPercent)),
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {n(data.cogsPercent) > 8 && (
                        <Text style={{ fontSize: 9, fontWeight: "700", color: "#fff" }}>
                          {fmtPct(n(data.cogsPercent))}
                        </Text>
                      )}
                    </View>
                    {/* Labor */}
                    <View style={{
                      flex: n(data.laborPercent),
                      backgroundColor: laborCostColor(n(data.laborPercent)) + "cc",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {n(data.laborPercent) > 8 && (
                        <Text style={{ fontSize: 9, fontWeight: "700", color: "#fff" }}>
                          {fmtPct(n(data.laborPercent))}
                        </Text>
                      )}
                    </View>
                    {/* Remaining */}
                    <View style={{ flex: Math.max(0, 100 - n(data.cogsPercent) - n(data.laborPercent)), backgroundColor: C.surfaceHi }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: foodCostColor(n(data.cogsPercent)) }} />
                      <Text style={{ fontSize: 11, color: C.mist }}>Food Cost</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: laborCostColor(n(data.laborPercent)) + "cc" }} />
                      <Text style={{ fontSize: 11, color: C.mist }}>Labor</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: C.surfaceHi }} />
                      <Text style={{ fontSize: 11, color: C.mist }}>Other / Profit</Text>
                    </View>
                  </View>
                </View>

                {/* Row stats */}
                {[
                  { label: "Food Cost", pct: n(data.cogsPercent), amt: n(data.theoreticalCOGS), target: 32, color: foodCostColor(n(data.cogsPercent)) },
                  { label: "Labor (hourly)", pct: n(data.laborPercent), amt: n(data.laborCost), target: 30, color: laborCostColor(n(data.laborPercent)) },
                  { label: "Labor (salary)", pct: n(data.revenue) > 0 ? (n(data.salaryCost) / n(data.revenue)) * 100 : 0, amt: n(data.salaryCost), target: 0, color: C.sky },
                  { label: "Prime Cost", pct: primeCostPct, amt: primeCostAmt, target: 62, color: primeCostColor(primeCostPct) },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.rim }}>
                    <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: row.color, marginRight: 8 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: C.mist }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: row.color, marginRight: 8 }}>{fmtPct(row.pct)}</Text>
                    <Text style={{ fontSize: 12, color: C.smoke, width: 70, textAlign: "right" }}>{fmtDollars(row.amt)}</Text>
                    {row.target > 0 && (
                      <View style={{
                        marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                        backgroundColor: row.pct <= row.target ? C.jade + "18" : C.coral + "18",
                      }}>
                        <Text style={{ fontSize: 9, fontWeight: "700", color: row.pct <= row.target ? C.jade : C.coral }}>
                          {row.pct <= row.target ? "✓" : "▲"} {row.target}%
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* ── Weekly trend ── */}
              {weeklyData.length > 1 && (
                <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                    Weekly Trend
                  </Text>
                  {weeklyData.map((week, i) => {
                    const barW = week.revenue > 0 ? (week.revenue / maxWeekRevenue) * 100 : 0;
                    const weekLabel = new Date(week.weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const pc = week.primeCostPct;
                    return (
                      <View key={week.weekStart} style={{ gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 11, color: C.mist, width: 60 }}>Wk {i + 1} ({weekLabel})</Text>
                          <Text style={{ fontSize: 11, color: C.smoke }}>{fmtDollars(week.revenue)}</Text>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: primeCostColor(pc) }}>{fmtPct(pc)}</Text>
                        </View>
                        {/* Stacked bar */}
                        <View style={{ height: 8, backgroundColor: C.surfaceHi, borderRadius: 4, overflow: "hidden" }}>
                          <View style={{ height: 8, flexDirection: "row", width: `${barW}%`, borderRadius: 4, overflow: "hidden" }}>
                            <View style={{
                              flex: week.foodCostPct,
                              backgroundColor: foodCostColor(week.foodCostPct),
                            }} />
                            <View style={{
                              flex: week.laborCostPct,
                              backgroundColor: laborCostColor(week.laborCostPct) + "cc",
                            }} />
                          </View>
                        </View>
                        {/* Target line indicator at 62% */}
                        <View style={{
                          position: "absolute", top: 22, left: `${barW * 0.62}%`,
                          width: 1.5, height: 8, backgroundColor: C.rim,
                        }} />
                      </View>
                    );
                  })}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 4 }}>
                    <View style={{ width: 1.5, height: 10, backgroundColor: C.rim }} />
                    <Text style={{ fontSize: 10, color: C.smoke }}>Target line at 62%</Text>
                  </View>
                </View>
              )}

              {/* ── Operating summary ── */}
              <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rim }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                    P&L Summary
                  </Text>
                </View>
                {[
                  { label: "Revenue", value: fmtDollars(n(data.revenue)), prev: fmtDollars(n(data.prevRevenue)), positive: true, bold: false },
                  { label: "− Food COGS", value: fmtDollars(n(data.theoreticalCOGS)), prev: fmtDollars(n(data.prevCOGS)), positive: false, bold: false },
                  { label: "= Gross Profit", value: fmtDollars(n(data.grossProfit)), prev: fmtDollars(n(data.prevGrossProfit)), positive: true, bold: true, color: C.jade },
                  { label: "− Labor", value: fmtDollars(n(data.laborCost) + n(data.salaryCost)), prev: fmtDollars(n(data.prevLaborCost)), positive: false, bold: false },
                  { label: "= Operating Income", value: fmtDollars(n(data.operatingIncome)), prev: fmtDollars(n(data.prevOperatingIncome)), positive: true, bold: true, color: n(data.operatingIncome) >= 0 ? C.jade : C.coral },
                ].map((row, i) => (
                  <View key={row.label} style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: C.rim,
                    backgroundColor: row.bold ? C.surfaceHi : "transparent",
                  }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: row.bold ? "700" : "400", color: row.bold ? C.pearl : C.mist }}>
                      {row.label}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.smoke, marginRight: 16 }}>
                      prev {row.prev}
                    </Text>
                    <Text style={{
                      fontSize: 14, fontWeight: row.bold ? "700" : "600",
                      color: (row as { color?: string }).color ?? (row.positive ? C.pearl : C.smoke),
                    }}>
                      {row.value}
                    </Text>
                  </View>
                ))}
              </View>

              {/* ── Category breakdown ── */}
              {(data.categoryBreakdown ?? []).length > 0 && (
                <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rim }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                      Food Cost by Category
                    </Text>
                  </View>
                  {(data.categoryBreakdown ?? []).map((cat, i) => {
                    const pct = cat.revenue > 0 ? (cat.cogs / cat.revenue) * 100 : 0;
                    const maxRev = Math.max(...(data.categoryBreakdown ?? []).map(c => c.revenue), 1);
                    return (
                      <View key={cat.category} style={{
                        paddingHorizontal: 16, paddingVertical: 11,
                        borderBottomWidth: i < (data.categoryBreakdown ?? []).length - 1 ? 1 : 0,
                        borderBottomColor: C.rim, gap: 6,
                      }}>
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                          <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flex: 1 }} numberOfLines={1}>{cat.category}</Text>
                          <Text style={{ fontSize: 12, color: C.smoke, marginRight: 12 }}>{fmtDollars(cat.revenue)}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: foodCostColor(pct) }}>{fmtPct(pct)}</Text>
                        </View>
                        <View style={{ height: 3, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                          <View style={{ height: 3, width: `${(cat.revenue / maxRev) * 100}%`, backgroundColor: foodCostColor(pct), borderRadius: 2 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* No data fallback */}
              {n(data.revenue) === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 32, gap: 8 }}>
                  <Ionicons name="bar-chart-outline" size={32} color={C.smoke} />
                  <Text style={{ color: C.mist, fontSize: 13, textAlign: "center" }}>
                    No sales data for this period.{"\n"}Complete some orders to see prime cost metrics.
                  </Text>
                </View>
              )}
            </>
          )}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}
