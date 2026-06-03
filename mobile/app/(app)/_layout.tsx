import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/api";
import { View, Text } from "react-native";
import { useEffect } from "react";
import { lockPortrait } from "@/lib/orientation";
import { useAuthStore } from "@/store/auth";
import { RealtimeProvider } from "@/components/RealtimeProvider";
import { C } from "@/lib/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return <Ionicons name={name} size={22} color={focused ? C.gold : C.smoke} />;
}

function BadgeIcon({
  name, focused, count, color = C.coral,
}: { name: IoniconName; focused: boolean; count?: number; color?: string }) {
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name={name} size={22} color={focused ? C.gold : C.smoke} />
      {!!count && count > 0 && (
        <View style={{
          position: "absolute", top: -4, right: -7,
          backgroundColor: color, borderRadius: 8,
          minWidth: 16, height: 16,
          alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
        }}>
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  // App is portrait by default; only Station mode rotates to landscape (it locks
  // landscape on entry and restores portrait on exit).
  useEffect(() => { lockPortrait(); }, []);

  const { data: stats } = useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboardStats,
    refetchInterval: 120_000,
  });
  const openOrders = stats?.openOrders ?? 0;
  const lowStockCount = stats?.lowStockCount ?? 0;

  return (
    <>
    <RealtimeProvider />
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: C.smoke,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.rim,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
          height: 72,
          paddingBottom: 12,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          marginTop: 3,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: isManager ? undefined : null,
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "home" : "home-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: "Tables",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "grid" : "grid-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="kitchen"
        options={{
          title: "Kitchen",
          tabBarIcon: ({ focused }) => (
            <BadgeIcon name={focused ? "flame" : "flame-outline"} focused={focused} count={openOrders} color={C.ember} />
          ),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          href: isManager ? undefined : null,
          title: "Inventory",
          tabBarIcon: ({ focused }) => (
            <BadgeIcon name={focused ? "cube" : "cube-outline"} focused={focused} count={lowStockCount} color={C.coral} />
          ),
        }}
      />
      {/* Hidden screens — navigated to from Home */}
      <Tabs.Screen name="bar" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ href: null }} />
      <Tabs.Screen name="reservations" options={{ href: null }} />
      <Tabs.Screen name="invoices"     options={{ href: null }} />
      <Tabs.Screen name="menu"         options={{ href: null }} />
      <Tabs.Screen name="reorder"      options={{ href: null }} />
      <Tabs.Screen name="schedule"     options={{ href: null }} />
      <Tabs.Screen name="staff"        options={{ href: null }} />
      <Tabs.Screen name="timeclock"    options={{ href: null }} />
      <Tabs.Screen name="customers"    options={{ href: null }} />
      <Tabs.Screen name="events"       options={{ href: null }} />
      <Tabs.Screen name="giftcards"    options={{ href: null }} />
      <Tabs.Screen name="loyalty"      options={{ href: null }} />
      <Tabs.Screen name="reports"      options={{ href: null }} />
      <Tabs.Screen name="settings"     options={{ href: null }} />
      <Tabs.Screen name="eightysix"    options={{ href: null }} />
      <Tabs.Screen name="preplist"     options={{ href: null }} />
      <Tabs.Screen name="preshift"     options={{ href: null }} />
      <Tabs.Screen name="beverages"    options={{ href: null }} />
      <Tabs.Screen name="station"      options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="managerlog"   options={{ href: null }} />
      <Tabs.Screen name="training"     options={{ href: null }} />
      <Tabs.Screen name="primecost"    options={{ href: null }} />
    </Tabs>
    </>
  );
}
