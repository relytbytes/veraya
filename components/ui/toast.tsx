"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tiny dependency-free toast system with a module-level store, in the same
 * "roll our own UI primitive" style as the rest of components/ui.
 *
 * Usage: import { toast } from "@/components/ui/toast"; toast.success("Saved");
 * Mount <Toaster /> once (done in the dashboard layout).
 */

export type ToastVariant = "default" | "success" | "error" | "info";
interface ToastItem { id: number; message: string; variant: ToastVariant }

let items: ToastItem[] = [];
let listeners: Array<(t: ToastItem[]) => void> = [];
let nextId = 1;

function emit() {
  for (const l of listeners) l(items);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(message: string, variant: ToastVariant) {
  const id = nextId++;
  items = [...items, { id, message, variant }];
  emit();
  setTimeout(() => dismiss(id), 3800);
  return id;
}

export const toast = Object.assign(
  (message: string) => push(message, "default"),
  {
    success: (message: string) => push(message, "success"),
    error: (message: string) => push(message, "error"),
    info: (message: string) => push(message, "info"),
    dismiss,
  },
);

const VARIANT_STYLE: Record<ToastVariant, { icon: React.ReactNode; ring: string }> = {
  default: { icon: <Info className="h-4 w-4 text-gray-500" />, ring: "border-gray-200" },
  success: { icon: <CheckCircle2 className="h-4 w-4" style={{ color: "#1E7A45" }} />, ring: "border-[#1E7A45]/30" },
  error: { icon: <AlertCircle className="h-4 w-4" style={{ color: "#D44030" }} />, ring: "border-[#D44030]/30" },
  info: { icon: <Info className="h-4 w-4" style={{ color: "#2E6EB0" }} />, ring: "border-[#2E6EB0]/30" },
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.push(setList);
    setList(items);
    return () => { listeners = listeners.filter((l) => l !== setList); };
  }, []);

  if (list.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {list.map((t) => {
        const v = VARIANT_STYLE[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-center gap-2.5 rounded-xl bg-white border px-3.5 py-2.5 shadow-lg text-sm text-gray-900 max-w-md animate-in",
              v.ring,
            )}
            style={{ animation: "toast-in 160ms ease-out" }}
          >
            {v.icon}
            <span className="font-medium">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 text-gray-400 hover:text-gray-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
