import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text, ScrollView, TouchableOpacity, Modal, RefreshControl, Alert, ActivityIndicator, TextInput, Animated } from "react-native";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getGiftCards, createGiftCard, lookupGiftCard, giftCardAction } from "@/lib/api";
import type { GiftCard } from "@/lib/api";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";
import { ScreenMessage } from "@/components/ScreenMessage";
import { useManualRefresh } from "@/lib/use-manual-refresh";

function formatCode(code: string) { return code.replace(/(.{4})/g, "$1-").slice(0, -1); }

function balanceColor(pct: number) {
  if (pct > 0.5) return C.jade;
  if (pct > 0.2) return C.ember;
  return C.coral;
}

export default function GiftCardsScreen() {
  const { refreshing, run } = useManualRefresh();
  const router = useRouter();
  const qc = useQueryClient();
  const { scrollY, scrollHandler } = useCollapsingHeader();
  const [search, setSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<GiftCard | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const [issueBalance, setIssueBalance] = useState("");
  const [issueRecipient, setIssueRecipient] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const [issueMessage, setIssueMessage] = useState("");
  const [issuing, setIssuing] = useState(false);

  const [lookupCode, setLookupCode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  const [actionAmount, setActionAmount] = useState("");
  const [actionType, setActionType] = useState<"LOAD" | "REDEEM">("LOAD");
  const [actioning, setActioning] = useState(false);

  const { data: cards = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["giftCards"],
    queryFn: getGiftCards,
    refetchInterval: 120_000,
  });

  const visibleCards = cards.filter((c) =>
    !search.trim() ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.recipientName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function openDetail(card: GiftCard) { setSelectedCard(card); setDetailOpen(true); }
  function openLoad(type: "LOAD" | "REDEEM") { setActionType(type); setActionAmount(""); setLoadOpen(true); }

  async function handleLookup() {
    if (!lookupCode.trim()) return;
    setLookupLoading(true);
    try {
      const card = await lookupGiftCard(lookupCode.trim().toUpperCase());
      setSelectedCard(card); setDetailOpen(true); setLookupCode("");
    } catch (e: unknown) {
      Alert.alert("Not Found", e instanceof Error ? e.message : "Gift card not found");
    } finally { setLookupLoading(false); }
  }

  async function handleIssue() {
    const balance = parseFloat(issueBalance);
    if (!issueBalance || isNaN(balance) || balance <= 0) { Alert.alert("Required", "Enter a valid initial balance."); return; }
    setIssuing(true);
    try {
      const card = await createGiftCard({ initialBalance: balance, recipientName: issueRecipient.trim() || undefined, recipientEmail: issueEmail.trim() || undefined, message: issueMessage.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ["giftCards"] });
      setIssueOpen(false);
      setIssueBalance(""); setIssueRecipient(""); setIssueEmail(""); setIssueMessage("");
      setSelectedCard(card); setDetailOpen(true);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to issue gift card");
    } finally { setIssuing(false); }
  }

  async function handleAction() {
    if (!selectedCard) return;
    const amount = parseFloat(actionAmount);
    if (!actionAmount || isNaN(amount) || amount <= 0) { Alert.alert("Required", "Enter a valid amount."); return; }
    setActioning(true);
    try {
      const updated = await giftCardAction(selectedCard.code, { action: actionType, amount });
      setSelectedCard(updated);
      await qc.invalidateQueries({ queryKey: ["giftCards"] });
      setLoadOpen(false); setActionAmount("");
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Transaction failed");
    } finally { setActioning(false); }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      {/* Detail sheet */}
      {selectedCard && (
        <Modal visible={detailOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailOpen(false)}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.rim, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TouchableOpacity onPress={() => setDetailOpen(false)} style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close" size={16} color={C.mist} />
              </TouchableOpacity>
              <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: C.pearl }}>Gift Card</Text>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: selectedCard.isActive ? T.jade : T.mist, borderWidth: 1, borderColor: selectedCard.isActive ? C.jade : C.smoke }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: selectedCard.isActive ? C.jade : C.smoke }}>
                  {selectedCard.isActive ? "ACTIVE" : "INACTIVE"}
                </Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
              {/* Balance hero */}
              <View style={{ backgroundColor: C.surface, borderRadius: 24, borderWidth: 1, borderColor: C.rim, padding: 24, gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Current Balance</Text>
                <Text style={{ fontSize: 48, fontWeight: "700", color: C.gold }}>${Number(selectedCard.balance).toFixed(2)}</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: C.mist, fontVariant: ["tabular-nums"] }}>{formatCode(selectedCard.code)}</Text>
                <View style={{ marginTop: 8, gap: 4 }}>
                  <View style={{ height: 6, backgroundColor: C.surfaceHi, borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ height: "100%", backgroundColor: balanceColor(Number(selectedCard.balance) / Math.max(Number(selectedCard.initialBalance), 0.01)), borderRadius: 3, width: `${Math.min(100, (Number(selectedCard.balance) / Math.max(Number(selectedCard.initialBalance), 0.01)) * 100)}%` }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 10, color: C.smoke }}>$0</Text>
                    <Text style={{ fontSize: 10, color: C.smoke }}>Initial: ${Number(selectedCard.initialBalance).toFixed(2)}</Text>
                  </View>
                </View>
              </View>

              {/* Recipient info */}
              {(selectedCard.recipientName || selectedCard.recipientEmail || selectedCard.message) && (
                <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 10 }}>
                  {selectedCard.recipientName && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name="person-outline" size={14} color={C.smoke} />
                      <Text style={{ fontSize: 13, fontWeight: "500", color: C.pearl }}>{selectedCard.recipientName}</Text>
                    </View>
                  )}
                  {selectedCard.recipientEmail && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Ionicons name="mail-outline" size={14} color={C.smoke} />
                      <Text style={{ fontSize: 13, color: C.mist }}>{selectedCard.recipientEmail}</Text>
                    </View>
                  )}
                  {selectedCard.message && (
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                      <Ionicons name="chatbubble-outline" size={14} color={C.smoke} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 13, color: C.mist, fontStyle: "italic" }}>"{selectedCard.message}"</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Actions */}
              {selectedCard.isActive && (
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity onPress={() => openLoad("LOAD")} style={{ flex: 1, backgroundColor: T.jade, borderWidth: 1, borderColor: C.jade, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    <Ionicons name="add-circle-outline" size={18} color={C.jade} />
                    <Text style={{ fontWeight: "700", color: C.jade }}>Load Funds</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openLoad("REDEEM")} style={{ flex: 1, backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, borderRadius: 14, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                    <Ionicons name="card-outline" size={18} color={C.gold} />
                    <Text style={{ fontWeight: "700", color: C.gold }}>Redeem</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Transaction history */}
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Recent Transactions</Text>
                {selectedCard.transactions.length === 0 ? (
                  <View style={{ backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.rim, padding: 20, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: C.mist }}>No transactions yet</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, overflow: "hidden" }}>
                    {selectedCard.transactions.map((tx, i) => (
                      <View key={tx.id} style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: i < selectedCard.transactions.length - 1 ? 1 : 0, borderBottomColor: C.rim }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tx.type === "LOAD" ? T.jade : T.coral, alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name={tx.type === "LOAD" ? "add" : "remove"} size={14} color={tx.type === "LOAD" ? C.jade : C.coral} />
                          </View>
                          <View>
                            <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>{tx.type}</Text>
                            <Text style={{ fontSize: 11, color: C.smoke }}>{new Date(tx.createdAt).toLocaleDateString()}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: tx.type === "LOAD" ? C.jade : C.coral }}>
                          {tx.type === "LOAD" ? "+" : "-"}${Number(tx.amount).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>

          {/* Load/Redeem modal */}
          <Modal visible={loadOpen} transparent animationType="fade" onRequestClose={() => setLoadOpen(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setLoadOpen(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 16, borderTopWidth: 1, borderTopColor: C.rim }}>
                  <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginBottom: 4 }} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: C.pearl }}>{actionType === "LOAD" ? "Load Funds" : "Redeem"}</Text>
                    <TouchableOpacity onPress={() => setLoadOpen(false)} style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="close" size={16} color={C.mist} />
                    </TouchableOpacity>
                  </View>
                  {actionType === "REDEEM" && (
                    <View style={{ backgroundColor: T.gold, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 13, color: C.gold }}>Available: <Text style={{ fontWeight: "700" }}>${Number(selectedCard.balance).toFixed(2)}</Text></Text>
                    </View>
                  )}
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Amount</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
                      <Text style={{ paddingLeft: 16, fontSize: 16, fontWeight: "600", color: C.mist }}>$</Text>
                      <TextInput
                        style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 14, fontSize: 20, fontWeight: "700", color: C.pearl }}
                        value={actionAmount}
                        onChangeText={setActionAmount}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={C.smoke}
                        autoFocus
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={handleAction}
                    disabled={actioning}
                    style={{ height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: actioning ? C.surfaceHi : actionType === "LOAD" ? C.jade : C.gold, ...shadow.sm }}
                  >
                    {actioning ? <ActivityIndicator color="#fff" /> : (
                      <>
                        <Ionicons name={actionType === "LOAD" ? "add-circle-outline" : "card-outline"} size={18} color={actionType === "LOAD" ? C.void : C.void} />
                        <Text style={{ fontWeight: "700", fontSize: 15, color: C.void }}>{actionType === "LOAD" ? "Add Funds" : "Redeem"}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </Modal>
      )}

      {/* Issue Gift Card modal */}
      <Modal visible={issueOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIssueOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.rim, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={() => setIssueOpen(false)} style={{ width: 32, height: 32, backgroundColor: C.surfaceHi, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={16} color={C.mist} />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: C.pearl }}>Issue Gift Card</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>
                Initial Balance <Text style={{ color: C.coral }}>*</Text>
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, overflow: "hidden" }}>
                <Text style={{ paddingLeft: 16, fontSize: 16, fontWeight: "600", color: C.mist }}>$</Text>
                <TextInput
                  style={{ flex: 1, paddingHorizontal: 8, paddingVertical: 14, fontSize: 20, fontWeight: "700", color: C.pearl }}
                  value={issueBalance}
                  onChangeText={setIssueBalance}
                  keyboardType="decimal-pad"
                  placeholder="25.00"
                  placeholderTextColor={C.smoke}
                  autoFocus
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {["25", "50", "100", "250"].map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    onPress={() => setIssueBalance(amt)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, backgroundColor: issueBalance === amt ? C.gold : C.surfaceHi, borderColor: issueBalance === amt ? C.gold : C.rim }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: issueBalance === amt ? C.void : C.mist }}>${amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {[
              { label: "Recipient Name", value: issueRecipient, set: setIssueRecipient, placeholder: "Optional" },
              { label: "Recipient Email", value: issueEmail, set: setIssueEmail, placeholder: "Optional" },
            ].map((field) => (
              <View key={field.label} style={{ gap: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>{field.label}</Text>
                <TextInput
                  style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: C.pearl }}
                  value={field.value}
                  onChangeText={field.set}
                  placeholder={field.placeholder}
                  placeholderTextColor={C.smoke}
                />
              </View>
            ))}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase" }}>Personal Message</Text>
              <TextInput
                style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: C.pearl }}
                value={issueMessage}
                onChangeText={setIssueMessage}
                placeholder="Happy birthday! Enjoy a great meal."
                placeholderTextColor={C.smoke}
                multiline
                numberOfLines={2}
              />
            </View>

            <TouchableOpacity
              onPress={handleIssue}
              disabled={issuing}
              style={{ height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: issuing ? C.surfaceHi : C.gold, ...shadow.gold }}
            >
              {issuing ? <ActivityIndicator color={C.void} /> : (
                <>
                  <Ionicons name="card-outline" size={18} color={C.void} />
                  <Text style={{ fontWeight: "700", fontSize: 15, color: C.void }}>Issue Gift Card</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <CollapsingHeader
        title="Gift Cards"
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        subtitle={`${cards.length} cards`}
        scrollY={scrollY}
        right={
          <TouchableOpacity onPress={() => setIssueOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.gold, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, ...shadow.gold }}>
            <Ionicons name="add" size={16} color={C.void} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: C.void }}>Issue Card</Text>
          </TouchableOpacity>
        }
      />

      {/* Search & lookup */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.rim }}>
        {/* Search bar */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8, marginBottom: 8 }}>
          <Ionicons name="search-outline" size={15} color={C.smoke} />
          <TextInput
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
            placeholder="Search by code or recipient…"
            placeholderTextColor={C.smoke}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="characters"
          />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={15} color={C.smoke} /></TouchableOpacity>}
        </View>

        {/* Quick lookup */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 12, paddingHorizontal: 12, gap: 8 }}>
            <Ionicons name="card-outline" size={15} color={C.smoke} />
            <TextInput
              style={{ flex: 1, paddingVertical: 9, fontSize: 14, color: C.pearl }}
              placeholder="Enter exact code to look up…"
              placeholderTextColor={C.smoke}
              value={lookupCode}
              onChangeText={setLookupCode}
              autoCapitalize="characters"
              onSubmitEditing={handleLookup}
            />
          </View>
          <TouchableOpacity
            onPress={handleLookup}
            disabled={lookupLoading || !lookupCode.trim()}
            style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: lookupLoading || !lookupCode.trim() ? C.surfaceHi : C.gold }}
          >
            {lookupLoading ? <ActivityIndicator color={C.void} size="small" /> : <Text style={{ fontSize: 12, fontWeight: "600", color: lookupCode.trim() ? C.void : C.smoke }}>Look Up</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <Animated.ScrollView
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >
        {isLoading && <View style={{ alignItems: "center", paddingVertical: 48 }}><ActivityIndicator color={C.gold} /></View>}

        {!isLoading && isError && cards.length === 0 && (
          <ScreenMessage icon="cloud-offline-outline" tone="error" title="Couldn't load gift cards" subtitle="Check your connection and try again." actionLabel="Retry" onAction={() => refetch()} />
        )}
        {!isLoading && !isError && cards.length === 0 && (
          <View style={{ alignItems: "center", paddingVertical: 56, gap: 16 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.rim, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="card-outline" size={28} color={C.smoke} />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: C.pearl }}>No gift cards yet</Text>
              <Text style={{ fontSize: 13, color: C.mist, textAlign: "center", paddingHorizontal: 32 }}>Issue your first gift card to get started</Text>
            </View>
            <TouchableOpacity onPress={() => setIssueOpen(true)} style={{ backgroundColor: C.gold, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 8, ...shadow.gold }}>
              <Ionicons name="add" size={18} color={C.void} />
              <Text style={{ fontWeight: "700", fontSize: 15, color: C.void }}>Issue Gift Card</Text>
            </TouchableOpacity>
          </View>
        )}

        {visibleCards.map((card) => {
          const balancePct = Math.min(1, Number(card.balance) / Math.max(Number(card.initialBalance), 0.01));
          const bColor = balanceColor(balancePct);
          return (
            <TouchableOpacity
              key={card.id}
              onPress={() => openDetail(card)}
              activeOpacity={0.7}
              style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.rim, padding: 16, gap: 12, ...shadow.sm }}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{card.recipientName ?? "Gift Card"}</Text>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: C.mist, marginTop: 2, fontVariant: ["tabular-nums"] }}>{formatCode(card.code)}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: C.gold }}>${Number(card.balance).toFixed(2)}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: card.isActive ? T.jade : T.mist, borderWidth: 1, borderColor: card.isActive ? C.jade : C.smoke }}>
                    <Text style={{ fontSize: 9, fontWeight: "700", color: card.isActive ? C.jade : C.smoke }}>{card.isActive ? "ACTIVE" : "INACTIVE"}</Text>
                  </View>
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <View style={{ height: 4, backgroundColor: C.surfaceHi, borderRadius: 2, overflow: "hidden" }}>
                  <View style={{ height: "100%", width: `${balancePct * 100}%`, backgroundColor: bColor, borderRadius: 2 }} />
                </View>
                <Text style={{ fontSize: 11, color: C.mist }}>
                  ${Number(card.balance).toFixed(2)} of ${Number(card.initialBalance).toFixed(2)} remaining
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </Animated.ScrollView>
    </SafeAreaView>
  );
}
