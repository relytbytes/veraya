"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ManagerAuthRequest {
  title: string;
  description?: string;
  /** Suggested reasons offered as quick-fill chips. */
  reasons: string[];
  confirmLabel?: string;
  /** Perform the protected action. Return {ok:false,error} to keep the dialog
   *  open with a message (e.g. invalid PIN). */
  onConfirm: (reason: string, managerPin: string) => Promise<{ ok: boolean; error?: string }>;
}

/** Gate a sensitive action (comp, void) behind a mandatory reason + manager PIN. */
export function ManagerAuthDialog({
  request,
  onClose,
}: {
  request: ManagerAuthRequest | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Reset whenever a new request opens.
  useEffect(() => {
    if (request) { setReason(""); setPin(""); setErr(""); setBusy(false); }
  }, [request]);

  if (!request) return null;

  async function submit() {
    const r = reason.trim();
    if (!r) { setErr("A reason is required."); return; }
    if (!pin.trim()) { setErr("Manager PIN is required."); return; }
    setBusy(true);
    setErr("");
    const res = await request!.onConfirm(r, pin.trim());
    setBusy(false);
    if (res.ok) onClose();
    else setErr(res.error ?? "Could not authorize. Check the PIN and try again.");
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-600" /> {request.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {request.description && <p className="text-sm text-gray-500">{request.description}</p>}

          <div className="space-y-1.5">
            <Label>Reason <span className="text-red-500">*</span></Label>
            <div className="flex flex-wrap gap-1.5">
              {request.reasons.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    reason === r
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:border-amber-400",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input
              placeholder="Reason for the record"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Manager PIN <span className="text-red-500">*</span></Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
            <p className="text-xs text-gray-400">A manager or admin must authorize this.</p>
          </div>

          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !reason.trim() || !pin.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {request.confirmLabel ?? "Authorize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
