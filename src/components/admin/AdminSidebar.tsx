// ============================================
// Admin Sidebar - Navigation Component
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Store,
  Sprout,
  Users,
  Package,
  ShoppingBag,
  BarChart3,
  Settings,
  Shield,
  Bell,
  LogOut,
  MapPin,
  ClipboardCheck,
} from "lucide-react";
import { logout } from "@/services";
import { useToast } from "@/hooks/use-toast";



const analyticsMenuItems = [
  {
    title: "Statistiques",
    url: "/admin/analytics",
    icon: BarChart3,
  },
  {
    title: "Répartition géo",
    url: "/admin/geo",
    icon: MapPin,
  },
];

const settingsMenuItems = [
  {
    title: "Notifications",
    url: "/admin/notifications",
    icon: Bell,
  },
  {
    title: "Paramètres",
    url: "/admin/settings",
    icon: Settings,
  },
];

const AdminSidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [stats, setStats] = useState({ merchants: 0, validations: 0, farmers: 0, pendingFarmers: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { adminService } = await import("@/services/admin.service");
        const [kpis, farmers, pendingFarmers] = await Promise.all([
          adminService.getKPIs(),
          adminService.getFarmers(),
          adminService.getFarmers('pending'),
        ]);
        setStats({
          merchants: kpis.totalMerchants,
          validations: kpis.pendingMerchants + pendingFarmers.length,
          farmers: farmers.length,
          pendingFarmers: pendingFarmers.length,
        });
      } catch (error) {
        console.error("Error fetching sidebar stats:", error);
      }
    };
    fetchStats();
  }, []);

  const getMainMenuItems = () => [
    {
      title: "Tableau de bord",
      url: "/admin",
      icon: LayoutDashboard,
    },
    {
      title: "Commerces",
      url: "/admin/merchants",
      icon: Store,
      badge: stats.merchants,
    },
    {
      title: "Agriculteurs",
      url: "/admin/farmers",
      icon: Sprout,
      badge: stats.farmers,
    },
    {
      title: "Validations",
      url: "/admin/validations",
      icon: ClipboardCheck,
      badge: stats.validations,
    },
    {
      title: "Clients",
      url: "/admin/clients",
      icon: Users,
    },
    {
      title: "Produits & Paniers",
      url: "/admin/products",
      icon: Package,
    },
    {
      title: "Transactions",
      url: "/admin/transactions",
      icon: ShoppingBag,
    },
  ];

  const isActive = (path: string) => {
    if (path === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(path);
  };

  const handleLogout = async () => {
    const result = await logout();
    if (result.success) {
      toast({
        title: "Déconnexion réussie",
        description: "À bientôt sur ouyaboung !",
      });
      router.push("/auth");
    } else {
      toast({
        title: "Erreur de déconnexion",
        description: result.error?.message || "Une erreur est survenue",
        variant: "destructive",
      });
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-destructive" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground truncate">
                Super Admin
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                ouyaboung Platform
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Gestion</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {getMainMenuItems().map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <Link
                      href={item.url}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </div>
                      {/* Only show badge if > 0 */}
                      {(item.badge !== undefined && item.badge > 0 && !isCollapsed) && (
                        <Badge
                          variant={item.title === "Validations" ? "destructive" : "secondary"}
                          className="ml-auto h-5 px-1.5 text-xs"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Analytics */}
        <SidebarGroup>
          <SidebarGroupLabel>Analyses</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Paramètres</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                  >
                    <Link href={item.url}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenuButton
          onClick={handleLogout}
          tooltip="Déconnexion"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="w-4 h-4" />
          <span>Déconnexion</span>
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AdminSidebar;
