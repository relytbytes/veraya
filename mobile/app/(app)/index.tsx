"use client";
import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Animated, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, T, shadow } from "@/lib/theme";
import { useManualRefresh } from "@/lib/use-manual-refresh";
import { CollapsingHeader, useCollapsingHeader } from "@/components/CollapsingHeader";
import { VeraCard } from "@/components/VeraCard";
import { VeraForecastCard, VeraSetupCard } from "@/components/VeraInsights";
import { ShiftHandoff } from "@/components/ShiftHandoff";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ─── Module grid (previously in More) ────────────────────────────────────────

type Module = {
  label: string;
  description: string;
  icon: IoniconName;
  color: string;
  href?: string;
  soon?: boolean;
};

const MODULES: Module[] = [
  // Front of House
  { label: "Reservations",    description: "Book & manage covers",          icon: "calendar-outline",       color: C.sky,   href: "/(app)/reservations" },
  { label: "Customers",       description: "CRM, loyalty & profiles",       icon: "person-outline",         color: C.jade,  href: "/(app)/customers" },
  { label: "Events",          description: "Catering & private dining",     icon: "star-outline",           color: C.gold,  href: "/(app)/events" },
  { label: "Gift Cards",      description: "Issue, load & redeem",          icon: "gift-outline",           color: C.coral, href: "/(app)/giftcards" },
  { label: "Bar",             description: "Drink tickets display",         icon: "wine-outline",           color: C.ember, href: "/(app)/bar" },
  // Operations
  { label: "Menu",            description: "Items, prices & recipes",       icon: "restaurant-outline",     color: C.jade,  href: "/(app)/menu" },
  { label: "Purchase Orders", description: "Supplier orders & receiving",   icon: "receipt-outline",        color: C.sky,   href: "/(app)/invoices" },
  { label: "Reorder List",    description: "Build need-to-order by vendor", icon: "list-outline",           color: C.ember, href: "/(app)/reorder" },
  { label: "86 List",         description: "Flag unavailable menu items",   icon: "close-circle-outline",   color: C.coral, href: "/(app)/eightysix" },
  { label: "Prep List",       description: "Forecasted prep for tomorrow",  icon: "cut-outline",            color: C.jade,  href: "/(app)/preplist" },
  { label: "Manager Log",     description: "Incidents, cash & notes",       icon: "document-text-outline",  color: C.sky,   href: "/(app)/managerlog" },
  // Analytics
  { label: "Reports",         description: "Sales, labor & food cost",      icon: "bar-chart-outline",      color: C.gold,  href: "/(app)/reports" },
  { label: "Prime Cost",      description: "Food + labor vs revenue",       icon: "pie-chart-outline",      color: C.jade,  href: "/(app)/primecost" },
  // Staff
  { label: "Staff",           description: "Team, roles & pay rates",       icon: "people-outline",         color: C.sky,   href: "/(app)/staff" },
  { label: "Schedule",        description: "Weekly shifts & publishing",    icon: "calendar-number-outline",color: C.jade,  href: "/(app)/schedule" },
  { label: "Time Clock",      description: "Clock in / out & hours",        icon: "timer-outline",          color: C.ember, href: "/(app)/timeclock" },
  { label: "Training",        description: "Checklists & sign-offs",        icon: "school-outline",         color: C.jade,  href: "/(app)/training" },
  { label: "Loyalty",         description: "Points, rewards & history",     icon: "ribbon-outline",         color: C.gold,  href: "/(app)/loyalty" },
  // Config
  { label: "Settings",        description: "Tax, loyalty & notifications",  icon: "settings-outline",       color: C.mist,  href: "/(app)/settings" },
];

const SECTIONS = [
  { title: "Front of House", keys: ["Reservations", "Customers", "Events", "Gift Cards"] },
  { title: "Operations",     keys: ["Menu", "Purchase Orders", "Reorder List", "86 List", "Prep List", "Manager Log"] },
  { title: "Analytics",      keys: ["Reports", "Prime Cost"] },
  { title: "Staff",          keys: ["Staff", "Schedule", "Time Clock", "Training", "Loyalty"] },
  { title: "Config",         keys: ["Settings"] },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { refreshing, run } = useManualRefresh();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const router = useRouter();
  const [handoffOpen, setHandoffOpen] = useState(false);

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardStats,
    refetchInterval: 30_000,
  });

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const { scrollY, scrollHandler } = useCollapsingHeader();

  const statTiles = [
    {
      label: "Today's Sales",
      value: stats ? `$${Number(stats.salesTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
      sub: `${stats?.salesCount ?? 0} orders`,
      icon: "trending-up" as IoniconName,
      color: C.jade,
      href: "/(app)/pos",
    },
    {
      label: "Open Orders",
      value: String(stats?.openOrders ?? "—"),
      sub: "active now",
      icon: "flame" as IoniconName,
      color: C.ember,
      href: "/(app)/kitchen",
    },
    {
      label: "Menu Items",
      value: String(stats?.menuItemCount ?? "—"),
      sub: "active items",
      icon: "restaurant" as IoniconName,
      color: C.gold,
      href: "/(app)/menu",
    },
    {
      label: "Low Stock",
      value: String(stats?.lowStockCount ?? "—"),
      sub: stats?.lowStockCount ? "need attention" : "all good",
      icon: "alert-circle" as IoniconName,
      color: stats?.lowStockCount ? C.coral : C.mist,
      href: "/(app)/inventory",
    },
  ];

  const modMap = new Map(MODULES.map((m) => [m.label, m]));

  function handleModule(mod: Module) {
    if (mod.soon) {
      Alert.alert("Coming Soon", `${mod.label} will be available in a future update.`);
      return;
    }
    if (mod.href) router.push(mod.href as never);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.void }}>
      <ShiftHandoff visible={handoffOpen} onClose={() => setHandoffOpen(false)} />

      <CollapsingHeader
        title={`${greeting}, ${firstName}`}
        subtitle={`${stats?.salesCount ?? 0} orders today`}
        scrollY={scrollY}
        right={
          <TouchableOpacity
            onPress={clearAuth}
            style={{
              flexDirection: "row", alignItems: "center", gap: 6,
              paddingHorizontal: 14, paddingVertical: 8,
              backgroundColor: C.surfaceHi,
              borderRadius: 12, borderWidth: 1, borderColor: C.rim,
            }}
          >
            <Ionicons name="log-out-outline" size={14} color={C.mist} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.mist }}>Sign out</Text>
          </TouchableOpacity>
        }
      />

      <Animated.ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => run(refetch)} tintColor={C.gold} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={scrollHandler}
      >

        {/* ── Vera + Shift Handoff (managers/admins only) ──── */}
        {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
          <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 12 }}>
            <VeraSetupCard />
            <VeraCard />
            <VeraForecastCard />

            {/* Shift Handoff entry card */}
            <TouchableOpacity
              onPress={() => setHandoffOpen(true)}
              activeOpacity={0.8}
              style={{
                backgroundColor: C.surface, borderRadius: 18,
                borderWidth: 1, borderColor: C.rim,
                padding: 16, flexDirection: "row", alignItems: "center", gap: 14,
                ...shadow.sm,
              }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 13,
                backgroundColor: T.gold, borderWidth: 1, borderColor: C.goldDim,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons name="document-text-outline" size={22} color={C.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>Shift Handoff</Text>
                <Text style={{ fontSize: 12, color: C.mist, marginTop: 2 }}>
                  Generate an AI digest for the incoming manager
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.smoke} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stat tiles ──────────────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 }}>
            At a Glance
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {statTiles.map((tile) => (
              <TouchableOpacity
                key={tile.label}
                onPress={() => router.push(tile.href as never)}
                activeOpacity={0.7}
                style={{
                  flex: 1, minWidth: "44%",
                  backgroundColor: C.surface,
                  borderWidth: 1, borderColor: C.rim,
                  borderRadius: 20, padding: 18,
                  ...shadow.sm,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <View style={{
                    width: 36, height: 36, borderRadius: 12,
                    backgroundColor: `${tile.color}18`,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Ionicons name={tile.icon} size={18} color={tile.color} />
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={C.smoke} />
                </View>
                <Text style={{ fontSize: 26, fontWeight: "700", color: C.pearl }}>
                  {isLoading ? "—" : tile.value}
                </Text>
                <Text style={{ fontSize: 11, color: C.mist, marginTop: 3 }}>{tile.sub}</Text>
                <Text style={{ fontSize: 10, fontWeight: "600", color: C.smoke, marginTop: 8, letterSpacing: 0.3 }}>
                  {tile.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Module sections (previously in More) ────────────────────────── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 28, gap: 24 }}>
          {SECTIONS.map((section) => {
            const mods = section.keys.map((k) => modMap.get(k)).filter(Boolean) as Module[];
            return (
              <View key={section.title}>
                <Text style={{
                  fontSize: 10, fontWeight: "700", color: C.smoke,
                  letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10,
                }}>
                  {section.title}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {mods.map((mod) => (
                    <TouchableOpacity
                      key={mod.label}
                      onPress={() => handleModule(mod)}
                      activeOpacity={0.7}
                      style={{
                        flex: 1, minWidth: "44%",
                        backgroundColor: C.surface,
                        borderWidth: 1, borderColor: C.rim,
                        borderRadius: 18, padding: 16, gap: 12,
                        opacity: mod.soon ? 0.5 : 1,
                        ...shadow.sm,
                      }}
                    >
                      <View style={{
                        width: 40, height: 40, borderRadius: 12,
                        backgroundColor: `${mod.color}18`,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Ionicons name={mod.icon} size={20} color={mod.color} />
                      </View>
                      <View style={{ gap: 4 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text style={{ fontSize: 14, fontWeight: "700", color: C.pearl }}>{mod.label}</Text>
                          {mod.soon && (
                            <View style={{ backgroundColor: T.mist, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: C.mist, letterSpacing: 0.5 }}>SOON</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: C.mist, lineHeight: 15 }}>{mod.description}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {/* App info */}
        <View style={{ alignItems: "center", paddingTop: 28, gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: C.smoke }}>Veraya</Text>
          <Text style={{ fontSize: 10, color: C.smoke }}>v2.0 · Expo + Next.js</Text>
        </View>

      </Animated.ScrollView>
    </SafeAreaView>
  );
}
