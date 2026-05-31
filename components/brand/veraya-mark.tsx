/**
 * Veraya brand mark — a two-tone "V" (teal blade + warm-gold blade).
 * Self-colored so it reads on both light and dark surfaces. Drop-in replacement
 * for the old ChefHat logo. If a final logo SVG is provided later, swap the
 * paths here and every usage updates.
 */
export function VerayaMark({
  className,
  teal = "#00BFA6",
  gold = "#FFB703",
}: {
  className?: string;
  teal?: string;
  gold?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Veraya"
    >
      {/* left blade (teal) */}
      <path
        d="M4 5 L15 26 L18.2 19.9 L9.7 5 Z"
        fill={teal}
      />
      {/* right blade (warm gold) */}
      <path
        d="M28 5 L21.6 5 L13.6 21.4 L16.6 27 Z"
        fill={gold}
      />
    </svg>
  );
}
