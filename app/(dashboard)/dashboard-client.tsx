"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package, TrendingUp, RefreshCw, ChevronRight,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import React from "react";
import { VeraPanel } from "@/components/vera-panel";
import { rotatingGreeting, randomGreeting } from "@/lib/greeting";
import { VeraForecast } from "@/components/vera-forecast";
import { WeatherWidget } from "@/components/weather-widget";
import { VeraSetupGuide } from "@/components/vera-setup-guide";
import { CheckLookup, CheckDetailModal } from "./check-lookup";

// ── Role-based access ─────────────────────────────────────────────────────────

const MGMT   = new Set(["ADMIN", "MANAGER"]);
const FOH    = new Set(["SERVER", "HOST", "BARTENDER", "BARBACK", "SERVER_ASSISTANT", "FOOD_RUNNER", "CASHIER"]);
const BOH    = new Set(["KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP", "KITCHEN_DISH"]);

function canAccess(role: string, href: string): boolean {
  if (MGMT.has(role)) return true;
  if (href === "/")             return true;
  if (href === "/timeclock")    return true;
  if (href === "/pos")          return FOH.has(role) && role !== "BARBACK";
  if (href === "/kitchen")      return BOH.has(role) || role === "FOOD_RUNNER";
  if (href === "/host")         return role === "HOST" || role === "SERVER";
  if (href === "/reservations") return role === "HOST";
  return false;
}

const ALL_MODULES = [
  { href: "/pos",          label: "Point of Sale",    icon: "🛒", description: "Floor plan, tables & orders",  color: "bg-amber-50"  },
  { href: "/kitchen",      label: "Kitchen Display",  icon: "🍳", description: "Live ticket queue",            color: "bg-orange-50" },
  { href: "/reservations", label: "Reservations",     icon: "📅", description: "Book & manage guests",         color: "bg-blue-50"   },
  { href: "/host",         label: "Host Stand",       icon: "🪑", description: "Waitlist & seating",           color: "bg-indigo-50" },
  { href: "/menu",         label: "Menu",             icon: "🍽️", description: "Items, prices & categories",  color: "bg-green-50"  },
  { href: "/recipes",      label: "Recipes",          icon: "📖", description: "Ingredient-level costing",     color: "bg-teal-50"   },
  { href: "/inventory",    label: "Inventory",        icon: "📦", description: "Stock levels & alerts",        color: "bg-cyan-50"   },
  { href: "/purchasing",   label: "Purchasing",       icon: "🚚", description: "Purchase orders & suppliers",  color: "bg-sky-50"    },
  { href: "/staff",        label: "Staff",            icon: "👥", description: "Team, roles & schedules",      color: "bg-violet-50" },
  { href: "/timeclock",    label: "Time Clock",       icon: "⏱️", description: "Clock in / out & hours",      color: "bg-purple-50" },
  { href: "/prep-list",    label: "Prep List",        icon: "🍽️", description: "Daily forecast-based prep",    color: "bg-rose-50"   },
  { href: "/reports",      label: "Reports",          icon: "📊", description: "Sales, labor & analytics",     color: "bg-pink-50"   },
  { href: "/settings",     label: "Settings",         icon: "⚙️", description: "Tax, hours & integrations",   color: "bg-gray-100"  },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface RecentOrder {
  id: string;
  status: string;
  total: number;
  type: string;
  createdAt: string;
  table: { number: number } | null;
  items: { id: string; menuItem: { name: string } }[];
}

interface LowStockAlert {
  id: string;
  quantity: number;
  minThreshold: number;
  ingredient: { name: string; unit: string };
}

interface DashboardStats {
  salesTotal: number;
  salesCount: number;
  openOrders: number;
  lowStockCount: number;
  menuItemCount: number;
  recentOrders: RecentOrder[];
  lowStockAlerts: LowStockAlert[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardClient({ role, name }: { role: string; name: string | null }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [checkId, setCheckId] = useState<string | null>(null);
  const [, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const isManager = MGMT.has(role);
  const navModules = ALL_MODULES.filter(m => canAccess(role, m.href));

  // Keep a ref to the in-flight controller so we can abort it before starting a new fetch
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    // Cancel any previous in-flight request before starting a new one
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard/stats", { signal });
      if (res.ok) {
        const data: DashboardStats = await res.json();
        setStats(data);
        setLastUpdated(new Date());
        setLoadError(false);
      } else {
        setLoadError(true);
      }
    } catch (err) {
      // AbortError is expected when a newer request supersedes this one — don't flag as error
      if ((err as Error)?.name !== "AbortError") setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // 60s is plenty — stats are cached for 60s on the server anyway
    const interval = setInterval(() => load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // Suppress unused warning — router is used for future nav
  void router;

  // Match the mobile dashboard header: a warm, personal greeting + today's order
  // count, instead of a generic "Dashboard" title. Initialize with the SSR-safe
  // deterministic phrase (no hydration mismatch), then roll a fresh random one
  // on mount so it visibly rotates each page load.
  const [greeting, setGreeting] = useState(rotatingGreeting);
  useEffect(() => { setGreeting(randomGreeting()); }, []);
  const firstName = name?.split(" ")[0] ?? "there";

  return (
    <div>
      <Header
        title={`${greeting}, ${firstName}`}
        actions={
          <button
            onClick={() => load(true)}
            aria-label="Refresh"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Current conditions — hidden until a venue location is set in Settings */}
        <WeatherWidget />

        {loadError && !stats && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            ⚠️ Could not load dashboard data.{" "}
            <button onClick={() => load(true)} className="underline font-medium">Try again</button>.
          </div>
        )}

        {/* Vera first-run setup guide — managers only, hides once complete */}
        {isManager && <VeraSetupGuide />}

        {/* Vera — managers only */}
        {isManager && <VeraPanel />}
        {isManager && <VeraForecast />}

        {/* Navigation hub */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 px-0.5">Quick Access</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {navModules.map(({ href, label, icon, description, color }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-2.5 rounded-2xl border border-gray-200 bg-white p-4 hover:border-amber-300 hover:shadow-sm transition-all"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-xl ${color}`}>
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-700 transition-colors leading-tight">
                    {label}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {isManager && <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Orders */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-gray-500" />
                Recent Orders
              </CardTitle>
              <CheckLookup />
            </CardHeader>
            <CardContent>
              {!stats || stats.recentOrders.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No orders yet</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {stats.recentOrders.map((order) => {
                    return (
                      <button
                        key={order.id}
                        onClick={() => setCheckId(order.id)}
                        className="w-full text-left flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors group"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-amber-700 transition-colors">
                            {order.table
                              ? `Table ${order.table.number}`
                              : order.type === "TAKEOUT"
                              ? "Takeout"
                              : "Dine In"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {order.items.length} item{order.items.length !== 1 ? "s" : ""} ·{" "}
                            {new Date(order.createdAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatCurrency(Number(order.total))}</p>
                            <StatusBadge status={order.status} />
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-amber-400 transition-colors" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Low Stock */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-500" />
                Low Stock Alerts
              </CardTitle>
              <Link href="/inventory" className="text-xs text-amber-600 hover:underline font-medium">
                Inventory →
              </Link>
            </CardHeader>
            <CardContent>
              {!stats || stats.lowStockAlerts.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-gray-400">All inventory levels are good</p>
                  <Link href="/inventory" className="text-xs text-amber-600 hover:underline mt-1 inline-block">
                    View inventory →
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {stats.lowStockAlerts.map((item) => (
                    <Link
                      key={item.id}
                      href="/inventory"
                      className="flex items-center justify-between py-2.5 hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors group"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 group-hover:text-amber-700 transition-colors">
                          {item.ingredient.name}
                        </p>
                        <p className="text-xs text-gray-400">
                          Min: {Number(item.minThreshold)} {item.ingredient.unit}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className={cn(
                            "text-sm font-semibold",
                            Number(item.quantity) === 0 ? "text-red-600" : "text-warning-600"
                          )}>
                            {Number(item.quantity)} {item.ingredient.unit}
                          </p>
                          <p className="text-xs text-gray-400">in stock</p>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-amber-400 transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>}
      </div>
      {checkId && <CheckDetailModal orderId={checkId} onClose={() => setCheckId(null)} />}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: "text-blue-600 bg-blue-50",
    IN_PROGRESS: "text-amber-600 bg-amber-50",
    READY: "text-green-600 bg-green-50",
    COMPLETED: "text-gray-500 bg-gray-100",
    CANCELLED: "text-red-500 bg-red-50",
  };
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${map[status] ?? "text-gray-500"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
