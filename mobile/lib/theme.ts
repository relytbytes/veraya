/**
 * Veraya design system — Teal + Navy + Warm Gold. Shared constants for all screens.
 * Use these for inline styles / StyleSheet values.
 * For layout & spacing, prefer NativeWind className with the custom palette.
 *
 * NOTE: the `gold*` keys are the historical names for the PRIMARY ACCENT slot;
 * their values are now the brand teal (#00BFA6). Renaming the ~425 call sites is
 * deferred — treat `C.gold` as "primary accent". The brand warm gold lives on
 * `C.ember` (#FFB703).
 */

export const C = {
  // Surfaces (cool stone / white)
  void:       "#F2F4F7",   // stone — app background
  surface:    "#FFFFFF",
  surfaceHi:  "#E9EDF2",
  surfaceHov: "#DDE3EA",

  // Borders
  rim:        "#DCE2EA",
  rimBright:  "#C3CCD8",

  // Text (navy / slate)
  pearl:      "#0B1320",   // navy — darkest text & dark surfaces
  mist:       "#475569",   // slate — secondary text
  smoke:      "#8A97A6",   // muted

  // Primary accent — brand teal (keys kept as gold* for call-site compat)
  gold:       "#00BFA6",
  goldBright: "#1DD3B8",
  goldDim:    "#009482",
  goldMuted:  "#E0F7F3",

  // Semantic
  jade:       "#1E7A45",
  coral:      "#D44030",
  sky:        "#2E6EB0",
  ember:      "#FFB703",   // warm gold — brand accent & warnings
} as const;

/** Translucent tints — use for badge/tag backgrounds */
export const T = {
  gold:  "rgba(0,191,166,0.10)",
  jade:  "rgba(30,122,69,0.10)",
  coral: "rgba(212,64,48,0.10)",
  sky:   "rgba(46,110,176,0.10)",
  ember: "rgba(255,183,3,0.12)",
  mist:  "rgba(71,85,105,0.08)",
} as const;

/** Common reusable shadow (iOS) + elevation (Android) */
export const shadow = {
  sm: {
    shadowColor: "#0B1320",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: "#0B1320",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  gold: {
    shadowColor: "#00BFA6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

/** Role → accent color mapping */
export const roleColor: Record<string, string> = {
  ADMIN:   C.coral,
  MANAGER: C.sky,
  SERVER:  C.jade,
  KITCHEN: C.ember,
  CASHIER: C.gold,
};

export const roleBg: Record<string, string> = {
  ADMIN:   T.coral,
  MANAGER: T.sky,
  SERVER:  T.jade,
  KITCHEN: T.ember,
  CASHIER: T.gold,
};
