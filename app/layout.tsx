import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Veraya",
  description: "Veraya — Restaurant Intelligence Platform",
  manifest: "/manifest.webmanifest",
  // app/icon.png and app/apple-icon.png are picked up automatically by Next.
  appleWebApp: { capable: true, title: "Veraya", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0C1A1E",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
