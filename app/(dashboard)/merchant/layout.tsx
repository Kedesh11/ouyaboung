"use client";

import { ReactNode, useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import MerchantSidebar from "@/components/merchant/MerchantSidebar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthUser, getMyMerchantProfile } from "@/services";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function MerchantDashboardLayout({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<{
        businessName: string;
        businessType: string;
        id: string; // Added ID
        logoUrl?: string; // If available in future
    } | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const { data: userData } = await getAuthUser();
                if (userData?.user) {
                    const { data: merchantData } = await getMyMerchantProfile(userData.user.id);
                    if (merchantData) {
                        setProfile({
                            businessName: merchantData.business_name,
                            businessType: merchantData.business_type,
                            id: merchantData.id,
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to load merchant profile", e);
            }
        };
        loadProfile();
    }, []);

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full">
                <MerchantSidebar
                    merchantName={profile?.businessName || "Mon Commerce"}
                    merchantType={profile?.businessType || "Commerce"}
                    merchantId={profile?.id}
                />

                <SidebarInset className="flex-1">
                    {/* Top Header */}
                    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                        <div className="flex h-14 items-center gap-4 px-4">
                            <SidebarTrigger className="-ml-1" />

                            {/* Search */}
                            <div className="flex-1 max-w-md">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher dans votre inventaire..."
                                        className="pl-9 h-9 bg-muted/50"
                                    />
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                                {/* Notifications */}
                                <NotificationBell />

                                {/* Profile Placeholder */}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full"
                                    aria-label="Ouvrir le profil commerçant"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                            {profile ? profile.businessName.charAt(0).toUpperCase() : "M"}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </div>
                        </div>
                    </header>

                    {/* Main Content */}
                    <main className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
