"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { VeraMark } from "@/components/brand/vera-mark";

/**
 * Vera's avatar — renders the face mark from /public/vera-avatar.png, and falls
 * back to the geometric VeraMark if the image isn't present. Drop a square image
 * at public/vera-avatar.png and it shows everywhere automatically.
 *
 * `className` sizes the badge (square). The image is object-cover, anchored left
 * so the profile stays in frame when cropped to a square.
 */
export function VeraAvatar({
  className,
  src = "/vera-avatar.png",
  fit = "cover",
  background = false,
}: {
  className?: string;
  src?: string;
  fit?: "cover" | "contain";
  /** Wrap the mark in a white rounded "chip" so it reads clearly on dark/colored backgrounds. */
  background?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const inner = failed ? (
    <VeraMark className={background ? "h-full w-full" : className} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Vera"
      onError={() => setFailed(true)}
      className={cn(
        background ? "h-full w-full rounded-lg" : "rounded-xl",
        fit === "contain" ? "object-contain" : "object-cover object-left",
        background ? undefined : className,
      )}
    />
  );
  if (!background) return inner;
  return (
    <div className={cn("inline-flex items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5", className)}>
      {inner}
    </div>
  );
}
