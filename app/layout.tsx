import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import InteractionFeedback from "@/components/InteractionFeedback";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Käpylä Maanantai Barbell Club",
  description: "Member portal — schedule, results, PBs and leaderboards.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    // Translucent status bar; header pads with safe-area-inset-top.
    statusBarStyle: "black-translucent",
    title: "KMBC",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${anton.variable} ${inter.variable}`}>
      <body className="font-sans antialiased min-h-dvh">
        {children}
        <InteractionFeedback />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
