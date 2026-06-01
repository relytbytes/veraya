"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, Loader2, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleGroups } from "@/lib/nav";
import { VeraSpark } from "@/components/brand/vera-mark";

const OPEN_EVENT = "open-command-palette";

/** Open the palette from anywhere (e.g. the sidebar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

interface Cmd { href: string; label: string; icon: React.ComponentType<{ className?: string }>; group: string }
interface AskAnswer {
  answer: string;
  dataPoints?: { label: string; value: string; context: string; positive: boolean }[];
  followUps?: string[];
}

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [askedQ, setAskedQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isManager = ["ADMIN", "MANAGER"].includes(role);

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

  const showAsk = isManager && query.trim().length > 0;
  const rowCount = filtered.length + (showAsk ? 1 : 0);
  const inAnswerView = asking || !!answer;

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

  useEffect(() => {
    if (open) {
      setQuery(""); setActive(0); setAnswer(null); setAsking(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(cmd: Cmd | undefined) {
    if (!cmd) return;
    setOpen(false);
    router.push(cmd.href);
  }

  async function runAsk(question: string) {
    if (!question.trim()) return;
    setAsking(true); setAnswer(null); setAskedQ(question);
    try {
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const res = await fetch("/api/reports/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, from: iso(new Date(Date.now() - 30 * 86400_000)), to: iso(new Date()) }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setAnswer({ answer: d.answer ?? "No answer.", dataPoints: d.dataPoints ?? [], followUps: d.followUps ?? [] });
    } catch {
      setAnswer({ answer: "Vera could not analyze that right now. Try again in a moment.", dataPoints: [], followUps: [] });
    } finally {
      setAsking(false);
    }
  }

  function backToSearch() { setAnswer(null); setAsking(false); requestAnimationFrame(() => inputRef.current?.focus()); }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { if (inAnswerView) backToSearch(); else setOpen(false); return; }
    if (inAnswerView) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rowCount - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (showAsk && active === 0) { runAsk(query.trim()); return; }
      go(filtered[active - (showAsk ? 1 : 0)]);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center pt-[15vh] px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 border-b border-gray-200">
          {inAnswerView
            ? <button onClick={backToSearch} aria-label="Back to search" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="h-4 w-4" /></button>
            : <Search className="h-4 w-4 text-gray-400 shrink-0" />}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder={isManager ? "Search pages, or ask Vera anything…" : "Search pages…"}
            className="flex-1 py-3.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-medium text-gray-400 border border-gray-200 rounded px-1 py-0.5">esc</kbd>
        </div>

        {inAnswerView ? (
          /* ── Vera answer view ─────────────────────────────────────────────── */
          <div className="max-h-[26rem] overflow-y-auto p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <VeraSpark className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Vera</span>
              <span className="text-xs text-gray-400 truncate">· “{askedQ}”</span>
            </div>
            {asking ? (
              <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyzing the last 30 days…
              </div>
            ) : answer && (
              <>
                <p className="text-sm leading-relaxed text-gray-800">{answer.answer}</p>
                {answer.dataPoints && answer.dataPoints.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {answer.dataPoints.map((dp, i) => (
                      <span key={i} className={cn("rounded-lg border px-2 py-1 text-xs", dp.positive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                        <span className="font-semibold">{dp.value}</span> <span className="text-gray-500">{dp.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {answer.followUps && answer.followUps.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gray-400">Follow up</p>
                    <div className="space-y-1">
                      {answer.followUps.map((f, i) => (
                        <button key={i} onClick={() => runAsk(f)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50">
                          <VeraSpark className="h-3 w-3 shrink-0" /> {f}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ── Results ──────────────────────────────────────────────────────── */
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {showAsk && (
              <button
                data-idx={0}
                onClick={() => runAsk(query.trim())}
                onMouseMove={() => setActive(0)}
                className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", active === 0 ? "bg-amber-50" : "hover:bg-gray-50")}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", active === 0 ? "bg-amber-100" : "bg-gray-100")}>
                  <VeraSpark className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium text-gray-900">Ask Vera <span className="font-normal text-gray-400">“{query.trim()}”</span></span>
                {active === 0 && <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            )}
            {filtered.map((cmd, i) => {
              const idx = i + (showAsk ? 1 : 0);
              const Icon = cmd.icon;
              const isActive = idx === active;
              return (
                <button
                  key={cmd.href}
                  data-idx={idx}
                  onClick={() => go(cmd)}
                  onMouseMove={() => setActive(idx)}
                  className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left", isActive ? "bg-amber-50" : "hover:bg-gray-50")}
                >
                  <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", isActive ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900">{cmd.label}</span>
                  <span className="text-[11px] text-gray-400">{cmd.group}</span>
                  {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-gray-400" />}
                </button>
              );
            })}
            {filtered.length === 0 && !showAsk && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No matches for “{query}”.</p>
            )}
          </div>
        )}

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-gray-200 px-4 py-2 text-[11px] text-gray-400">
          {inAnswerView ? (
            <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">esc</kbd> back</span>
          ) : (
            <>
              <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="border border-gray-200 rounded px-1">↵</kbd> open</span>
              {isManager && <span className="ml-auto flex items-center gap-1"><VeraSpark className="h-3 w-3" /> ask Vera anything</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
