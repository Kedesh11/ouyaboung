// ============================================
// Farmer Sidebar - Navigation Component
// ouyaboung Platform - Répertoire des agriculteurs
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Sprout,
  LogOut,
} from "lucide-react";
import { logout } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { useFarmerItems, useFarmerOrders } from "@/hooks/useFarmerData";

const mainMenuItems = [
  {
    title: "Tableau de bord",
    url: "/farmer",
    icon: LayoutDashboard,
    badge: 0,
  },
  {
    title: "Mes produits",
    url: "/farmer/products",
    icon: Package,
    badge: 0,
  },
  {
    title: "Commandes reçues",
    url: "/farmer/orders",
    icon: ShoppingBag,
    badge: 0,
  },
];

const settingsMenuItems = [
  {
    title: "Mon exploitation",
    url: "/farmer/profile",
    icon: Sprout,
  },
];

interface FarmerSidebarProps {
  farmName?: string;
  farmerType?: string;
  farmerId?: string;
}

const FarmerSidebar = ({
  farmName = "Mon Exploitation",
  farmerType = "Agriculture",
  farmerId,
}: FarmerSidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { data: products } = useFarmerItems(farmerId);
  const { data: pendingOrders } = useFarmerOrders(farmerId);

  const menuItemsWithBadges = mainMenuItems.map(item => {
    if (item.url === "/farmer/products") {
      return { ...item, badge: products?.length || 0 };
    }
    if (item.url === "/farmer/orders") {
      return { ...item, badge: pendingOrders?.length || 0 };
    }
    return item;
  });

  const isActive = (path: string) => {
    if (path === "/farmer") {
      return pathname === "/farmer";
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
            <Sprout className="w-5 h-5 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground truncate">
                {farmName}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {farmerType}
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

export default FarmerSidebar;
