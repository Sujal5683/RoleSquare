import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#1a1a2e" },
  ],
};

export const metadata: Metadata = {
  title: "RoleSquare — AI-Native Google Workspace SaaS",
  description:
    "Turn Gmail, Drive, Docs, Sheets & Forms content into structured, governed, evidence-backed datasets through an asynchronous AI extraction pipeline.",
  keywords: [
    "RoleSquare",
    "AI extraction",
    "Gmail automation",
    "Drive ingestion",
    "structured datasets",
    "evidence-backed AI",
    "multi-tenant SaaS",
  ],
  authors: [{ name: "RoleSquare" }],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "RoleSquare",
  },
  openGraph: {
    title: "RoleSquare",
    description:
      "Convert Google Workspace content into structured, queryable, evidence-backed datasets.",
    siteName: "RoleSquare",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA: register service worker */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .catch(function(err) { console.warn('[SW] Registration failed:', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-[100dvh]`}
      >
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
