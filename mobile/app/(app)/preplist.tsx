import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Share, Animated,
} from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { getPrepList } from "@/lib/api";
import { C, shadow } from "@/lib/theme";

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
  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const [targetDate, setTargetDate] = useState(() => toYMD(addDays(new Date(), 1)));
  const [view, setView] = useState<"prep" | "forecast">("prep");

  const { data, isLoading, refetch, isRefetching } = useQuery({
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
        {(["prep", "forecast"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => setView(v)}
            style={{
              flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: 6, paddingVertical: 11,
              borderBottomWidth: 2, borderBottomColor: view === v ? C.gold : "transparent",
            }}
          >
            <Ionicons
              name={v === "prep" ? "list-outline" : "bar-chart-outline"}
              size={14}
              color={view === v ? C.gold : C.smoke}
            />
            <Text style={{ fontSize: 12, fontWeight: "600", color: view === v ? C.gold : C.smoke }}>
              {v === "prep" ? "Prep Needs" : "Sales Forecast"}
            </Text>
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
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={C.gold} />}
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
                          return (
                            <View key={row.ingredientId} style={{
                              paddingHorizontal: 16, paddingVertical: 12,
                              borderBottomWidth: i < prepNeeded.length - 1 ? 1 : 0, borderBottomColor: C.rim,
                              flexDirection: "row", alignItems: "center", gap: 12,
                              backgroundColor: urgent ? C.coral + "08" : "transparent",
                            }}>
                              <View style={{
                                height: 36, width: 36, borderRadius: 10,
                                backgroundColor: urgent ? C.coral + "22" : C.surfaceHi,
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <Ionicons name={urgent ? "warning-outline" : "cut-outline"} size={16} color={urgent ? C.coral : C.smoke} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{row.name}</Text>
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
                                  {row.prepNeeded.toFixed(1)}
                                </Text>
                                <Text style={{ fontSize: 10, color: C.smoke }}>{row.unit}</Text>
                              </View>
                            </View>
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
            </>
          )}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}
