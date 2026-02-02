"use client";

import React, { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import AdminSidebar from "../../_components/AdminSidebar";
import NotificationBell from "../../_components/NotificationBell";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { getAuthUser } from "@/services";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data } = await getAuthUser();
        if (data?.user) {
          setUser(data.user);
        }
      } catch (e) {
        console.error("Failed to load user", e);
      }
    }
    loadUser();
  }, []);

  // Safe defaults
  const displayName = user?.user_metadata?.full_name || "Administrateur";
  const displayEmail = user?.email || "";
  const displayImage = user?.user_metadata?.avatar_url || "";

  return (
    <SidebarProvider>
      <AdminSidebar 
        userName={displayName} 
        userEmail={displayEmail}
        userImage={displayImage}
      />
      <SidebarInset>
        {/* Admin Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 bg-background sticky top-0 z-10">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          
          <div className="flex-1 flex items-center justify-between">
            <h1 className="font-semibold text-lg hidden md:block">Administration</h1>
            
            <div className="flex items-center gap-2 md:gap-4 ml-auto">
                {/* Search Bar (Optional for Admin) */}
                <div className="relative hidden md:block w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder="Rechercher..."
                        className="pl-8 h-9 bg-muted/50 border-none"
                    />
                </div>

                <NotificationBell />
                
                <Avatar className="h-8 w-8 md:hidden">
                    <AvatarImage src={displayImage} />
                    <AvatarFallback>AD</AvatarFallback>
                </Avatar>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <div className="flex flex-1 flex-col p-4 md:p-6 lg:p-8">
            {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
