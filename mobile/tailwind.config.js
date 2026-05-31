/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ──────────────────────────────────────────────────────────
        void:       "#F7F3F0",   // main app background (warm white)
        surface:    "#FFFFFF",   // card / panel background
        surfaceHi:  "#F0E8E2",   // elevated card, input background
        surfaceHov: "#E8DDD6",   // hover / pressed state

        // ── Borders ───────────────────────────────────────────────────────────
        rim:       "#E2D4CC",   // standard border
        rimBright: "#CCBAB0",   // more visible border

        // ── Text ──────────────────────────────────────────────────────────────
        pearl:  "#1C1210",   // primary text (dark)
        mist:   "#6B5248",   // secondary text
        smoke:  "#A89080",   // muted / disabled text

        // ── Terracotta accent ─────────────────────────────────────────────────
        gold: {
          DEFAULT: "#A8401C",
          bright:  "#C24E28",
          dim:     "#883214",
          muted:   "#FFF0EC",
        },

        // ── Semantic ──────────────────────────────────────────────────────────
        jade:  "#1E7A45",   // success / green
        coral: "#D44030",   // danger / red
        sky:   "#2E6EB0",   // info / link
        ember: "#D07020",   // warning
      },
    },
  },
};
