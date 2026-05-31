import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly pin the workspace root to this project directory,
    // preventing Turbopack from scanning /Users/ty/ (which has a stray
    // package-lock.json) and causing multi-minute first compiles.
    root: path.resolve(__dirname),
  },
  experimental: {
    // Next.js 16 enables the Turbopack dev filesystem cache by default.
    // On this project (~80 routes + heavy deps) the cache grew to 3.4 GB and
    // was exhausting RAM on startup. Disable it until the cache size is bounded.
    turbopackFileSystemCacheForDev: false,
    // Avoid preloading every route's JS modules into memory at startup —
    // lazy-load them on first request instead to keep the footprint low.
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
