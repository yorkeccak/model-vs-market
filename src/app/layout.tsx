import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "@/lib/site";
import "./globals.css";

// Self-hosted variable Google Sans Flex (wght, opsz, ROND) so next/font can derive fallback metrics.
const sans = localFont({ src: "./fonts/GoogleSansFlex-latin.woff2", variable: "--font-sans", weight: "1 1000", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI forecasting",
    "prediction markets",
    "Polymarket",
    "Kalshi",
    "OpenAI Decisions API",
    "TypeSafe Jev",
    "Cloudflare Clef",
    "decision models",
    "AI vs market",
    "Valyu",
  ],
  authors: [{ name: "Valyu", url: "https://valyu.ai" }],
  creator: "Valyu",
  publisher: "Valyu",
  category: "technology",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "OpenAI, TypeSafe and Cloudflare's decision models read the news, never the odds. See where they disagree with real money.",
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export const viewport: Viewport = { themeColor: "#0c0c0d", colorScheme: "dark" };

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Valyu", url: "https://valyu.ai" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={sans.variable}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
