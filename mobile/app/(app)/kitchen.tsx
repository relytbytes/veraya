import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Animated } from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getKitchenOrders, kitchenAction } from "@/lib/api";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { fireRounds } from "@/lib/fire-rounds";
import type { Order } from "@/lib/api";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";

function elapsed(dateStr: string) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h`;
}

function urgencyAccent(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 300) return C.jade;
  if (secs < 600) return C.ember;
  return C.coral;
}

export default function KitchenScreen() {
  const qc = useQueryClient();
  const [bumping, setBumping] = useState<string | null>(null);
  const { scrollY, scrollHandler } = useCollapsingHeader();

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["kitchen"],
    queryFn: () => getKitchenOrders(),
    refetchInterval: 30_000, // fallback; live updates arrive via SSE (RealtimeProvider)
  });
  const { refreshing, run } = useManualRefresh();

  async function bump(orderId: string) {
    setBumping(orderId);
    try {
      await kitchenAction({ orderId, action: "bump" });
      qc.setQueryData<Order[]>(["kitchen"], (prev) => prev?.filter((o) => o.id !== orderId) ?? []);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBumping(null);
    }
  }

  async function toggleItem(orderId: string, itemId: string, completed: boolean) {
    await kitchenAction({ orderId, orderItemId: itemId, action: completed ? "complete" : "send" });
    qc.invalidateQueries({ queryKey: ["kitchen"] });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Kitchen"
        subtitle={orders.length === 0 ? "All clear" : `${orders.length} ticket${orders.length !== 1 ? "s" : ""}`}
        scrollY={scrollY}
        left={<Ionicons name="restaurant-outline" size={24} color={C.gold} />}
      />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={C.gold} size="large" />
        </View>
      ) : orders.length === 0 ? (
        <Animated.ScrollView
          contentContainerClassName="flex-1 items-center justify-center gap-3"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          <View
            style={{
              height: 80,
              width: 80,
              borderRadius: 24,
              backgroundColor: T.jade,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: C.rim,
            }}
          >
            <Ionicons name="checkmark-circle" size={40} color={C.jade} />
          </View>
          <Text style={{ color: C.pearl, fontSize: 18, fontWeight: "600" }}>All caught up!</Text>
          <Text style={{ color: C.mist, fontSize: 14 }}>No active tickets</Text>
          <Text style={{ color: C.smoke, fontSize: 12, marginTop: 8 }}>↑ Pull to refresh</Text>
        </Animated.ScrollView>
      ) : (
        <Animated.ScrollView
          contentContainerClassName="p-4 gap-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
        >
          {orders.map((order) => {
            const allDone = order.items.every((i) => i.completedAt);
            const accent = urgencyAccent(order.createdAt);
            return (
              <View
                key={order.id}
                style={{
                  backgroundColor: C.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: C.rim,
                  borderLeftWidth: 4,
                  borderLeftColor: accent,
                  overflow: "hidden",
                  ...shadow.md,
                }}
              >
                {/* Ticket header */}
                <View
                  style={{
                    backgroundColor: C.surfaceHi,
                    borderBottomWidth: 1,
                    borderBottomColor: C.rim,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: C.pearl, fontWeight: "700", fontSize: 17 }}>
                    {order.table ? `Table ${order.table.number}` : order.type}
                  </Text>
                  {/* Timer badge */}
                  <View
                    style={{
                      backgroundColor: C.surfaceHov,
                      borderRadius: 99,
                      paddingHorizontal: 10,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: C.rim,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ionicons name="time-outline" size={12} color={C.mist} />
                    <Text style={{ color: C.mist, fontFamily: "monospace", fontSize: 13 }}>
                      {elapsed(order.createdAt)}
                    </Text>
                  </View>
                </View>

                {/* Items — grouped into fire rounds (courses) */}
                <View className="p-3 gap-2">
                  {fireRounds(order.items).map((round, ri, arr) => {
                    const isCurrentRound = round.key === arr[arr.length - 1]?.key;
                    return (
                    <View key={round.key} style={{ gap: 8 }}>
                      {arr.length > 1 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: C.ember, letterSpacing: 1, textTransform: "uppercase" }}>Course {ri + 1}</Text>
                          {round.firedAt && (
                            <Text style={{ fontSize: 10, color: C.smoke, fontFamily: "monospace" }}>
                              {new Date(round.firedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                          )}
                          <View style={{ flex: 1, height: 1, backgroundColor: C.rim }} />
                        </View>
                      )}
                      {round.items.map((item) => {
                        const locked = !!item.completedAt && !isCurrentRound;
                        return (
                        <TouchableOpacity
                          key={item.id}
                          disabled={locked}
                          onPress={() => { if (!locked) toggleItem(order.id, item.id, !item.completedAt); }}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: 10,
                            paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
                            backgroundColor: item.completedAt ? T.jade : item.sentAt ? T.ember : C.surfaceHi,
                            opacity: item.completedAt ? 0.65 : 1,
                          }}
                        >
                          <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: 2, borderColor: item.completedAt ? C.jade : C.rim, backgroundColor: item.completedAt ? C.jade : "transparent", alignItems: "center", justifyContent: "center" }}>
                            {item.completedAt && <Ionicons name="checkmark" size={12} color={C.void} />}
                          </View>
                          <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: item.completedAt ? C.smoke : C.pearl, textDecorationLine: item.completedAt ? "line-through" : "none" }}>
                            {item.quantity}× {item.menuItem.name}
                          </Text>
                        </TouchableOpacity>
                        );
                      })}
                    </View>
                    );
                  })}
                </View>

                {/* BUMP button */}
                <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => bump(order.id)}
                    disabled={bumping === order.id}
                    style={{
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 6,
                      backgroundColor: allDone ? C.gold : C.ember,
                      ...(allDone ? shadow.gold : {}),
                    }}
                  >
                    {bumping === order.id ? (
                      <ActivityIndicator color={allDone ? C.void : "#fff"} size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name={allDone ? "checkmark-circle" : "arrow-up-circle-outline"}
                          size={16}
                          color={allDone ? C.void : "#fff"}
                        />
                        <Text
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            color: allDone ? C.void : "#fff",
                          }}
                        >
                          {allDone ? "BUMP" : "MARK READY"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </Animated.ScrollView>
      )}
    </SafeAreaView>
  );
}
