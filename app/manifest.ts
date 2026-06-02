import type { MetadataRoute } from "next";

// PWA manifest — installable Veraya with branded icons + brand colors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veraya",
    short_name: "Veraya",
    description: "Veraya — Restaurant Intelligence Platform",
    start_url: "/",
    display: "standalone",
    background_color: "#0C1A1E",
    theme_color: "#0C1A1E",
    icons: [
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
