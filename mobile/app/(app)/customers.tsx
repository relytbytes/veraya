import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from "react-native";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  searchCustomers,
  getCustomer,
  createCustomer,
  patchCustomer,
  deleteCustomer,
  getLoyalty,
  loyaltyAction,
  getCustomerReservations,
  getCustomerDuplicates,
  mergeCustomers,
  type Customer,
  type Reservation,
  type DuplicateGroup,
} from "@/lib/api";
import { C, T, shadow } from "@/lib/theme";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";

// ── helpers ───────────────────────────────────────────────────────────────────

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isBirthdayThisMonth(birthday: string | null): boolean {
  if (!birthday) return false;
  const now = new Date();
  const parts = birthday.split("-");
  if (parts.length === 3) {
    return parseInt(parts[1], 10) === now.getMonth() + 1;
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) === now.getMonth() + 1;
  }
  return false;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags.split(",").map((t) => t.trim()).filter(Boolean);
}

type SortMode = "all" | "top" | "recent" | "birthdays";

// ── sub-components ────────────────────────────────────────────────────────────

function AvatarCircle({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: T.gold,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: C.goldDim,
      }}
    >
      <Text style={{ fontSize: size * 0.38, color: C.gold, fontWeight: "700" }}>{initial(name)}</Text>
    </View>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <View style={{ backgroundColor: C.surfaceHi, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: C.rim }}>
      <Text style={{ fontSize: 10, fontWeight: "600", color: C.mist }}>{label}</Text>
    </View>
  );
}

// ── Customer card ─────────────────────────────────────────────────────────────

function CustomerCard({ customer, onPress }: { customer: Customer; onPress: () => void }) {
  const tags = parseTags(customer.tags);
  const birthdayMonth = isBirthdayThisMonth(customer.birthday);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.rim,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        ...shadow.sm,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <AvatarCircle name={customer.name} size={46} />

        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl, flexShrink: 1 }}>{customer.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {birthdayMonth && (
                <Ionicons name="gift-outline" size={14} color={C.coral} />
              )}
              {customer.visitCount > 0 && (
                <View style={{ backgroundColor: T.sky, borderWidth: 1, borderColor: C.sky + "40", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="walk-outline" size={10} color={C.sky} />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: C.sky }}>{customer.visitCount}</Text>
                </View>
              )}
            </View>
          </View>

          {(customer.phone || customer.email) && (
            <Text style={{ fontSize: 12, color: C.mist }} numberOfLines={1}>
              {customer.phone ?? customer.email}
            </Text>
          )}

          <Text style={{ fontSize: 10, color: C.smoke, marginTop: 2 }}>
            Last visit: {fmtDate(customer.lastVisitAt)}
          </Text>

          {tags.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {tags.map((t) => <TagChip key={t} label={t} />)}
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Add/Edit form ─────────────────────────────────────────────────────────────

type CustomerFormValues = {
  name: string;
  phone: string;
  email: string;
  birthday: string;
  tags: string;
  notes: string;
};

function CustomerForm({
  initial: init,
  onSave,
  onCancel,
  saving,
  title,
}: {
  initial: CustomerFormValues;
  onSave: (v: CustomerFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const [form, setForm] = useState<CustomerFormValues>(init);
  const set = (k: keyof CustomerFormValues) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1 }}>
        {/* Drag handle */}
        <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 }} />

        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.rim }}>
          <TouchableOpacity onPress={onCancel} style={{ padding: 4 }}>
            <Text style={{ fontSize: 15, color: C.mist }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.pearl }}>{title}</Text>
          <TouchableOpacity
            onPress={() => {
              if (!form.name.trim()) {
                Alert.alert("Name required", "Please enter a customer name.");
                return;
              }
              onSave(form);
            }}
            disabled={saving}
            style={{ backgroundColor: C.gold, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, ...shadow.gold }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={C.void} />
            ) : (
              <Text style={{ color: C.void, fontWeight: "700", fontSize: 13 }}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 20, paddingTop: 16 }} keyboardShouldPersistTaps="handled">
          {[
            { label: "Name *", key: "name" as const, placeholder: "Full name", keyboard: "default" as const },
            { label: "Phone", key: "phone" as const, placeholder: "+1 555 000 0000", keyboard: "phone-pad" as const },
            { label: "Email", key: "email" as const, placeholder: "email@example.com", keyboard: "email-address" as const },
            { label: "Birthday (MM-DD)", key: "birthday" as const, placeholder: "08-14", keyboard: "default" as const },
            { label: "Tags (comma-separated)", key: "tags" as const, placeholder: "VIP, Regular, Allergy", keyboard: "default" as const },
          ].map(({ label, key, placeholder, keyboard }) => (
            <View key={key} style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{label}</Text>
              <TextInput
                value={form[key]}
                onChangeText={set(key)}
                placeholder={placeholder}
                placeholderTextColor={C.smoke}
                keyboardType={keyboard}
                autoCapitalize={key === "email" ? "none" : "words"}
                style={{
                  backgroundColor: C.surfaceHi,
                  borderWidth: 1,
                  borderColor: C.rim,
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  fontSize: 14,
                  color: C.pearl,
                }}
              />
            </View>
          ))}

          <View style={{ marginBottom: 40 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Notes</Text>
            <TextInput
              value={form.notes}
              onChangeText={set("notes")}
              placeholder="Preferences, allergies, VIP notes…"
              placeholderTextColor={C.smoke}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              style={{
                backgroundColor: C.surfaceHi,
                borderWidth: 1,
                borderColor: C.rim,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontSize: 14,
                color: C.pearl,
                minHeight: 96,
                textAlignVertical: "top",
              }}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Detail sheet ──────────────────────────────────────────────────────────────

function CustomerDetailSheet({
  customerId,
  onClose,
  onDeleted,
}: {
  customerId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomer(customerId),
  });

  const { data: loyalty, isLoading: loyaltyLoading } = useQuery({
    queryKey: ["loyalty", customerId],
    queryFn: () => getLoyalty(customerId),
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ["customerReservations", customerId],
    queryFn: () => getCustomerReservations(customerId),
  });

  const [editing, setEditing] = useState(false);
  const [customPoints, setCustomPoints] = useState("");
  const [showCustomPoints, setShowCustomPoints] = useState<"award" | "redeem" | null>(null);

  const patchMut = useMutation({
    mutationFn: (body: Parameters<typeof patchCustomer>[1]) => patchCustomer(customerId, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(["customer", customerId], updated);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCustomer(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      onDeleted();
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const loyaltyMut = useMutation({
    mutationFn: loyaltyAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty", customerId] });
      setShowCustomPoints(null);
      setCustomPoints("");
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  function handleDelete() {
    Alert.alert(
      "Delete Customer",
      `Remove ${customer?.name ?? "this customer"} from your CRM? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() },
      ]
    );
  }

  function handleLoyalty(type: "award" | "redeem", pts: number) {
    if (!customer) return;
    if (type === "redeem" && (loyalty?.points ?? 0) < pts) {
      Alert.alert("Insufficient points", `Customer only has ${loyalty?.points ?? 0} points.`);
      return;
    }
    loyaltyMut.mutate({ customerId, type, points: pts });
  }

  function handleCustomPoints(type: "award" | "redeem") {
    const pts = parseInt(customPoints, 10);
    if (!pts || pts <= 0) {
      Alert.alert("Invalid", "Enter a positive number of points.");
      return;
    }
    handleLoyalty(type, pts);
  }

  if (isLoading || !customer) {
    return (
      <View style={{ flex: 1, backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={C.gold} />
      </View>
    );
  }

  if (editing) {
    return (
      <CustomerForm
        title="Edit Customer"
        initial={{
          name: customer.name,
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          birthday: customer.birthday ?? "",
          tags: customer.tags ?? "",
          notes: customer.notes ?? "",
        }}
        saving={patchMut.isPending}
        onCancel={() => setEditing(false)}
        onSave={(v) =>
          patchMut.mutate({
            name: v.name.trim(),
            phone: v.phone.trim() || null,
            email: v.email.trim() || null,
            birthday: v.birthday.trim() || null,
            tags: v.tags.trim() || null,
            notes: v.notes.trim() || null,
          })
        }
      />
    );
  }

  const tags = parseTags(customer.tags);
  const birthdayMonth = isBirthdayThisMonth(customer.birthday);
  const loyaltyPoints = loyalty?.points ?? 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, flex: 1 }}>
        {/* drag handle */}
        <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, backgroundColor: C.rim, borderRadius: 2 }} />
        </View>

        {/* close + actions */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Ionicons name="close" size={22} color={C.mist} />
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setEditing(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}
            >
              <Ionicons name="pencil-outline" size={13} color={C.mist} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist }}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              disabled={deleteMut.isPending}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.coral, borderWidth: 1, borderColor: C.coral + "60", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}
            >
              <Ionicons name="trash-outline" size={13} color={C.coral} />
              <Text style={{ fontSize: 12, fontWeight: "600", color: C.coral }}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* profile header */}
          <View style={{ alignItems: "center", gap: 8, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: C.rim }}>
            <AvatarCircle name={customer.name} size={72} />
            <View style={{ alignItems: "center", gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: "700", color: C.pearl }}>{customer.name}</Text>
                {birthdayMonth && <Ionicons name="gift-outline" size={18} color={C.coral} />}
              </View>
              {customer.phone && (
                <Text style={{ fontSize: 14, color: C.mist }}>{customer.phone}</Text>
              )}
              {customer.email && (
                <Text style={{ fontSize: 13, color: C.smoke }}>{customer.email}</Text>
              )}
            </View>
            {tags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {tags.map((t) => <TagChip key={t} label={t} />)}
              </View>
            )}
          </View>

          {/* quick stats */}
          <View style={{ flexDirection: "row", marginTop: 16, marginBottom: 4, borderWidth: 1, borderColor: C.rim, borderRadius: 16, overflow: "hidden" }}>
            {[
              { label: "Visits", value: String(customer.visitCount), icon: "walk-outline" as const, color: C.sky },
              { label: "Points", value: loyaltyLoading ? "…" : String(loyaltyPoints), icon: "star-outline" as const, color: C.gold },
              { label: "Last Visit", value: customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—", icon: "time-outline" as const, color: C.jade },
            ].map((s, i) => (
              <View key={s.label} style={{ flex: 1, paddingVertical: 12, alignItems: "center", gap: 2, borderRightWidth: i < 2 ? 1 : 0, borderRightColor: C.rim }}>
                <Ionicons name={s.icon} size={16} color={s.color} />
                <Text style={{ fontSize: 16, fontWeight: "700", color: C.pearl }}>{s.value}</Text>
                <Text style={{ fontSize: 10, color: C.smoke }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* birthday */}
          {customer.birthday && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, backgroundColor: T.coral, borderWidth: 1, borderColor: C.coral + "50", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Ionicons name="gift-outline" size={16} color={C.coral} />
              <Text style={{ fontSize: 13, color: C.pearl, fontWeight: "500" }}>
                Birthday: {customer.birthday}
                {birthdayMonth ? "  — This month!" : ""}
              </Text>
            </View>
          )}

          {/* notes */}
          {customer.notes ? (
            <View style={{ marginTop: 16 }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Notes</Text>
              <View style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
                <Text style={{ fontSize: 13, color: C.pearl, lineHeight: 20 }}>{customer.notes}</Text>
              </View>
            </View>
          ) : null}

          {/* loyalty section */}
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Loyalty Points</Text>
              <View style={{ backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="ribbon-outline" size={13} color={C.gold} />
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.gold }}>{loyaltyLoading ? "…" : loyaltyPoints}</Text>
              </View>
            </View>

            {/* award quick */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {[50, 100].map((pts) => (
                <TouchableOpacity
                  key={pts}
                  onPress={() => handleLoyalty("award", pts)}
                  disabled={loyaltyMut.isPending}
                  style={{ flex: 1, backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim, borderRadius: 12, paddingVertical: 10, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: C.gold }}>+ {pts} pts</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowCustomPoints(showCustomPoints === "award" ? null : "award")}
                style={{ flex: 1, backgroundColor: C.gold, borderRadius: 12, paddingVertical: 10, alignItems: "center", ...shadow.gold }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.void }}>Custom Award</Text>
              </TouchableOpacity>
            </View>

            {/* redeem */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {[50, 100].map((pts) => (
                <TouchableOpacity
                  key={pts}
                  onPress={() => handleLoyalty("redeem", pts)}
                  disabled={loyaltyMut.isPending || loyaltyPoints < pts}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingVertical: 10,
                    alignItems: "center",
                    backgroundColor: loyaltyPoints >= pts ? T.coral : C.surfaceHi,
                    borderColor: loyaltyPoints >= pts ? C.coral + "60" : C.rim,
                    opacity: loyaltyPoints >= pts ? 1 : 0.4,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: loyaltyPoints >= pts ? C.coral : C.smoke }}>- {pts} pts</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowCustomPoints(showCustomPoints === "redeem" ? null : "redeem")}
                disabled={loyaltyPoints === 0}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                  backgroundColor: loyaltyPoints > 0 ? C.coral : C.surfaceHi,
                  opacity: loyaltyPoints > 0 ? 1 : 0.4,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: loyaltyPoints > 0 ? C.void : C.smoke }}>Custom Redeem</Text>
              </TouchableOpacity>
            </View>

            {/* custom points input */}
            {showCustomPoints !== null && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                <TextInput
                  value={customPoints}
                  onChangeText={setCustomPoints}
                  placeholder="Points"
                  placeholderTextColor={C.smoke}
                  keyboardType="number-pad"
                  style={{
                    flex: 1,
                    backgroundColor: C.surfaceHi,
                    borderWidth: 1,
                    borderColor: C.rim,
                    borderRadius: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    fontSize: 14,
                    color: C.pearl,
                  }}
                />
                <TouchableOpacity
                  onPress={() => handleCustomPoints(showCustomPoints)}
                  disabled={loyaltyMut.isPending}
                  style={{
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: showCustomPoints === "award" ? C.gold : C.coral,
                  }}
                >
                  {loyaltyMut.isPending ? (
                    <ActivityIndicator size="small" color={C.void} />
                  ) : (
                    <Text style={{ color: C.void, fontWeight: "700", fontSize: 14 }}>Go</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* recent transactions */}
            {loyalty && loyalty.transactions.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Recent Transactions</Text>
                {loyalty.transactions.slice(0, 5).map((tx) => (
                  <View key={tx.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.rim }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <View style={{
                        height: 28,
                        width: 28,
                        borderRadius: 14,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: tx.type === "award" ? T.gold : T.coral,
                      }}>
                        <Ionicons name={tx.type === "award" ? "add" : "remove"} size={13} color={tx.type === "award" ? C.gold : C.coral} />
                      </View>
                      <Text style={{ fontSize: 12, color: C.mist }}>{tx.reason ?? tx.type}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: tx.type === "award" ? C.gold : C.coral }}>
                        {tx.type === "award" ? "+" : "-"}{tx.points}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.smoke }}>{new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* reservation history */}
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, textTransform: "uppercase", letterSpacing: 1.2 }}>Reservation History</Text>
              <Text style={{ fontSize: 11, color: C.smoke }}>{customer.visitCount} total visits</Text>
            </View>
            {reservations.length === 0 ? (
              <View style={{ backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 16, paddingVertical: 24, alignItems: "center", gap: 6 }}>
                <Ionicons name="calendar-outline" size={24} color={C.smoke} />
                <Text style={{ fontSize: 13, color: C.smoke }}>No reservations yet</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {reservations.map((r: Reservation) => {
                  const isPast = r.date < new Date().toISOString().slice(0, 10);
                  const statusColors: Record<string, string> = {
                    CONFIRMED: C.jade, SEATED: C.sky, PENDING: C.gold,
                    CANCELLED: C.smoke, NO_SHOW: C.ember,
                  };
                  const statusColor = statusColors[r.status] ?? C.smoke;
                  return (
                    <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isPast ? C.void : "#0a1f2e", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: isPast ? C.rim : C.sky + "60" }}>
                        <Ionicons name={isPast ? "checkmark-circle-outline" : "calendar-outline"} size={17} color={isPast ? C.smoke : C.sky} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "600", color: C.pearl }}>
                          {new Date(r.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {r.time.slice(0, 5)}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.smoke, marginTop: 1 }}>
                          {r.partySize} {r.partySize === 1 ? "guest" : "guests"}{r.table ? ` · Table ${r.table.number}` : ""}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: statusColor + "22", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: "700", color: statusColor }}>{r.status}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* member since */}
          <Text style={{ textAlign: "center", fontSize: 10, color: C.smoke, marginTop: 20 }}>
            Member since {fmtDate(customer.createdAt)}
          </Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

// ── Duplicate-profile review & merge ───────────────────────────────────────────
function DuplicatesModal({ onClose, onMerged }: { onClose: () => void; onMerged: () => void }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ["customerDuplicates"], queryFn: getCustomerDuplicates });
  const [primaries, setPrimaries] = useState<Record<number, string>>({});
  const [merging, setMerging] = useState<number | null>(null);
  const groups: DuplicateGroup[] = data?.groups ?? [];

  async function doMerge(gi: number, g: DuplicateGroup) {
    const primaryId = primaries[gi] ?? g.primaryId;
    const dupes = g.members.filter((m) => m.id !== primaryId).map((m) => m.id);
    if (!dupes.length) return;
    setMerging(gi);
    try {
      await mergeCustomers(primaryId, dupes);
      await refetch();
      onMerged();
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMerging(null);
    }
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: "85%", paddingBottom: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>
            <View>
              <Text style={{ fontSize: 17, fontWeight: "800", color: C.pearl }}>Duplicate Profiles</Text>
              <Text style={{ fontSize: 12, color: C.smoke, marginTop: 1 }}>Vera matched these on phone, email, or name. History is preserved.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={C.mist} /></TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 48 }}><ActivityIndicator color={C.gold} /></View>
          ) : groups.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
              <Ionicons name="checkmark-circle-outline" size={34} color={C.jade} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.pearl }}>No duplicate profiles found</Text>
              <Text style={{ fontSize: 12, color: C.smoke }}>Your guest book is clean.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
              {groups.map((g, gi) => {
                const primaryId = primaries[gi] ?? g.primaryId;
                return (
                  <View key={gi} style={{ borderWidth: 1, borderColor: C.rim, borderRadius: 14, padding: 12, gap: 8, backgroundColor: C.surfaceHi }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: g.confidence === "high" ? `${C.coral}1A` : `${C.ember}1A` }}>
                          <Text style={{ fontSize: 10, fontWeight: "700", color: g.confidence === "high" ? C.coral : C.ember }}>{g.confidence === "high" ? "LIKELY" : "POSSIBLE"}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: C.smoke }}>{g.reason}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => doMerge(gi, g)}
                        disabled={merging === gi}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: C.gold, opacity: merging === gi ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: C.void }}>{merging === gi ? "Merging…" : "Merge"}</Text>
                      </TouchableOpacity>
                    </View>
                    {g.members.map((m) => {
                      const sel = m.id === primaryId;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          onPress={() => setPrimaries((p) => ({ ...p, [gi]: m.id }))}
                          style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: sel ? C.gold : C.rim, borderRadius: 10, padding: 10, backgroundColor: sel ? `${C.gold}0F` : C.surface }}
                        >
                          <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={18} color={sel ? C.gold : C.smoke} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: C.pearl }}>{m.name}</Text>
                            <Text style={{ fontSize: 11, color: C.smoke }}>{[m.phone, m.email].filter(Boolean).join(" · ") || "No contact info"}{m.visitCount != null ? ` · ${m.visitCount} visits` : ""}</Text>
                          </View>
                          {sel && <Text style={{ fontSize: 10, fontWeight: "800", color: C.gold, letterSpacing: 0.5 }}>KEEP</Text>}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function CustomersScreen() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const { data: customers = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["customers", debouncedQ],
    queryFn: () => searchCustomers(debouncedQ),
  });

  const createMut = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowAdd(false);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const sorted = useCallback(() => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const list = [...customers];
    switch (sortMode) {
      case "top":
        return list.sort((a, b) => b.visitCount - a.visitCount);
      case "recent":
        return list.sort((a, b) => {
          if (!a.lastVisitAt) return 1;
          if (!b.lastVisitAt) return -1;
          return new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime();
        });
      case "birthdays":
        return list.filter((c) => {
          if (!c.birthday) return false;
          const parts = c.birthday.split("-");
          const m = parts.length === 3 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
          return m === currentMonth;
        });
      default:
        return list;
    }
  }, [customers, sortMode]);

  const displayList = sorted();

  const SORT_OPTIONS: { key: SortMode; label: string }[] = [
    { key: "all", label: "All" },
    { key: "top", label: "Top Visitors" },
    { key: "recent", label: "Recent" },
    { key: "birthdays", label: "Birthdays" },
  ];

  const router = useRouter();
  const { scrollY, scrollHandler } = useCollapsingHeader();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <CollapsingHeader
        title="Customers"
        subtitle={`${customers.length} customers`}
        scrollY={scrollY}
        left={<TouchableOpacity onPress={() => router.navigate("/(app)/more")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="chevron-back" size={20} color={C.gold} /></TouchableOpacity>}
        right={<TouchableOpacity onPress={() => setDupOpen(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="git-merge-outline" size={19} color={C.gold} /></TouchableOpacity>}
      />
      {dupOpen && <DuplicatesModal onClose={() => setDupOpen(false)} onMerged={() => { queryClient.invalidateQueries({ queryKey: ["customers"] }); }} />}
      {/* search + sort controls */}
      <View style={{ backgroundColor: C.surface, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.rim }}>

        {/* search */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.surfaceHi, borderWidth: 1, borderColor: C.rim, borderRadius: 14, paddingHorizontal: 12, gap: 8, marginBottom: 12 }}>
          <Ionicons name="search-outline" size={16} color={C.smoke} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, phone or email…"
            placeholderTextColor={C.smoke}
            style={{ flex: 1, paddingVertical: 10, fontSize: 14, color: C.pearl }}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {isFetching && <ActivityIndicator size="small" color={C.gold} />}
        </View>

        {/* sort tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SORT_OPTIONS.map((opt) => {
            const active = sortMode === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSortMode(opt.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  backgroundColor: active ? C.gold : C.surfaceHi,
                  borderColor: active ? C.gold : C.rim,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? C.void : C.mist }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* list */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={C.gold} />
        </View>
      ) : displayList.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 }}>
          <View style={{ height: 64, width: 64, backgroundColor: C.surfaceHi, borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="people-outline" size={32} color={C.smoke} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.mist, textAlign: "center" }}>
            {sortMode === "birthdays"
              ? "No birthdays this month"
              : query
              ? "No customers found"
              : "No customers yet"}
          </Text>
          {!query && sortMode === "all" && (
            <Text style={{ fontSize: 12, color: C.smoke, textAlign: "center" }}>Tap the + button to add your first customer</Text>
          )}
        </View>
      ) : (
        <Animated.FlatList
          data={displayList}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CustomerCard customer={item} onPress={() => setSelectedId(item.id)} />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 112 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={C.gold} />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => setShowAdd(true)}
        style={{
          position: "absolute",
          bottom: 24,
          right: 20,
          height: 56,
          width: 56,
          backgroundColor: C.gold,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          ...shadow.gold,
        }}
      >
        <Ionicons name="add" size={28} color={C.void} />
      </TouchableOpacity>

      {/* Detail sheet modal */}
      <Modal
        visible={selectedId !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedId(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }} edges={["bottom"]}>
          {selectedId && (
            <CustomerDetailSheet
              customerId={selectedId}
              onClose={() => setSelectedId(null)}
              onDeleted={() => setSelectedId(null)}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Add customer modal */}
      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAdd(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }} edges={["bottom"]}>
          <CustomerForm
            title="New Customer"
            initial={{ name: "", phone: "", email: "", birthday: "", tags: "", notes: "" }}
            saving={createMut.isPending}
            onCancel={() => setShowAdd(false)}
            onSave={(v) =>
              createMut.mutate({
                name: v.name.trim(),
                phone: v.phone.trim() || undefined,
                email: v.email.trim() || undefined,
                birthday: v.birthday.trim() || undefined,
                tags: v.tags.trim() || undefined,
                notes: v.notes.trim() || undefined,
              })
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
