"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleGroups, isActivePath } from "@/lib/nav";
import { openCommandPalette } from "./command-palette";

const COLLAPSE_KEY = "sidebar:collapsedSections";

export function Sidebar({ role = "SERVER", name }: { role?: string; name?: string | null }) {
  const pathname = usePathname();
  const router   = useRouter();
  const groups   = visibleGroups(role);

  // Persisted collapsed-section state (keyed by section label).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) setCollapsed(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  function toggle(label: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <aside className="flex h-screen w-56 flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon-512.png?v=2" alt="Veraya" width={28} height={28} className="rounded-lg" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none" style={{ color: "#21A090" }}>Veraya</p>
          <p className="text-xs text-gray-400 mt-0.5">Operating platform</p>
        </div>
      </div>

      {/* Search / command palette trigger */}
      <div className="px-3 pt-3">
        <button
          onClick={openCommandPalette}
          className="flex w-full items-center gap-2 rounded-md border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-medium text-gray-500 border border-gray-700 rounded px-1 py-0.5">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group, gi) => {
          const isCollapsed = group.label ? collapsed[group.label] : false;
          return (
            <div key={group.label ?? `g-${gi}`} className={cn(gi > 0 && "mt-3")}>
              {group.label && (
                <button
                  onClick={() => toggle(group.label!)}
                  className="flex w-full items-center gap-1 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")} />
                  {group.label}
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = isActivePath(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-amber-500 text-white"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-gray-700 px-3 py-3 space-y-1">
        {name && (
          <p className="px-3 py-1 text-xs text-gray-500 truncate">
            {name} · <span className="capitalize">{role.replace(/_/g, " ").toLowerCase()}</span>
          </p>
        )}
        <button
          onClick={() => signOut({ redirect: false }).then(() => router.push("/login"))}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
