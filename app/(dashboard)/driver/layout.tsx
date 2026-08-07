"use client";

import { ReactNode, useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import DriverSidebar from "@/components/driver/DriverSidebar";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { getAuthUser, getMyDriverProfile } from "@/services";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getVehicleTypeName } from "@/services/driver.service";

export default function DriverDashboardLayout({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<{
        fullName: string;
        vehicleType: string;
        id: string;
    } | null>(null);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const { data: userData } = await getAuthUser();
                if (userData?.user) {
                    const { data: driverData } = await getMyDriverProfile(userData.user.id);
                    if (driverData) {
                        setProfile({
                            fullName: driverData.full_name,
                            vehicleType: getVehicleTypeName(driverData.vehicle_type),
                            id: driverData.id,
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to load driver profile", e);
            }
        };
        loadProfile();
    }, []);

    return (
        <SidebarProvider>
            <div className="min-h-screen flex w-full">
                <DriverSidebar
                    driverName={profile?.fullName || "Mon Profil"}
                    vehicleType={profile?.vehicleType || "Chauffeur"}
                    driverId={profile?.id}
                />

                <SidebarInset className="flex-1">
                    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                        <div className="flex h-14 items-center gap-4 px-4">
                            <SidebarTrigger className="-ml-1" />

                            <div className="ml-auto flex items-center gap-2">
                                <NotificationBell />

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full"
                                    aria-label="Ouvrir le profil chauffeur"
                                >
                                    <Avatar className="h-8 w-8">
                                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                            {profile ? profile.fullName.charAt(0).toUpperCase() : "C"}
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
