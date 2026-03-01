// ============================================
// Merchant Layout - Dashboard Layout Wrapper
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { ReactNode } from "react";
import Link from "next/link";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import MerchantSidebar from "./MerchantSidebar";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { getMyMerchantProfile } from "@/services/merchant.service";
import { getUnreadCount } from "@/services/notification.service";
import { useState, useEffect } from "react";
import type { Merchant } from "@/types";

interface MerchantLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const MerchantLayout = ({ children, title, subtitle }: MerchantLayoutProps) => {
  const { user } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    // Load Merchant Profile
    const profileRes = await getMyMerchantProfile(user.id);
    if (profileRes.success && profileRes.data) {
      setMerchant(profileRes.data);
    }

    // Load Notifications Count
    const countRes = await getUnreadCount(user.id);
    if (countRes.success) {
      setUnreadCount(countRes.data);
    }
  };

  const merchantInitials = merchant?.business_name
    ? merchant.business_name.substring(0, 2).toUpperCase()
    : "MC";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <MerchantSidebar merchantName={merchant?.business_name} merchantType={merchant?.business_type} />

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
                    placeholder="Rechercher..."
                    className="pl-9 h-9 bg-muted/50"
                  />
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Link href="/merchant/notifications">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label={`Notifications commerçant${unreadCount > 0 ? `, ${unreadCount} non lues` : ""}`}
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>
                </Link>

                {/* User Avatar */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Ouvrir le profil commerçant"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">{merchantInitials}</span>
                  </div>
                </Button>
              </div>
            </div>

            {/* Page Title */}
            {title && (
              <div className="px-4 py-3 border-t border-border/50">
                <h1 className="text-xl font-semibold text-foreground">{title}</h1>
                {subtitle && (
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            )}
          </header>

          {/* Main Content */}
          <main className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default MerchantLayout;
