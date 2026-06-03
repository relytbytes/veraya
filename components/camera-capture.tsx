"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, Loader2, ImageUp } from "lucide-react";

/**
 * Reusable live-camera capture with a file-upload fallback. Returns a JPEG data
 * URL via onCapture. Use anywhere the AI photo tool is needed (beverage labels,
 * invoices, inventory, ingredients) so capture behaves the same app-wide.
 *
 * On phones/tablets this opens the rear camera. On desktops without a webcam it
 * automatically falls back to a file picker.
 */
export function CameraCapture({
  onCapture, onCancel, busy = false, hint,
}: {
  onCapture: (dataUrl: string) => void;
  onCancel?: () => void;
  busy?: boolean;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const supportsCamera = typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supportsCamera) { setFallback(true); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        setFallback(true); // no camera / permission denied → file upload
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [stop]);

  function snap() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    stop();
    onCapture(dataUrl);
  }

  function onFile(file: File | null) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => onCapture(fr.result as string);
    fr.readAsDataURL(file);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
      {!fallback ? (
        <div className="relative">
          <video ref={videoRef} playsInline muted className="w-full max-h-72 object-cover bg-black" />
          <canvas ref={canvasRef} className="hidden" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-3 p-3 bg-gradient-to-t from-black/70 to-transparent">
            <Button type="button" size="sm" onClick={snap} disabled={!ready || busy} className="rounded-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Capture
            </Button>
            <button type="button" onClick={() => { stop(); setFallback(true); }} className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1">
              <ImageUp className="h-3.5 w-3.5" /> Upload instead
            </button>
            {onCancel && (
              <button type="button" onClick={() => { stop(); onCancel(); }} className="text-xs text-white/70 hover:text-white inline-flex items-center gap-1">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white p-4 flex flex-col items-center gap-2 text-center">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
          <Camera className="h-6 w-6 text-gray-400" />
          <p className="text-xs text-gray-500">{hint ?? "Take or choose a photo"}</p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />} Choose photo
            </Button>
            {supportsCamera && (
              <button type="button" onClick={() => { setFallback(false); setReady(false); }} className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" /> Try camera
              </button>
            )}
            {onCancel && <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-700">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}
