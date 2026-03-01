// ============================================
// Admin Layout - Dashboard Layout Wrapper
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import AdminSidebar from "./AdminSidebar";
import { Search } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

const AdminLayout = ({ children, title, subtitle }: AdminLayoutProps) => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar />

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
                    placeholder="Rechercher commerces, clients..."
                    className="pl-9 h-9 bg-muted/50"
                  />
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {/* Notifications */}
                {/* Notifications */}
                <NotificationBell viewAllLink="/admin/notifications" />

                {/* Admin Avatar */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Ouvrir le menu administrateur"
                >
                  <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-destructive">SA</span>
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

export default AdminLayout;
