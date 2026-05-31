"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Parsers ────────────────────────────────────────────────────────────────────

/**
 * Accepts many formats: "1700", "5pm", "5:00pm", "17:00", "930", "9:30 am"
 * Returns "HH:MM" (24-hour) or null if unparseable.
 */
export function parseTimeInput(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  const isPM = s.endsWith("pm");
  const isAM = s.endsWith("am");
  const cleaned = s.replace(/(am|pm)$/, "");

  let hours: number;
  let minutes = 0;

  if (cleaned.includes(":")) {
    const [h, m] = cleaned.split(":");
    hours = parseInt(h, 10);
    minutes = parseInt(m || "0", 10);
  } else if (cleaned.length <= 2) {
    // "5", "17"
    hours = parseInt(cleaned, 10);
  } else if (cleaned.length === 3) {
    // "930" → 9:30
    hours = parseInt(cleaned[0], 10);
    minutes = parseInt(cleaned.slice(1), 10);
  } else if (cleaned.length === 4) {
    // "1700" → 17:00
    hours = parseInt(cleaned.slice(0, 2), 10);
    minutes = parseInt(cleaned.slice(2), 10);
  } else {
    return null;
  }

  if (isNaN(hours) || isNaN(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;
  if (hours < 0 || hours > 23) return null;

  // Apply AM/PM
  if (isPM && hours !== 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  if (hours > 23) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Formats "HH:MM" → "5:00 PM" */
export function formatTo12Hour(hhmm: string): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface TimeInputProps {
  value: string;            // stored as HH:MM (24h)
  onChange: (hhmm: string) => void;
  className?: string;
  placeholder?: string;
}

export function TimeInput({
  value,
  onChange,
  className,
  placeholder = "e.g. 9am or 1700",
}: TimeInputProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");
  const [invalid, setInvalid] = useState(false);

  // While focused, show what the user is typing; otherwise show 12-hour display
  const displayValue = focused ? raw : (value ? formatTo12Hour(value) : "");

  function handleFocus() {
    setFocused(true);
    // Pre-fill with current 12h display so user can see what they're editing
    setRaw(value ? formatTo12Hour(value) : "");
    setInvalid(false);
  }

  function commit() {
    setFocused(false);
    if (!raw.trim()) {
      setInvalid(false);
      return;
    }
    const parsed = parseTimeInput(raw);
    if (parsed) {
      onChange(parsed);
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  }

  return (
    <div className="relative">
      <Input
        value={displayValue}
        onChange={(e) => { setRaw(e.target.value); setInvalid(false); }}
        onFocus={handleFocus}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") commit(); }}
        placeholder={placeholder}
        className={cn(invalid && "border-red-400 focus-visible:ring-red-300", className)}
        autoComplete="off"
      />
      {invalid && (
        <p className="absolute -bottom-4 left-0 text-[10px] text-red-500">
          Try &quot;9am&quot;, &quot;1700&quot;, or &quot;2:30pm&quot;
        </p>
      )}
    </div>
  );
}
