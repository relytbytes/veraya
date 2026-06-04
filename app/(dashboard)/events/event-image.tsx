"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, Loader2, X } from "lucide-react";

// Downscale a chosen image to a compact JPEG data URL (no upload infra needed).
async function compress(file: File, maxW = 1600, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function EventImagePicker({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try { onChange(await compress(file)); } catch { /* ignore */ } finally { setBusy(false); }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">Hero image</label>
      {value ? (
        <div className="relative w-full overflow-hidden rounded-lg border border-gray-200" style={{ aspectRatio: "16 / 7" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Event hero" className="h-full w-full object-cover" />
          <button onClick={() => onChange(null)} className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full rounded-lg border border-dashed border-gray-300 py-8 flex flex-col items-center gap-2 text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
          style={{ aspectRatio: "16 / 7" }}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
          <span className="text-xs font-medium">{busy ? "Processing…" : "Upload a hero image"}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {value && (
        <Button variant="ghost" size="sm" className="mt-1.5 text-xs" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Processing…" : "Replace image"}
        </Button>
      )}
    </div>
  );
}
