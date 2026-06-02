/**
 * Vera mark — the intelligence layer's identity. A navy "lens" coin with a
 * watchful aperture ring, a bold teal gradient V, and a warm-gold sparkle.
 * Reads as the intelligence that's always watching, not a chat widget.
 *
 * `className` sizes the whole badge (it's a square SVG).
 */
export function VeraMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="Vera">
      <defs>
        <linearGradient id="veraCoin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#11302C" />
          <stop offset="1" stopColor="#0C1A1E" />
        </linearGradient>
        <linearGradient id="veraBlade" x1="12" y1="13" x2="34" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34C2AC" />
          <stop offset="1" stopColor="#1A8174" />
        </linearGradient>
      </defs>
      {/* coin + rim */}
      <circle cx="24" cy="24" r="23" fill="url(#veraCoin)" />
      <circle cx="24" cy="24" r="22.4" fill="none" stroke="#244A44" strokeWidth="1" />
      {/* aperture ring — "always watching" */}
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="url(#veraBlade)" strokeWidth="1.6" opacity="0.4" />
      {/* bold V blade */}
      <path d="M12 14 L17 14 L24 27 L31 14 L36 14 L24 35 Z" fill="url(#veraBlade)" />
      {/* sparkle */}
      <path d="M35.5 8 L37 12 L41 13.5 L37 15 L35.5 19 L34 15 L30 13.5 L34 12 Z" fill="#E0A82E" />
      <circle cx="30.5" cy="20.5" r="1" fill="#F0C66A" />
    </svg>
  );
}

/**
 * Vera's gold sparkle — drop it next to any "Vera" mention to brand the action.
 */
export function VeraSpark({ className = "h-3 w-3", color = "#E0A82E" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path d="M8 1 L9.2 5.2 L13 6.4 L9.2 7.6 L8 11.8 L6.8 7.6 L3 6.4 L6.8 5.2 Z" fill={color} />
    </svg>
  );
}

/**
 * "Vera" wordmark + sparkle, for inline headers. Pairs with VeraMark.
 */
export function VeraWordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      Vera
      <VeraSpark />
    </span>
  );
}
