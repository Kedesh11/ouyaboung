
import React, { Suspense } from 'react';
import type { Metadata, Viewport } from "next";
// import { Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { TrackingProvider } from "@/contexts/TrackingContext";
import { PageTrackerInit } from "@/components/analytics/PageTrackerInit";
import { SkipToContent } from "@/components/seo/AccessibilityHelpers";
import { DeferredAppEnhancements } from "@/components/app/DeferredAppEnhancements";

// const inter = Inter({ subsets: ["latin"] });

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ouyaboung-eight.vercel.app";
const DEV_SW_RESET_SCRIPT = `
(function () {
  if (typeof window === "undefined") return;
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
  }
  if ("caches" in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {});
  }
})();
`;

export const metadata: Metadata = {
    metadataBase: new URL(APP_BASE_URL),
    title: {
        default: "Ouyaboung - Anti-gaspillage alimentaire",
        template: "%s | Ouyaboung",
    },
    description: "Recuperez des invendus de qualite a petit prix pres de chez vous.",
    applicationName: "Ouyaboung",
    manifest: "/manifest.json",
    alternates: {
        canonical: "/",
    },
    openGraph: {
        type: "website",
        locale: "fr_GA",
        siteName: "Ouyaboung",
        url: APP_BASE_URL,
        title: "Ouyaboung - Anti-gaspillage alimentaire",
        description: "Recuperez des invendus de qualite a petit prix pres de chez vous.",
        images: [
            {
                url: "/icons/icon-512x512.png",
                width: 512,
                height: 512,
                alt: "Ouyaboung",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Ouyaboung - Anti-gaspillage alimentaire",
        description: "Recuperez des invendus de qualite a petit prix pres de chez vous.",
        images: ["/icons/icon-512x512.png"],
    },
    robots: {
        index: true,
        follow: true,
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Ouyaboung",
    },
    icons: {
        icon: "/favicon.svg",
        apple: "/apple-touch-icon.png",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    viewportFit: "cover",
    themeColor: "#3B9B67",
};

import QueryProvider from "@/providers/QueryProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";

// ... existing imports

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fr" data-scroll-behavior="smooth" suppressHydrationWarning>
            {/* Fallback to standard sans-serif font to avoid build timeout with Google Fonts */}
            <body className={"font-sans antialiased"} suppressHydrationWarning>
                {process.env.NODE_ENV === "development" ? (
                    <script dangerouslySetInnerHTML={{ __html: DEV_SW_RESET_SCRIPT }} />
                ) : null}
                <SkipToContent />
                <QueryProvider>
                    <AuthProvider>
                        <TrackingProvider>
                            <ThemeProvider
                                attribute="class"
                                defaultTheme="system"
                                enableSystem
                                disableTransitionOnChange
                            >
                                <DeferredAppEnhancements />
                                <Suspense fallback={null}>
                                    <PageTrackerInit />
                                </Suspense>
                                <TooltipProvider>
                                    <main id="main-content">{children}</main>
                                    <Toaster />
                                    <Sonner />
                                </TooltipProvider>
                            </ThemeProvider>
                        </TrackingProvider>
                    </AuthProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
