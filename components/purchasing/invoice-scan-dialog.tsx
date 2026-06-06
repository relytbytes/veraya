"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Receipt, Loader2, AlertCircle, X, RefreshCw, CheckCircle2, Camera } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export interface InvoiceLine {
  description: string;
  quantity: number | null;
  unit: string | null;
  unitCost: number | null;
  lineTotal: number | null;
  matchedIngredientId: string | null;
  matchedIngredientName: string | null;
}
export interface InvoiceResult {
  vendor: string | null;
  vendorPhone: string | null;
  vendorEmail: string | null;
  vendorAddress: string | null;
  matchedSupplierId: string | null;
  matchedSupplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: InvoiceLine[];
  matchedCount: number;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  computedTotal: number;
  totalsMatch: boolean | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (inv: InvoiceResult) => void;
}

/**
 * Photograph a supplier invoice → /api/invoices/extract reads the vendor, invoice
 * number, and every line item with cost → review → apply to fill the whole PO.
 */
export function InvoiceScanDialog({ open, onClose, onApply }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceResult | null>(null);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch {
      setCameraError("Camera access denied. Allow camera permissions and retry.");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (open) { setCaptured(null); setResult(null); setError(null); startCamera(); }
    else stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function captureAndExtract() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current, canvas = canvasRef.current;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9); // high quality — invoices have small print
    setCaptured(dataUrl);
    setAnalyzing(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error === "AI not configured" ? "AI scanning isn't configured (no OpenAI key)." : "Couldn't read the invoice. Try a clearer, flatter photo."); return; }
      setResult(data as InvoiceResult);
    } catch {
      setError("Extraction failed or timed out. Try again with a clearer photo.");
    } finally {
      setAnalyzing(false);
    }
  }

  function retake() { setCaptured(null); setResult(null); setError(null); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden flex flex-col sm:max-h-[92vh] max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:max-h-none max-sm:rounded-none max-sm:border-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-amber-500" /> Scan Invoice
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Camera / captured image */}
          {!result && (
            !captured ? (
              <div className="relative rounded-xl overflow-hidden bg-black h-[58vh] sm:h-auto sm:aspect-[4/3]">
                {cameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-4 text-center">
                    <AlertCircle className="h-8 w-8 text-red-400" />
                    <p className="text-sm">{cameraError}</p>
                    <Button size="sm" variant="outline" onClick={startCamera} className="mt-2">Retry</Button>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                    <button
                      onClick={captureAndExtract}
                      aria-label="Capture invoice"
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 h-[72px] w-[72px] rounded-full bg-white ring-4 ring-white/60 border-[5px] border-amber-500 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center shadow-lg"
                    >
                      <Camera className="h-7 w-7 text-amber-600" />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-black h-[34vh] sm:h-auto sm:aspect-[4/3]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={captured} alt="invoice" className="w-full h-full object-contain" />
                {analyzing && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                    <p className="text-sm font-medium">Reading the invoice…</p>
                  </div>
                )}
                {!analyzing && (
                  <button onClick={retake} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white"><X className="h-4 w-4" /></button>
                )}
              </div>
            )
          )}

          <canvas ref={canvasRef} className="hidden" />

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
              <button onClick={retake} className="text-red-400 hover:text-red-600"><RefreshCw className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <p className="text-center text-xs text-gray-400">
            {!captured && "Lay the invoice flat, fill the frame, and tap the shutter. Vera reads the vendor, invoice number, and every line with its cost."}
          </p>

          {/* ── RESULT ── */}
          {result && (
            <div className="space-y-3">
              {/* Vendor */}
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Supplier</p>
                <p className="text-sm font-semibold text-gray-900">
                  {result.matchedSupplierName ?? result.vendor ?? "Not detected"}
                  {result.matchedSupplierName && <span className="ml-2 text-[11px] font-normal text-green-600">matched</span>}
                  {!result.matchedSupplierName && result.vendor && <span className="ml-2 text-[11px] font-normal text-blue-600">new — will be created</span>}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {result.invoiceNumber ? `Invoice #${result.invoiceNumber}` : "No invoice #"}
                  {result.invoiceDate ? ` · ${result.invoiceDate}` : ""}
                </p>
              </div>

              {/* Lines */}
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">{result.lines.length} line item{result.lines.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-gray-400">{result.matchedCount} matched · {result.lines.length - result.matchedCount} new</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
                  {result.lines.map((l, i) => (
                    <div key={i} className="px-3 py-2 flex items-center gap-2 text-sm">
                      {l.matchedIngredientId
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        : <span className="h-3.5 w-3.5 rounded-full bg-blue-100 border border-blue-300 shrink-0" title="will be created" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 truncate">{l.matchedIngredientName ?? l.description}</p>
                        <p className="text-xs text-gray-400">{l.quantity ?? "?"} {l.unit ?? ""} · {l.unitCost != null ? `${formatCurrency(l.unitCost)}/${l.unit ?? "unit"}` : "no cost"}</p>
                      </div>
                      <span className="text-xs font-medium text-gray-700 tabular-nums shrink-0">{l.lineTotal != null ? formatCurrency(l.lineTotal) : ""}</span>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invoice total</span>
                  <span className="font-semibold tabular-nums">{result.total != null ? formatCurrency(result.total) : formatCurrency(result.computedTotal)}</span>
                </div>
              </div>

              {result.totalsMatch === false && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Line items sum to {formatCurrency(result.computedTotal)} but the invoice total reads {formatCurrency(result.total ?? 0)} — double-check before submitting.</p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={retake}><Camera className="h-4 w-4" /> Retake</Button>
                <Button className="flex-1" onClick={() => { onApply(result); onClose(); }}>Apply to Purchase Order</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
