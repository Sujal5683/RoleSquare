import type { Metadata } from "next";
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
  icons: {
    icon: "/Logo.svg",
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
