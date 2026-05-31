/**
 * White + Terracotta + Green design system — shared constants for all screens.
 * Use these for inline styles / StyleSheet values.
 * For layout & spacing, prefer NativeWind className with the custom palette.
 */

export const C = {
  // Surfaces
  void:       "#F7F3F0",
  surface:    "#FFFFFF",
  surfaceHi:  "#F0E8E2",
  surfaceHov: "#E8DDD6",

  // Borders
  rim:        "#E2D4CC",
  rimBright:  "#CCBAB0",

  // Text
  pearl:      "#1C1210",
  mist:       "#6B5248",
  smoke:      "#A89080",

  // Terracotta (primary accent)
  gold:       "#A8401C",
  goldBright: "#C24E28",
  goldDim:    "#883214",
  goldMuted:  "#FFF0EC",

  // Semantic
  jade:       "#1E7A45",
  coral:      "#D44030",
  sky:        "#2E6EB0",
  ember:      "#D07020",
} as const;

/** Translucent tints — use for badge/tag backgrounds */
export const T = {
  gold:  "rgba(200,80,42,0.10)",
  jade:  "rgba(30,122,69,0.10)",
  coral: "rgba(212,64,48,0.10)",
  sky:   "rgba(46,110,176,0.10)",
  ember: "rgba(208,112,32,0.10)",
  mist:  "rgba(107,82,72,0.08)",
} as const;

/** Common reusable shadow (iOS) + elevation (Android) */
export const shadow = {
  sm: {
    shadowColor: "#1C1210",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  md: {
    shadowColor: "#1C1210",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  gold: {
    shadowColor: "#A8401C",
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
