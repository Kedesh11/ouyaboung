"use client";

import { ReactNode, useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import FarmerSidebar from "@/components/farmer/FarmerSidebar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAuthUser, getMyFarmerProfile } from "@/services";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getFarmerTypeName } from "@/services/farmer.service";

export default function FarmerDashboardLayout({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<{
        farmName: string;
        farmerType: string;
        id: string;
    } | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const { data: userData } = await getAuthUser();
                if (userData?.user) {
                    const { data: farmerData } = await getMyFarmerProfile(userData.user.id);
                    if (farmerData) {
                        setProfile({
                            farmName: farmerData.farm_name,
                            farmerType: getFarmerTypeName(farmerData.farmer_type),
                            id: farmerData.id,
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to load farmer profile", e);
            }
        };
        loadProfile();
    }, []);

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full">
                <FarmerSidebar
                    farmName={profile?.farmName || "Mon Exploitation"}
                    farmerType={profile?.farmerType || "Agriculture"}
                    farmerId={profile?.id}
                />

                <SidebarInset className="flex-1">
                    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                        <div className="flex h-14 items-center gap-4 px-4">
                            <SidebarTrigger className="-ml-1" />

                            <div className="flex-1 max-w-md">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Rechercher dans votre catalogue..."
                                        className="pl-9 h-9 bg-muted/50"
                                    />
                                </div>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                                <NotificationBell />

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full"
                                    aria-label="Ouvrir le profil agriculteur"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                            {profile ? profile.farmName.charAt(0).toUpperCase() : "A"}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 p-4 md:p-6">
                        {children}
                    </main>
                </SidebarInset>
            </div>
        </SidebarProvider>
    );
}
