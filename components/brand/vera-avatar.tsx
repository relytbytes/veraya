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
export function VeraAvatar({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <VeraMark className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/vera-avatar.png"
      alt="Vera"
      onError={() => setFailed(true)}
      className={cn("rounded-xl object-cover object-left", className)}
    />
  );
}
