"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleGroups } from "@/lib/nav";

const OPEN_EVENT = "open-command-palette";

/** Open the palette from anywhere (e.g. the sidebar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Cmd { href: string; label: string; icon: React.ComponentType<{ className?: string }>; group: string }

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Cmd[]>(
    () => visibleGroups(role).flatMap((g) =>
      g.items.map((i) => ({ href: i.href, label: i.label, icon: i.icon, group: g.label ?? "General" })),
    ),
    [role],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)) : commands),
    [commands, q],
  );

  // Global ⌘K / Ctrl+K toggle + open-from-elsewhere event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, []);

  // Reset + focus when opening.
  useEffect(() => {
    if (open) { setQuery(""); setActive(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  // Keep the active row in view.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(cmd: Cmd | undefined) {
    if (!cmd) return;
    setOpen(false);
    router.push(cmd.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(filtered[active]); }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[15vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 border-b border-gray-200">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search pages…"
            className="flex-1 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded px-1 py-0.5">esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No matches for “{query}”.</p>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              const isActive = i === active;
              return (
                <button
                  key={cmd.href}
                  data-idx={i}
                  onClick={() => go(cmd)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                    isActive ? "bg-amber-50" : "hover:bg-gray-50",
                  )}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", isActive ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900">{cmd.label}</span>
                  <span className="text-[11px] text-gray-400">{cmd.group}</span>
                  {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
        </div>
      </div>
    </div>
  );
}
