
import React from 'react';
// import { Inter } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthRedirect } from "@/components/auth/AuthRedirect";
import { SystemPushBridge } from "@/components/notifications/SystemPushBridge";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { OfflineSyncManager } from "@/components/pwa/OfflineSyncManager";
import { SkipToContent } from "@/components/seo/AccessibilityHelpers";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";

// const inter = Inter({ subsets: ["latin"] });

export const metadata = {
    title: "Oyaboug - Anti-gaspillage alimentaire",
    description: "Recuperez des invendus de qualite a petit prix pres de chez vous.",
    manifest: "/manifest.json",
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

export const viewport = {
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
        <html lang="fr" suppressHydrationWarning>
            {/* Fallback to standard sans-serif font to avoid build timeout with Google Fonts */}
            <body className={"font-sans antialiased"} suppressHydrationWarning>
                <SkipToContent />
                <WebVitalsReporter />
                <QueryProvider>
                    <AuthProvider>
                        <ThemeProvider
                            attribute="class"
                            defaultTheme="system"
                            enableSystem
                            disableTransitionOnChange
                        >
                            <AuthRedirect />
                            <SystemPushBridge />
                            <TooltipProvider>
                                <OfflineIndicator />
                                <OfflineSyncManager />
                                <InstallPrompt />
                                <main id="main-content">{children}</main>
                                <Toaster />
                                <Sonner />
                            </TooltipProvider>
                        </ThemeProvider>
                    </AuthProvider>
                </QueryProvider>
            </body>
        </html>
    );
}
