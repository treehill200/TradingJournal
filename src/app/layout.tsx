import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Trading Journal",
    template: "%s · Trading Journal",
  },
  description:
    "A private trading journal: daily P&L calendar, TradingView CSV import, statistics, equity curve and journaling.",
  applicationName: "Trading Journal",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05070c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
