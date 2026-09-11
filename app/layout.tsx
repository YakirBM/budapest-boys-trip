import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Heebo } from "next/font/google";
import { t } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { ServiceWorkerRegistrar } from "@/components/system/ServiceWorkerRegistrar";
import "./globals.css";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-heebo",
  display: "swap",
});

export const metadata: Metadata = {
  title: t("meta.title"),
  description: t("meta.description"),
  manifest: "/manifest.webmanifest",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: t("meta.shortTitle"),
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background font-sans text-text-primary">
        {/* Pre-paint theme bootstrap — static file (no inline HTML per docs/04 §7). */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
