import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, ActivityIndicator, Share, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPrepList, getPrepLog, logPrepWaste, type PrepListResult } from "@/lib/api";
import { C, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtDate(ymd: string) {
  return new Date(ymd + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric",
  });
}

export default function PrepListScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const [targetDate, setTargetDate] = useState(() => toYMD(addDays(new Date(), 1)));
  const [view, setView] = useState<"prep" | "forecast" | "yield">("prep");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggleCheck = (id: string) => setChecked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["prepList", targetDate],
    queryFn: () => getPrepList(targetDate),
  });

  const prepNeeded = useMemo(
    () => (data?.prepRows ?? []).filter((r) => r.prepNeeded > 0),
    [data]
  );
  const prepReady = useMemo(
    () => (data?.prepRows ?? []).filter((r) => r.prepNeeded <= 0),
    [data]
  );

  async function handleShare() {
    if (!data) return;
    let text = `PREP LIST — ${fmtDate(data.targetDate)}\n`;
    text += `${data.confirmedCovers} covers · ${data.avgHistoricalOrders.toFixed(0)} avg orders\n`;
    text += "─".repeat(40) + "\n\n";
    text += "NEEDS PREP:\n";
    for (const r of prepNeeded) {
      text += `  • ${r.name}: ${r.prepNeeded.toFixed(1)} ${r.unit} (have ${r.currentOnHand.toFixed(1)})\n`;
    }
    if (prepReady.length > 0) {
      text += "\nALREADY STOCKED:\n";
      for (const r of prepReady) {
        text += `  ✓ ${r.name}\n`;
      }
    }
    await Share.share({ message: text, title: "Prep List" });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Prep List"
        subtitle={data ? `${data.targetDOW} · ${data.weeksAnalyzed}wk avg` : "Forecasted prep needs"}
        scrollY={scrollY}
        left={
          <TouchableOpacity onPress={() => router.navigate("/(app)")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={20} color={C.gold} />
          </TouchableOpacity>
        }
        right={
          data ? (
            <TouchableOpacity
              onPress={handleShare}
              style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.gold, alignItems: "center", justifyContent: "center", ...shadow.gold }}
            >
              <Ionicons name="share-outline" size={17} color="#fff" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Date nav */}
      <View style={{
        backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim,
        paddingHorizontal: 16, paddingVertical: 12,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        <TouchableOpacity
          onPress={() => setTargetDate((d) => toYMD(addDays(new Date(d + "T12:00:00"), -1)))}
          style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-back" size={18} color={C.mist} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{fmtDate(targetDate)}</Text>
          {targetDate === toYMD(addDays(new Date(), 1)) && (
            <Text style={{ fontSize: 10, color: C.gold, fontWeight: "600" }}>TOMORROW</Text>
          )}
          {targetDate === toYMD(new Date()) && (
            <Text style={{ fontSize: 10, color: C.jade, fontWeight: "600" }}>TODAY</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setTargetDate((d) => toYMD(addDays(new Date(d + "T12:00:00"), 1)))}
          style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="chevron-forward" size={18} color={C.mist} />
        </TouchableOpacity>
      </View>

      {/* View toggle */}
      <View style={{ backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.rim, flexDirection: "row" }}>
        {([
          { v: "prep", label: "Prep Needs", icon: "list-outline" },
          { v: "forecast", label: "Forecast", icon: "bar-chart-outline" },
          { v: "yield", label: "Yield Log", icon: "trending-up-outline" },
        ] as const).map(({ v, label, icon }) => (
          <TouchableOpacity
            key={v}
            onPress={() => setView(v)}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: 6, paddingVertical: 11,
              borderBottomWidth: 2, borderBottomColor: view === v ? C.gold : "transparent",
            }}
          >
            <Ionicons name={icon} size={14} color={view === v ? C.gold : C.smoke} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: view === v ? C.gold : C.smoke }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={C.gold} size="large" />
          <Text style={{ color: C.mist, fontSize: 13 }}>Analyzing historical sales data…</Text>
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {data && (
            <>
              {/* Summary strip */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[
                  { label: "Need Prep", value: String(data.summary.totalItemsToPrep), color: data.summary.totalItemsToPrep > 0 ? C.coral : C.jade },
                  { label: "Reservations", value: String(data.summary.reservationCount), color: data.summary.reservationCount > 0 ? C.gold : C.mist },
                  { label: "Avg Orders", value: data.avgHistoricalOrders.toFixed(0), color: C.pearl },
                  { label: "Cover Factor", value: `×${data.coverFactor.toFixed(2)}`, color: C.sky },
                ].map((s) => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: C.surface, borderRadius: 12, padding: 10, gap: 2, borderWidth: 1, borderColor: C.rim, alignItems: "center" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: s.color }}>{s.value}</Text>
                    <Text style={{ fontSize: 9, color: C.smoke, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>{s.label}</Text>
                  </View>
                ))}
              </View>

              {view === "prep" && (
                <>
                  {/* Items needing prep */}
                  {prepNeeded.length > 0 && (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: C.coral }} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                          Needs Prep ({prepNeeded.length})
                        </Text>
                      </View>
                      <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                        {prepNeeded.map((row, i) => {
                          const shortfall = row.currentOnHand / Math.max(row.forecastQty + row.minThreshold, 1);
                          const urgent = shortfall < 0.25;
                          const done = checked.has(row.ingredientId);
                          return (
                            <TouchableOpacity key={row.ingredientId} activeOpacity={0.7} onPress={() => toggleCheck(row.ingredientId)} style={{
                              paddingHorizontal: 16, paddingVertical: 12,
                              borderBottomWidth: i < prepNeeded.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                              flexDirection: "row", alignItems: "center", gap: 12,
                              backgroundColor: done ? `${C.jade}0A` : urgent ? C.coral + "08" : "transparent",
                              opacity: done ? 0.55 : 1,
                            }}>
                              <View style={{
                                height: 36, width: 36, borderRadius: 10,
                                backgroundColor: done ? `${C.jade}22` : urgent ? C.coral + "22" : C.surfaceHi,
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Ionicons name={done ? "checkmark-circle" : urgent ? "warning-outline" : "cut-outline"} size={done ? 20 : 16} color={done ? C.jade : urgent ? C.coral : C.smoke} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl, textDecorationLine: done ? "line-through" : "none" }}>{row.name}</Text>
                                  {row.hasWasteSignal && row.wasteRate > 0 && (
                                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: row.overPrep ? `${C.coral}22` : C.surfaceHi }}>
                                      <Text style={{ fontSize: 10, fontWeight: "700", color: row.overPrep ? C.coral : C.smoke }}>{Math.round(row.wasteRate * 100)}% waste</Text>
                                    </View>
                                  )}
                                </View>
                                <Text style={{ fontSize: 11, color: C.smoke }}>
                                  Have {row.currentOnHand.toFixed(1)} · Need {(row.forecastQty + row.minThreshold).toFixed(1)} {row.unit}
                                </Text>
                                {row.menuItems.length > 0 && (
                                  <Text style={{ fontSize: 10, color: C.mist }} numberOfLines={1}>
                                    Used in: {row.menuItems.slice(0, 3).join(", ")}{row.menuItems.length > 3 ? ` +${row.menuItems.length - 3}` : ""}
                                  </Text>
                                )}
                              </View>
                              <View style={{ alignItems: "flex-end", gap: 2 }}>
                                <Text style={{ fontSize: 16, fontWeight: "700", color: urgent ? C.coral : C.pearl }}>
                                  {row.recommendedPrep.toFixed(1)}
                                </Text>
                                <Text style={{ fontSize: 10, color: C.smoke }}>{row.unit}</Text>
                                {row.overPrep && row.recommendedPrep < row.prepNeeded && (
                                  <Text style={{ fontSize: 9, color: C.coral }}>was {row.prepNeeded.toFixed(1)}</Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Already stocked */}
                  {prepReady.length > 0 && (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <View style={{ height: 8, width: 8, borderRadius: 4, backgroundColor: C.jade }} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                          Already Stocked ({prepReady.length})
                        </Text>
                      </View>
                      <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                        {prepReady.map((row, i) => (
                          <View key={row.ingredientId} style={{
                            paddingHorizontal: 16, paddingVertical: 10,
                            borderBottomWidth: i < prepReady.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                            flexDirection: "row", alignItems: "center", gap: 10,
                          }}>
                            <Ionicons name="checkmark-circle-outline" size={18} color={C.jade} />
                            <Text style={{ flex: 1, fontSize: 13, color: C.mist }}>{row.name}</Text>
                            <Text style={{ fontSize: 12, color: C.jade }}>
                              {row.currentOnHand.toFixed(1)} {row.unit}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {prepNeeded.length === 0 && prepReady.length === 0 && (
                    <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                      <Ionicons name="analytics-outline" size={32} color={C.smoke} />
                      <Text style={{ color: C.mist, fontSize: 13, textAlign: "center" }}>
                        No recipe data found for forecasting.{"\n"}Add recipes to your menu items to use this feature.
                      </Text>
                    </View>
                  )}
                </>
              )}

              {view === "forecast" && (
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 1 }}>
                      Expected Sales
                    </Text>
                  </View>
                  <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                    {data.forecastItems.length === 0 && (
                      <View style={{ padding: 24, alignItems: "center" }}>
                        <Text style={{ color: C.mist, fontSize: 13 }}>No historical sales data yet</Text>
                      </View>
                    )}
                    {data.forecastItems.slice(0, 30).map((item, i) => {
                      const max = data.forecastItems[0]?.avgQty ?? 1;
                      return (
                        <View key={item.menuItemId} style={{
                          paddingHorizontal: 16, paddingVertical: 11,
                          borderBottomWidth: i < Math.min(data.forecastItems.length, 30) - 1 ? 1 : 0, borderBottomColor: C.rim,
                          gap: 6,
                        }}>
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl, flex: 1, marginRight: 8 }} numberOfLines={1}>{item.name}</Text>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: C.gold }}>{item.avgQty}</Text>
                          </View>
                          <View style={{ height: 3, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                            <View style={{ height: 3, width: `${(item.avgQty / max) * 100}%`, backgroundColor: C.gold, borderRadius: 2 }} />
                          </View>
                          <Text style={{ fontSize: 10, color: C.smoke }}>{item.category} · {item.weeksTracked}wk avg</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {view === "yield" && <YieldLog rows={data.prepRows} summary={data.summary} />}
            </>
          )}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Yield Log ────────────────────────────────────────────────────────────────
// End-of-day input loop feeding lib/prep-waste: record what was prepped vs.
// wasted so the forecast recommendation calibrates over a few weeks.
function YieldLog({ rows, summary }: { rows: PrepListResult["prepRows"]; summary: PrepListResult["summary"] }) {
  const qc = useQueryClient();
  const [logDate, setLogDate] = useState(() => toYMD(new Date()));
  const [vals, setVals] = useState<Record<string, { prepped: string; wasted: string }>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useQuery({
    queryKey: ["prepLog", logDate],
    queryFn: async () => {
      const d = await getPrepLog(logDate);
      const next: Record<string, { prepped: string; wasted: string }> = {};
      for (const [id, v] of Object.entries(d.logs)) {
        next[id] = { prepped: v.preppedQty ? String(v.preppedQty) : "", wasted: v.wastedQty ? String(v.wastedQty) : "" };
      }
      setVals(next);
      setSavedIds(new Set());
      return d;
    },
  });

  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));

  async function save(ingredientId: string) {
    const v = vals[ingredientId] ?? { prepped: "", wasted: "" };
    try {
      await logPrepWaste({
        date: logDate,
        ingredientId,
        preppedQty: Number(v.prepped) || 0,
        wastedQty: Number(v.wasted) || 0,
      });
      setSavedIds((p) => new Set(p).add(ingredientId));
      qc.invalidateQueries({ queryKey: ["prepList"] });
    } catch { /* surfaced on next load */ }
  }

  function setVal(id: string, field: "prepped" | "wasted", value: string) {
    setVals((prev) => ({ ...prev, [id]: { ...{ prepped: "", wasted: "" }, ...prev[id], [field]: value } }));
    setSavedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  const today = toYMD(new Date());
  const yesterday = toYMD(addDays(new Date(), -1));

  return (
    <View style={{ gap: 12 }}>
      {/* Learning banner */}
      <View style={{ backgroundColor: `${C.jade}14`, borderColor: `${C.jade}33`, borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", gap: 10 }}>
        <Ionicons name="trending-up" size={18} color={C.jade} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>Vera is learning your yield</Text>
          <Text style={{ fontSize: 11, color: C.smoke, marginTop: 2, lineHeight: 16 }}>
            Log what you prepped and wasted each day. The prep recommendation trims chronic over-prep automatically.
            {summary.wasteDaysLogged > 0 ? ` ${summary.wasteDaysLogged} day${summary.wasteDaysLogged === 1 ? "" : "s"} logged so far.` : ""}
          </Text>
        </View>
      </View>

      {/* Date quick-select */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[{ label: "Yesterday", iso: yesterday }, { label: "Today", iso: today }].map(({ label, iso }) => (
          <TouchableOpacity key={label} onPress={() => setLogDate(iso)} style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: logDate === iso ? C.gold : C.surfaceHi, borderWidth: 1, borderColor: logDate === iso ? C.gold : C.rim,
          }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: logDate === iso ? C.void : C.mist }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
        {sorted.map((row, i) => {
          const v = vals[row.ingredientId] ?? { prepped: "", wasted: "" };
          const saved = savedIds.has(row.ingredientId);
          return (
            <View key={row.ingredientId} style={{
              paddingHorizontal: 14, paddingVertical: 10, gap: 8,
              borderBottomWidth: i < sorted.length - 1 ? 1 : 0, borderBottomColor: C.rim,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: C.pearl }}>{row.name}</Text>
                <Text style={{ fontSize: 10, color: C.smoke }}>{row.unit}</Text>
                {saved && <Ionicons name="checkmark-circle" size={15} color={C.jade} />}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <YieldInput label="Prepped" value={v.prepped} accent={C.mist} onChange={(t) => setVal(row.ingredientId, "prepped", t)} onBlur={() => save(row.ingredientId)} />
                <YieldInput label="Wasted" value={v.wasted} accent={C.coral} onChange={(t) => setVal(row.ingredientId, "wasted", t)} onBlur={() => save(row.ingredientId)} />
              </View>
            </View>
          );
        })}
        {sorted.length === 0 && (
          <View style={{ padding: 24, alignItems: "center" }}>
            <Text style={{ color: C.mist, fontSize: 13, textAlign: "center" }}>No prep ingredients to log yet.{"\n"}They appear once you have sales history.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function YieldInput({ label, value, accent, onChange, onBlur }: { label: string; value: string; accent: string; onChange: (t: string) => void; onBlur: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 9, fontWeight: "700", color: C.smoke, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={C.smoke}
        style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, color: accent, textAlign: "right" }}
      />
    </View>
  );
}
