"use client";

import React, { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import UserSidebar from "../../_components/UserSidebar";
import NotificationBell from "../../_components/NotificationBell";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "../../_components/UserMenu";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAuthUser } from "@/services/auth.service";

export default function UserDashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [user, setUser] = useState<{
        firstName: string;
        lastName: string;
        avatarUrl: string;
    } | null>(null);

    useEffect(() => {
        let isMounted = true;

        const loadUser = async () => {
            try {
                const { data } = await getAuthUser();
                if (isMounted && data?.user) {
                    const metadata = data.user.user_metadata || {};
                    const fullName = metadata.full_name || "";
                    const [firstName = "U", lastName = ""] = fullName.split(" ");

                    setUser({
                        firstName,
                        lastName,
                        avatarUrl: metadata.avatar_url || "",
                    });
                }
            } catch (e: any) {
                // Ignore AbortError which is expected during cleanup/fast refresh
                if (e?.name === 'AbortError' || e?.message?.includes('aborted')) {
                    return;
                }
                console.error("Failed to load user for layout", e);
            }
        };

        loadUser();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <SidebarProvider>
            <UserSidebar userName={user ? `${user.firstName} ${user.lastName}` : undefined} />

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
                                    placeholder="Rechercher des offres..."
                                    className="pl-9 h-9 bg-muted/50"
                                />
                            </div>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            {/* Notifications */}
                            <NotificationBell />

                            {/* User Avatar */}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                aria-label="Ouvrir le menu utilisateur"
                            >
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={user?.avatarUrl} alt={user?.firstName} className="object-cover" />
                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                        {user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}` : "U"}
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
        </SidebarProvider>
    );
}
