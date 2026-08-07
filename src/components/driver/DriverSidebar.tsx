// ============================================
// Driver Sidebar - Navigation Component
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
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
  Truck,
  LogOut,
} from "lucide-react";
import { logout } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { useDriverActiveDeliveries } from "@/hooks/useDriverData";

const mainMenuItems = [
  {
    title: "Tableau de bord",
    url: "/driver",
    icon: LayoutDashboard,
    badge: 0,
  },
  {
    title: "Livraisons",
    url: "/driver/deliveries",
    icon: Truck,
    badge: 0,
  },
];

interface DriverSidebarProps {
  driverName?: string;
  vehicleType?: string;
  driverId?: string;
}

const DriverSidebar = ({
  driverName = "Mon Profil",
  vehicleType = "Chauffeur",
  driverId,
}: DriverSidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { data: activeDeliveries } = useDriverActiveDeliveries(driverId);

  const menuItemsWithBadges = mainMenuItems.map(item => {
    if (item.url === "/driver/deliveries") {
      return { ...item, badge: activeDeliveries?.length || 0 };
    }
    return item;
  });

  const isActive = (path: string) => {
    if (path === "/driver") {
      return pathname === "/driver";
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
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Truck className="w-5 h-5 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground truncate">
                {driverName}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {vehicleType}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItemsWithBadges.map((item) => (
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
                      {!!item.badge && !isCollapsed && (
                        <Badge
                          variant="secondary"
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

export default DriverSidebar;
