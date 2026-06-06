"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Camera, ScanBarcode, Sparkles, Loader2, CheckCircle2, AlertCircle,
  RefreshCw, X, Globe, Plus,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

export interface ScannedIngredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  barcode?: string | null;
  supplier?: { name: string } | null;
  inventoryItem?: { quantity: number; minThreshold: number } | null;
}

interface ExternalProduct {
  name: string;
  brand: string | null;
  category: string | null;
  quantity: string | null;
  imageUrl: string | null;
}

interface BarcodeLookupResult {
  barcode: string;
  local: ScannedIngredient | null;
  external: ExternalProduct | null;
  suggestions?: ScannedIngredient[];
}

interface VisionResult {
  identified: {
    name: string;
    brand: string | null;
    type: string;
    searchTerms: string[];
    confidence: string;
  };
  matches: ScannedIngredient[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (ingredient: ScannedIngredient) => void;
  /** Called when user wants to create a new ingredient pre-filled from external data */
  onCreateFromExternal?: (data: { name: string; barcode: string }) => void;
  /** If true, show an "Add to Inventory" button instead of "Select" */
  mode?: "select" | "inventory";
}

type ScanTab = "barcode" | "photo";

export function ScanDialog({ open, onClose, onSelect, onCreateFromExternal, mode = "select" }: Props) {
  // AI photo is the primary, more reliable path; barcode is the secondary tab.
  const [tab, setTab] = useState<ScanTab>("photo");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<{ stop: () => void } | null>(null);
  const autoSelectedRef = useRef(false); // prevent double auto-select

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<BarcodeLookupResult | null>(null);
  const [visionResult, setVisionResult] = useState<VisionResult | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError("Camera access denied. Please allow camera permissions.");
      console.error(err);
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Start barcode scanning using @zxing/browser
  const startBarcodeScanning = useCallback(async () => {
    if (!videoRef.current) return;
    setScanning(true);
    setLookupResult(null);
    autoSelectedRef.current = false;

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();

      // decodeFromVideoElement returns Promise<IScannerControls> — store it so
      // the stop function can call ctrl.stop() to actually terminate the decode loop.
      const controlsPromise = reader.decodeFromVideoElement(videoRef.current, async (result, err) => {
        if (err) return; // NotFoundException fires every frame — ignore
        if (result && !autoSelectedRef.current) {
          autoSelectedRef.current = true;
          const text = result.getText();
          setScanning(false);
          setLookingUp(true);

          // Use the enriched lookup endpoint (local DB + Open Food Facts fallback)
          try {
            const res = await fetch(`/api/barcode-lookup?barcode=${encodeURIComponent(text)}`);
            const data: BarcodeLookupResult = await res.json();
            setLookingUp(false);

            if (data.local) {
              // Auto-select immediately — no button press needed
              onSelect(data.local);
              onClose();
            } else {
              // Not in local DB — show external result for user to act on
              setLookupResult(data);
            }
          } catch {
            setLookingUp(false);
            autoSelectedRef.current = false;
            setScanning(true);
          }
        }
      });
      controlsPromise.catch(() => {}); // suppress unhandled rejection

      scannerRef.current = {
        stop: () => {
          controlsPromise.then((ctrl) => ctrl.stop()).catch(() => {});
        },
      };
    } catch (err) {
      console.error("Barcode scanner error:", err);
      setScanning(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture photo and send to vision API
  async function captureAndAnalyze() {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(dataUrl);
    setAnalyzing(true);
    setVisionResult(null);
    setVisionError(null);

    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
        signal: AbortSignal.timeout(30_000), // 30s hard timeout
      });

      if (res.status === 503) {
        setNoApiKey(true);
        return;
      }

      // Parse body regardless of status — our route now always returns JSON
      let payload: { error?: string; identified?: VisionResult["identified"]; matches?: VisionResult["matches"] };
      try {
        payload = await res.json();
      } catch {
        setVisionError(`Server error ${res.status} — check server logs`);
        return;
      }

      if (!res.ok || payload.error) {
        setVisionError(payload.error ?? `Error ${res.status}`);
        return;
      }

      const data = payload as VisionResult;

      // Guard against malformed response
      if (!data.identified || !Array.isArray(data.matches)) {
        setVisionError("Unexpected response from vision API");
        return;
      }

      // Auto-select ONLY when the single match is clearly the SAME specific product
      // — i.e. the producer/brand appears in the inventory item's name. Otherwise a
      // scan of "Ken Wright Cellars Pinot Noir" would silently collapse into a
      // generic "Pinot Noir" already in inventory. When it's not a clear match we
      // show the identification and let the user pick an existing item or add new.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const brand = norm(data.identified.brand ?? "");
      const only = data.matches[0];
      const sameProduct =
        data.matches.length === 1 &&
        brand.length >= 4 &&
        norm(only.name).includes(brand.slice(0, Math.min(brand.length, 10)));
      if (sameProduct && data.identified.confidence === "high") {
        onSelect(only);
        onClose();
        return;
      }

      setVisionResult(data);
    } catch (err) {
      setVisionError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setAnalyzing(false); // always clears the spinner
    }
  }

  // Lifecycle: open/close
  useEffect(() => {
    if (open) {
      setLookupResult(null);
      setVisionResult(null);
      setCapturedImage(null);
      setNoApiKey(false);
      autoSelectedRef.current = false;
      startCamera().then(() => {
        if (tab === "barcode") startBarcodeScanning();
      });
    } else {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When tab changes, reset and re-init scanning if needed
  useEffect(() => {
    if (!open) return;
    setLookupResult(null);
    setVisionResult(null);
    setCapturedImage(null);
    setScanning(false);
    setLookingUp(false);
    autoSelectedRef.current = false;
    scannerRef.current?.stop();
    scannerRef.current = null;
    if (tab === "barcode") startBarcodeScanning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function reset() {
    setLookupResult(null);
    setVisionResult(null);
    setVisionError(null);
    setCapturedImage(null);
    setNoApiKey(false);
    setScanning(false);
    setLookingUp(false);
    autoSelectedRef.current = false;
    scannerRef.current?.stop();
    scannerRef.current = null;
    if (tab === "barcode") startBarcodeScanning();
  }

  function handleSelect(ing: ScannedIngredient) {
    onSelect(ing);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 overflow-hidden flex flex-col sm:max-h-[92vh] max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:max-h-none max-sm:rounded-none max-sm:border-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-amber-500" />
            Scan Item
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5 mt-3">
          {([
            ["barcode", "Barcode", <ScanBarcode key="b" className="h-3.5 w-3.5" />],
            ["photo", "Photo AI", <Sparkles key="p" className="h-3.5 w-3.5" />],
          ] as [ScanTab, string, React.ReactNode][]).map(([t, label, icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "pb-2.5 mr-5 text-sm font-medium border-b-2 flex items-center gap-1.5 transition-colors",
                tab === t ? "border-amber-500 text-amber-600" : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Camera / captured image — shrink once a result is showing so it fits */}
          {!capturedImage ? (
            <div className={cn(
              "relative rounded-xl overflow-hidden bg-black sm:h-auto sm:aspect-[3/4] sm:max-h-[58vh]",
              lookupResult ? "h-[32vh]" : "h-[60vh]",
            )}>
              {cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
                  <AlertCircle className="h-8 w-8 text-red-400" />
                  <p className="text-sm text-center px-4">{cameraError}</p>
                  <Button size="sm" variant="outline" onClick={startCamera} className="mt-2">Retry</Button>
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

                  {/* Scanning overlay for barcode */}
                  {tab === "barcode" && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-3/4 h-1/3 border-2 border-amber-400 rounded-lg opacity-70">
                        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-amber-400 animate-pulse" />
                      </div>
                    </div>
                  )}

                  {/* Looking-up overlay */}
                  {lookingUp && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
                      <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                      <p className="text-sm font-medium">Looking up barcode…</p>
                    </div>
                  )}

                  {/* Photo capture button — large, obvious shutter */}
                  {tab === "photo" && (
                    <button
                      onClick={captureAndAnalyze}
                      aria-label="Capture and identify"
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 h-[72px] w-[72px] rounded-full bg-white ring-4 ring-white/60 border-[5px] border-amber-500 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center shadow-lg"
                    >
                      <Camera className="h-7 w-7 text-amber-600" />
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className={cn(
              "relative rounded-xl overflow-hidden bg-black sm:h-auto sm:aspect-[3/4] sm:max-h-[58vh]",
              visionResult ? "h-[28vh]" : "h-[58vh]",
            )}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedImage} alt="captured" className="w-full h-full object-contain" />
              {analyzing && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 text-white">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                  <p className="text-sm font-medium">Analyzing with AI…</p>
                </div>
              )}
              <button
                onClick={reset}
                className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* No API key warning */}
          {noApiKey && (
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800">
              <strong>OpenAI API key not configured.</strong> Add your key to <code className="text-xs bg-warning-100 px-1 rounded">.env</code> as <code className="text-xs bg-warning-100 px-1 rounded">OPENAI_API_KEY=sk-...</code> to enable Photo AI.
            </div>
          )}

          {/* Vision error */}
          {visionError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <strong>Analysis failed:</strong> {visionError}
              </div>
              <button onClick={reset} className="text-red-400 hover:text-red-600 shrink-0">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* ── BARCODE RESULTS ── */}
          {tab === "barcode" && (
            <div>
              {scanning && !lookupResult && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning… point the camera at a barcode
                </div>
              )}

              {lookupResult && (
                <div className="space-y-3">
                  {/* Barcode badge + reset */}
                  <div className="flex items-center gap-2 text-sm">
                    <ScanBarcode className="h-4 w-4 text-amber-500" />
                    <code className="font-mono text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">{lookupResult.barcode}</code>
                    <button onClick={reset} className="ml-auto text-gray-400 hover:text-gray-600">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* External product info */}
                  {lookupResult.external && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 space-y-1">
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">
                            {lookupResult.external.brand && (
                              <span className="text-gray-500 font-normal">{lookupResult.external.brand} — </span>
                            )}
                            {lookupResult.external.name}
                          </p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {lookupResult.external.category && (
                              <Badge variant="secondary" className="text-xs capitalize">{lookupResult.external.category}</Badge>
                            )}
                            {lookupResult.external.quantity && (
                              <Badge variant="secondary" className="text-xs">{lookupResult.external.quantity}</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Create ingredient pre-filled with external data */}
                      {onCreateFromExternal && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => {
                            onCreateFromExternal({
                              name: lookupResult.external!.name,
                              barcode: lookupResult.barcode,
                            });
                            onClose();
                          }}
                        >
                          <Plus className="h-3 w-3" /> Create &quot;{lookupResult.external.name}&quot; as new ingredient
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Local DB suggestions that might match external product */}
                  {lookupResult.suggestions && lookupResult.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Possible matches in your inventory
                      </p>
                      {lookupResult.suggestions.map((ing) => (
                        <IngredientCard
                          key={ing.id}
                          ingredient={ing}
                          label={mode === "inventory" ? "Add to Inventory" : "Select"}
                          onSelect={handleSelect}
                        />
                      ))}
                    </div>
                  )}

                  {/* Nothing found anywhere */}
                  {!lookupResult.external && (!lookupResult.suggestions || lookupResult.suggestions.length === 0) && (
                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                      <AlertCircle className="h-5 w-5 mx-auto mb-1 text-gray-400" />
                      Barcode <strong>{lookupResult.barcode}</strong> isn&apos;t in any public database — common for wine &amp; spirits.
                      <Button size="sm" className="w-full mt-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white" onClick={() => setTab("photo")}>
                        <Sparkles className="h-3.5 w-3.5" /> Identify it with Photo AI instead
                      </Button>
                      {onCreateFromExternal && (
                        <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => { onCreateFromExternal({ name: "", barcode: lookupResult.barcode }); onClose(); }}>
                          <Plus className="h-3.5 w-3.5" /> Add manually with this barcode
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── VISION RESULTS ── */}
          {tab === "photo" && visionResult && (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-start gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {visionResult.identified.brand && `${visionResult.identified.brand} — `}
                      {visionResult.identified.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{visionResult.identified.type}</p>
                  </div>
                  <Badge
                    variant={visionResult.identified.confidence === "high" ? "success" : visionResult.identified.confidence === "medium" ? "warning" : "secondary"}
                    className="ml-auto shrink-0 text-xs"
                  >
                    {visionResult.identified.confidence}
                  </Badge>
                </div>
              </div>

              {visionResult.matches.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Already in your inventory?</p>
                  {visionResult.matches.map((ing) => (
                    <IngredientCard
                      key={ing.id}
                      ingredient={ing}
                      label={mode === "inventory" ? "Add Stock" : "Use this"}
                      onSelect={handleSelect}
                    />
                  ))}
                  {/* None of these is the right one → add the scanned item as new */}
                  {onCreateFromExternal && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => { onCreateFromExternal({ name: visionResult.identified.name, barcode: "" }); onClose(); }}
                    >
                      <Plus className="h-3.5 w-3.5" /> None of these — add &quot;{visionResult.identified.name}&quot; as new
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4 text-center text-sm text-gray-600">
                  <p>Not in your inventory yet:</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{visionResult.identified.name}</p>
                  {onCreateFromExternal && (
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => {
                        onCreateFromExternal({ name: visionResult.identified.name, barcode: "" });
                        onClose();
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add &quot;{visionResult.identified.name}&quot; as new item
                    </Button>
                  )}
                </div>
              )}

              <Button variant="outline" size="sm" onClick={reset} className="w-full">
                <Camera className="h-3.5 w-3.5" /> Scan Another
              </Button>
            </div>
          )}

          {/* Photo tab idle state */}
          {tab === "photo" && !capturedImage && !visionResult && (
            <p className="text-center text-xs text-gray-400">
              Point the camera at a product label, case, or bottle and press the shutter button
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IngredientCard({
  ingredient, label, onSelect,
}: {
  ingredient: ScannedIngredient;
  label: string;
  onSelect: (ing: ScannedIngredient) => void;
}) {
  const stock = ingredient.inventoryItem?.quantity ?? 0;
  const min = ingredient.inventoryItem?.minThreshold ?? 0;
  const isLow = stock <= min;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-amber-300 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="font-medium text-sm text-gray-900 truncate">{ingredient.name}</p>
          {isLow && <Badge variant="destructive" className="text-xs shrink-0">Low stock</Badge>}
        </div>
        <p className="text-xs text-gray-400 ml-6 mt-0.5">
          {formatCurrency(Number(ingredient.costPerUnit))} / {ingredient.unit}
          {ingredient.supplier ? ` · ${ingredient.supplier.name}` : ""}
          {ingredient.inventoryItem && ` · ${Number(stock)} in stock`}
        </p>
      </div>
      <Button size="sm" onClick={() => onSelect(ingredient)} className="shrink-0 text-xs">
        {label}
      </Button>
    </div>
  );
}

// Needed for JSX tab array
import React from "react";
