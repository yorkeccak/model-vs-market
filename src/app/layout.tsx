import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted variable Google Sans Flex (wght, opsz, ROND) so next/font can derive fallback metrics.
const sans = localFont({ src: "./fonts/GoogleSansFlex-latin.woff2", variable: "--font-sans", weight: "1 1000", display: "swap" });

export const metadata: Metadata = {
  title: "Model vs Market",
  description: "Three AI decision models read today's news through Valyu, never see the odds, and price any question or live Polymarket and Kalshi market.",
};

export const viewport: Viewport = { themeColor: "#0c0c0d", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
