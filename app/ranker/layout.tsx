import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Oswald, Source_Serif_4 } from "next/font/google";

import "./ranker.css";

const gothic = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--hot100-gothic",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--hot100-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hot 100 Ranker — Retroverse",
  description:
    "Weight peak, weeks at number one, and longevity, then compare a Hot 100 year-end list with Billboard.",
  applicationName: "Hot 100 Ranker",
  manifest: "/ranker.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Ranker",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/ranker-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/ranker-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/ranker-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a120b",
  width: "device-width",
  initialScale: 1,
};

export default function RankerLayout({ children }: { children: ReactNode }) {
  return <div className={`${gothic.variable} ${serif.variable} ranker-root`}>{children}</div>;
}
