"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Promise-based confirm dialog — a branded replacement for window.confirm().
 *
 * Usage: if (!(await confirmDialog({ message: "Delete this?", destructive: true }))) return;
 * Mount <ConfirmHost /> once (done in the dashboard layout). Falls back to the
 * native confirm if the host isn't mounted (e.g. SSR / outside the dashboard).
 */

interface ConfirmOpts {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}
interface ConfirmState extends ConfirmOpts { resolve: (v: boolean) => void }

let listener: ((s: ConfirmState | null) => void) | null = null;

export function confirmDialog(opts: ConfirmOpts | string): Promise<boolean> {
  const o = typeof opts === "string" ? { message: opts } : opts;
  return new Promise((resolve) => {
    if (!listener) {
      resolve(typeof window !== "undefined" ? window.confirm(o.message) : false);
      return;
    }
    listener({ ...o, resolve });
  });
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(null);
  useEffect(() => {
    listener = setState;
    return () => { listener = null; };
  }, []);

  if (!state) return null;
  const close = (v: boolean) => { state.resolve(v); setState(null); };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{state.title ?? "Are you sure?"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 leading-relaxed">{state.message}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{state.cancelText ?? "Cancel"}</Button>
          <Button
            className={state.destructive ? "bg-red-600 hover:bg-red-700 text-white" : undefined}
            onClick={() => close(true)}
          >
            {state.confirmText ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
