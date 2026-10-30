import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "M Garage", template: "%s · M Garage" },
  description: "Showroom management for M Garage Used Car Dealer.",
};

// Applies the saved colour theme before first paint so the page never flashes the default.
const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("dealeros-ui")||"{}").state;if(t&&t.theme)document.documentElement.dataset.theme=t.theme}catch(e){}`;

export const viewport: Viewport = {
  themeColor: "#18181b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme is set before paint by the script below, so React shouldn't flag the mismatch.
    <html lang="en-IN" data-theme="graphite" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh font-sans">
        <Script id="theme-init" strategy="beforeInteractive">{THEME_SCRIPT}</Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
