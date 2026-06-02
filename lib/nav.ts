import {
  LayoutDashboard, UtensilsCrossed, Package, ShoppingCart, Users, BarChart3,
  Truck, Settings, ChefHat, CalendarDays, BookOpen, Clock, ConciergeBell,
  ClipboardList, RefreshCw, GlassWater, ListChecks, GraduationCap, PartyPopper,
  Wine, Sparkles,
  type LucideIcon,
} from "lucide-react";

// Shared navigation model used by both the sidebar and the ⌘K command palette,
// so they can never drift out of sync.

export interface NavItem { href: string; label: string; icon: LucideIcon }
export interface NavGroup { label: string | null; items: NavItem[] }

const MGMT = new Set(["ADMIN", "MANAGER"]);
const BOH = new Set(["KITCHEN", "KITCHEN_LINE", "KITCHEN_PREP", "KITCHEN_DISH"]);

/** Role-based visibility (mirrors the dashboard page's access rules). */
export function canSee(role: string, href: string): boolean {
  if (MGMT.has(role)) return true;
  if (href === "/") return true;
  if (href === "/timeclock") return true;
  if (href === "/pos") return !BOH.has(role) && role !== "BARBACK";
  if (href === "/kitchen") return BOH.has(role) || role === "FOOD_RUNNER";
  if (href === "/bar") return role === "BARBACK" || role === "BARTENDER" || BOH.has(role);
  if (href === "/host") return role === "HOST" || role === "SERVER";
  if (href === "/reservations") return role === "HOST";
  if (href === "/pre-shift") return role === "HOST";
  return false;
}

export const navGroups: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Service",
    items: [
      { href: "/pos",          label: "Point of Sale", icon: ShoppingCart  },
      { href: "/kitchen",      label: "Kitchen",       icon: ChefHat       },
      { href: "/bar",          label: "Bar",           icon: Wine          },
      { href: "/host",         label: "Host Stand",    icon: ConciergeBell },
      { href: "/reservations", label: "Reservations",  icon: CalendarDays  },
      { href: "/events",       label: "Events",        icon: PartyPopper   },
    ],
  },
  {
    label: "Menu",
    items: [
      { href: "/menu",               label: "Menu",        icon: UtensilsCrossed },
      { href: "/recipes",            label: "Recipes",     icon: BookOpen        },
      { href: "/inventory/beverage", label: "Bar Program", icon: GlassWater      },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory",          label: "Inventory",     icon: Package    },
      { href: "/prep-list",          label: "Prep List",     icon: ListChecks },
      { href: "/purchasing",         label: "Purchasing",    icon: Truck      },
      { href: "/purchasing/reorder", label: "Smart Reorder", icon: RefreshCw  },
    ],
  },
  {
    label: "Team",
    items: [
      { href: "/staff",       label: "Staff",       icon: Users         },
      { href: "/timeclock",   label: "Time Clock",  icon: Clock         },
      { href: "/training",    label: "Training",    icon: GraduationCap },
      { href: "/manager-log", label: "Manager Log", icon: ClipboardList },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/pre-shift", label: "Pre-Shift", icon: Sparkles },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: null,
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);

/** Groups with role-filtered items; empty groups dropped. */
export function visibleGroups(role: string): NavGroup[] {
  return navGroups
    .map((g) => ({ label: g.label, items: g.items.filter((i) => canSee(role, i.href)) }))
    .filter((g) => g.items.length > 0);
}

/** A parent route shouldn't stay active when a sibling child route (with its own
 *  nav entry) is the current path — e.g. /inventory vs /inventory/beverage. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  const childHrefs = allNavItems
    .filter((i) => i.href !== href && i.href.startsWith(href + "/"))
    .map((i) => i.href);
  return !childHrefs.some((c) => pathname === c || pathname.startsWith(c + "/"));
}
