"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

// Responsive shell: on desktop/iPad the sidebar is a static column (unchanged);
// on phones it becomes an off-canvas drawer toggled by a hamburger, so the main
// content gets the full width instead of being squeezed into a sliver.
export function DashboardShell({
  role,
  name,
  children,
}: {
  role: string;
  name: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Drawer backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar role={role} name={name} open={open} onClose={() => setOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with the menu toggle (hidden on lg+) */}
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-md p-1 text-gray-700 hover:bg-gray-100"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="text-lg font-bold text-gray-900">Veraya</span>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
