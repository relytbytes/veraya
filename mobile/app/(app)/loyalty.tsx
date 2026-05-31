import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, ActivityIndicator, TextInput, Animated } from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { searchCustomers, getLoyalty, loyaltyAction } from "@/lib/api";
import type { Customer, LoyaltyInfo } from "@/lib/api";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";

const TX_CONFIG: Record<string, { color: string; tint: string; icon: string }> = {
  EARNED:   { color: C.jade,  tint: T.jade,  icon: "add-circle-outline" },
  REDEEMED: { color: C.coral, tint: T.coral, icon: "remove-circle-outline" },
  ADJUSTED: { color: C.sky,   tint: T.sky,   icon: "swap-horizontal-outline" },
  EXPIRED:  { color: C.smoke, tint: T.mist,  icon: "time-outline" },
};

export default function LoyaltyScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [pointsAction, setPointsAction] = useState<"EARNED" | "REDEEMED" | "ADJUSTED">("EARNED");
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsReason, setPointsReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [], isLoading: searchLoading } = useQuery({
    queryKey: ["customers", "search", searchQuery],
    queryFn: () => searchCustomers(searchQuery),
    enabled: searchQuery.trim().length >= 1,
    staleTime: 10_000,
  });

  const { data: loyalty, isLoading: loyaltyLoading } = useQuery({
    queryKey: ["loyalty", selectedCustomer?.id],
    queryFn: () => getLoyalty(selectedCustomer!.id),
    enabled: !!selectedCustomer,
  });

  function openDetail(customer: Customer) {
    setSelectedCustomer(customer);
    qc.invalidateQueries({ queryKey: ["loyalty", customer.id] });
    setDetailOpen(true);
  }

  function openPointsModal(action: "EARNED" | "REDEEMED" | "ADJUSTED") {
    setPointsAction(action);
    setPointsAmount("");
    setPointsReason("");
    setPointsModalOpen(true);
  }

  async function handlePointsSubmit() {
    if (!selectedCustomer) return;
    const pts = parseInt(pointsAmount);
    if (!pointsAmount || isNaN(pts) || pts <= 0) { Alert.alert("Required", "Enter a valid point amount (positive integer)."); return; }
    setSubmitting(true);
    try {
      await loyaltyAction({ customerId: selectedCustomer.id, type: pointsAction, points: pts, reason: pointsReason.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ["loyalty", selectedCustomer.id] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      setPointsModalOpen(false);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update points");
    } finally { setSubmitting(false); }
  }

  const actionCfg = {
    EARNED:   { color: C.jade,  tint: T.jade,  label: "Award Points" },
    REDEEMED: { color: C.coral, tint: T.coral, label: "Redeem Points" },
    ADJUSTED: { color: C.sky,   tint: T.sky,   label: "Adjust Points" },
  }[pointsAction];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {/* Customer detail sheet */}
      {selectedCustomer && (
        <Modal visible={detailOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailOpen(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.rim, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity onPress={() => setDetailOpen(false)} style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: C.pearl }} numberOfLines={1}>{selectedCustomer.name}</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              {/* Points hero */}
              <View style={{ backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.rim, padding: 24, alignItems: "center", gap: 8 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.gold, borderWidth: 1, borderColor: C.gold, alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                  <Ionicons name="ribbon-outline" size={22} color={C.gold} />
                </View>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Loyalty Points</Text>
                <Text style={{ fontSize: 56, fontWeight: "700", color: C.gold, lineHeight: 64 }}>
                  {loyalty ? loyalty.points.toLocaleString() : (selectedCustomer.loyaltyPoints ?? 0).toLocaleString()}
                </Text>
                <Text style={{ fontSize: 13, color: C.mist }}>points balance</Text>
              </View>

              {/* Customer info */}
              <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 10 }}>
                {selectedCustomer.phone && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="call-outline" size={14} color={C.smoke} />
                    <Text style={{ fontSize: 13, color: C.pearl }}>{selectedCustomer.phone}</Text>
                  </View>
                )}
                {selectedCustomer.email && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="mail-outline" size={14} color={C.smoke} />
                    <Text style={{ fontSize: 13, color: C.pearl }}>{selectedCustomer.email}</Text>
                  </View>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="storefront-outline" size={14} color={C.smoke} />
                  <Text style={{ fontSize: 13, color: C.mist }}>
                    {selectedCustomer.visitCount} visit{selectedCustomer.visitCount !== 1 ? "s" : ""}
                    {selectedCustomer.lastVisitAt ? ` · Last: ${new Date(selectedCustomer.lastVisitAt).toLocaleDateString()}` : ""}
                  </Text>
                </View>
                {selectedCustomer.birthday && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="gift-outline" size={14} color={C.smoke} />
                    <Text style={{ fontSize: 13, color: C.mist }}>Birthday: {selectedCustomer.birthday}</Text>
                  </View>
                )}
              </View>

              {/* Action buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                {(["EARNED", "REDEEMED", "ADJUSTED"] as const).map((action) => {
                  const cfg = { EARNED: { color: C.jade, tint: T.jade, icon: "add-circle-outline" as const, label: "Award" }, REDEEMED: { color: C.coral, tint: T.coral, icon: "remove-circle-outline" as const, label: "Redeem" }, ADJUSTED: { color: C.sky, tint: T.sky, icon: "swap-horizontal-outline" as const, label: "Adjust" } }[action];
                  return (
                    <TouchableOpacity
                      key={action}
                      onPress={() => openPointsModal(action)}
                      style={{ flex: 1, backgroundColor: cfg.tint, borderWidth: 1, borderColor: cfg.color, borderRadius: 14, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
                    >
                      <Ionicons name={cfg.icon} size={15} color={cfg.color} />
                      <Text style={{ fontSize: 12, fontWeight: "700", color: cfg.color }}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Points history */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Points History</Text>
                {loyaltyLoading && <View style={{ alignItems: "center", paddingVertical: 24 }}><ActivityIndicator color={C.gold} /></View>}
                {!loyaltyLoading && loyalty && loyalty.transactions.length === 0 && (
                  <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.rim, padding: 20, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: C.mist }}>No transactions yet</Text>
                  </View>
                )}
                {!loyaltyLoading && loyalty && loyalty.transactions.length > 0 && (
                  <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                    {loyalty.transactions.map((tx, i) => {
                      const cfg = TX_CONFIG[tx.type] ?? TX_CONFIG.ADJUSTED;
                      const isPositive = tx.points > 0;
                      return (
                        <View key={tx.id} style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: i < loyalty.transactions.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: cfg.tint, alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={cfg.icon as never} size={16} color={cfg.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{tx.type}</Text>
                              {tx.reason && <Text style={{ fontSize: 11, color: C.mist, flex: 1 }} numberOfLines={1}>{tx.reason}</Text>}
                            </View>
                            <Text style={{ fontSize: 11, color: C.smoke, marginTop: 2 }}>{new Date(tx.createdAt).toLocaleDateString()}</Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: isPositive ? C.jade : C.coral }}>
                            {isPositive ? "+" : ""}{tx.points}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Info note */}
              <View style={{ backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="information-circle-outline" size={15} color={C.gold} />
                <Text style={{ flex: 1, fontSize: 11, color: C.gold }}>
                  Points are earned automatically: 1 point per $1 spent when closing an order.
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>

          {/* Points action modal */}
          <Modal visible={pointsModalOpen} transparent animationType="fade" onRequestClose={() => setPointsModalOpen(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setPointsModalOpen(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16, borderTopWidth: 1, borderTopColor: C.rim }}>
                  <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 4 }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>{actionCfg.label}</Text>
                    <TouchableOpacity onPress={() => setPointsModalOpen(false)} style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>
                  {pointsAction === "REDEEMED" && loyalty && (
                    <View style={{ backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 13, color: C.gold }}>Available: <Text style={{ fontWeight: "700" }}>{loyalty.points.toLocaleString()} pts</Text></Text>
                    </View>
                  )}
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Points</Text>
                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 20, fontWeight: "700", color: C.pearl }}
                      value={pointsAmount}
                      onChangeText={setPointsAmount}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={C.smoke}
                      autoFocus
                    />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Reason (optional)</Text>
                    <TextInput
                      style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: C.pearl }}
                      value={pointsReason}
                      onChangeText={setPointsReason}
                      placeholder="e.g. Birthday bonus, staff error correction…"
                      placeholderTextColor={C.smoke}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={handlePointsSubmit}
                    disabled={submitting}
                    style={{ height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: submitting ? C.surfaceHi : actionCfg.tint, borderWidth: 1, borderColor: submitting ? C.rim : actionCfg.color }}
                  >
                    {submitting ? <ActivityIndicator color={actionCfg.color} /> : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color={submitting ? C.smoke : actionCfg.color} />
                        <Text style={{ fontWeight: "700", fontSize: 15, color: submitting ? C.smoke : actionCfg.color }}>{actionCfg.label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </Modal>
      )}

      <CollapsingHeader
        title="Loyalty & CRM"
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        scrollY={scrollY}
      />

      {/* Search bar */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search-outline" size={15} color={C.smoke} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
            placeholder="Search by name or phone…"
            placeholderTextColor={C.smoke}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchLoading && <ActivityIndicator size="small" color={C.gold} />}
          {searchQuery.length > 0 && !searchLoading && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={15} color={C.smoke} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Animated.ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }} scrollEventThrottle={16} onScroll={scrollHandler}>
        {searchQuery.trim().length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 56, gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="ribbon-outline" size={28} color={C.smoke} />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: C.pearl }}>Find a Customer</Text>
              <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", paddingHorizontal: 32 }}>
                Search by name or phone to view loyalty points and history
              </Text>
            </View>
          </View>
        )}

        {searchQuery.trim().length >= 1 && !searchLoading && customers.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
            <Ionicons name="search-outline" size={28} color={C.smoke} />
            <Text style={{ fontSize: 13, color: C.mist }}>No customers matched "{searchQuery}"</Text>
          </View>
        )}

        {customers.map((customer) => (
          <TouchableOpacity
            key={customer.id}
            onPress={() => openDetail(customer)}
            activeOpacity={0.7}
            style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 10, ...shadow.sm }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{customer.name}</Text>
                {customer.phone && <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>{customer.phone}</Text>}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: T.gold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: C.goldDim }}>
                <Ionicons name="star" size={11} color={C.gold} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.gold }}>{(customer.loyaltyPoints ?? 0).toLocaleString()} pts</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="storefront-outline" size={11} color={C.smoke} />
                <Text style={{ fontSize: 11, color: C.mist }}>{customer.visitCount} visits</Text>
              </View>
              {customer.lastVisitAt && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="time-outline" size={11} color={C.smoke} />
                  <Text style={{ fontSize: 11, color: C.mist }}>Last {new Date(customer.lastVisitAt).toLocaleDateString()}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
