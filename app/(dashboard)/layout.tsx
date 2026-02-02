"use client";

import React from "react";

// This layout now acts as a simple pass-through for the dashboard routes.
// Specific layouts (User vs Merchant) are handled in their respective subdirectories
// to avoid duplicate sidebars/headers.
export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            {children}
        </div>
    );
}
