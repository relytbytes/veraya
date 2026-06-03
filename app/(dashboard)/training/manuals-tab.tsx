"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Manual {
  id: string; title: string; category: string; summary: string;
  roles: string[]; content: string; builtIn: boolean;
}

const CAT_COLOR: Record<string, string> = {
  Service: "bg-teal-50 text-teal-700 border-teal-200",
  Bar: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Kitchen: "bg-amber-50 text-amber-700 border-amber-200",
  Safety: "bg-red-50 text-red-700 border-red-200",
  Systems: "bg-gray-100 text-gray-600 border-gray-200",
};

/** Minimal markdown: # / ## headings, - bullets, blank lines, plain paragraphs. */
function renderContent(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      out.push(<ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-1 my-2 text-sm text-gray-700">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>);
      bullets = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) { flush(); out.push(<h4 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1">{line.slice(3)}</h4>); }
    else if (line.startsWith("# ")) { flush(); out.push(<h3 key={i} className="text-lg font-bold text-gray-900 mt-1 mb-1">{line.slice(2)}</h3>); }
    else if (line.startsWith("- ")) { bullets.push(line.slice(2)); }
    else if (line.trim() === "") { flush(); }
    else { flush(); out.push(<p key={i} className="text-sm text-gray-700 my-1.5">{line}</p>); }
  });
  flush();
  return out;
}

export function ManualsTab({ search = "" }: { search?: string }) {
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Manual | null>(null);

  useEffect(() => {
    fetch("/api/training/documents").then((r) => r.ok ? r.json() : []).then((d) => { setManuals(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? manuals.filter((m) => `${m.title} ${m.summary} ${m.category}`.toLowerCase().includes(q))
    : manuals;

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <button key={m.id} onClick={() => setOpen(m)}
            className="text-left rounded-xl border border-gray-200 bg-white p-4 hover:border-teal-300 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2">
              <BookOpen className="h-5 w-5 text-teal-600 shrink-0" />
              <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", CAT_COLOR[m.category] ?? CAT_COLOR.Systems)}>{m.category}</span>
            </div>
            <h3 className="mt-2 font-semibold text-gray-900 leading-tight">{m.title}</h3>
            <p className="mt-1 text-xs text-gray-500 line-clamp-2">{m.summary}</p>
            {m.builtIn && <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-400"><Sparkles className="h-3 w-3" /> Veraya standard</span>}
          </button>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-12">No manuals match your search.</p>}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-teal-600" /> {open?.title}
            </DialogTitle>
          </DialogHeader>
          {open && <div className="prose-sm">{renderContent(open.content)}</div>}
        </DialogContent>
      </Dialog>
    </>
  );
}
