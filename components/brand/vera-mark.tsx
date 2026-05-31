/**
 * Vera mark — the intelligence layer's identity. A navy "coin" with a teal V
 * and a warm-gold sparkle, distinct from the Veraya wordmark mark. Vera is
 * infrastructure, not a chatbot, so this reads as a watchful badge.
 *
 * `className` sizes the whole badge (it's a square SVG).
 */
export function VeraMark({
  className,
  bg = "#0B1320",
  v = "#00BFA6",
  spark = "#FFB703",
}: {
  className?: string;
  bg?: string;
  v?: string;
  spark?: string;
}) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} role="img" aria-label="Vera">
      <circle cx="20" cy="20" r="20" fill={bg} />
      {/* V */}
      <path
        d="M11.5 13 L20 28 L28.5 13"
        stroke={v}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* sparkle */}
      <path
        d="M29.5 7 L30.8 10.2 L34 11.5 L30.8 12.8 L29.5 16 L28.2 12.8 L25 11.5 L28.2 10.2 Z"
        fill={spark}
      />
    </svg>
  );
}

/**
 * Vera's gold sparkle — drop it next to any "Vera" mention to brand the action.
 */
export function VeraSpark({ className = "h-3 w-3", color = "#FFB703" }: { className?: string; color?: string }) {
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
