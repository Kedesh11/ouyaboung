// ============================================
// Merchant Sidebar - Navigation Component
// ouyaboung Platform - Anti-gaspillage alimentaire
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
  BarChart3,
  Settings,
  Leaf,
  Plus,
  Store,
  Sprout,
  Truck,
  Bell,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { logout } from "@/services";
import { useToast } from "@/hooks/use-toast";
import { useMerchantItems, useMerchantActiveOrders } from "@/hooks/useMerchantData";

const mainMenuItems = [
  {
    title: "Tableau de bord",
    url: "/merchant",
    icon: LayoutDashboard,
  },
  {
    title: "Mes produits",
    url: "/merchant/products",
    icon: Package,
    badge: 5,
  },
  {
    title: "Réservations",
    url: "/merchant/orders",
    icon: ShoppingBag,
    badge: 3,
  },
  {
    title: "Marché agriculteurs",
    url: "/merchant/farmers",
    icon: Sprout,
  },
  {
    title: "Mes commandes agricoles",
    url: "/merchant/farm-orders",
    icon: Truck,
  },
  {
    title: "Statistiques",
    url: "/merchant/analytics",
    icon: BarChart3,
  },
  {
    title: "Impact environnemental",
    url: "/merchant/impact",
    icon: Leaf,
  },
];

const settingsMenuItems = [
  {
    title: "Mon commerce",
    url: "/merchant/profile",
    icon: Store,
  },
  {
    title: "Notifications",
    url: "/merchant/notifications",
    icon: Bell,
  },
  {
    title: "Paramètres",
    url: "/merchant/settings",
    icon: Settings,
  },
  {
    title: "Aide",
    url: "/merchant/help",
    icon: HelpCircle,
  },
];

interface MerchantSidebarProps {
  merchantName?: string;
  merchantType?: string;
  merchantId?: string;
}

const MerchantSidebar = ({
  merchantName = "Mon Commerce",
  merchantType = "Restaurant",
  merchantId,
}: MerchantSidebarProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const { data: products } = useMerchantItems(merchantId);
  const { data: activeOrders } = useMerchantActiveOrders(merchantId);

  const menuItemsWithBadges = mainMenuItems.map(item => {
    if (item.url === "/merchant/products") {
      return { ...item, badge: products?.length || 0 };
    }
    if (item.url === "/merchant/orders") {
      return { ...item, badge: activeOrders?.length || 0 };
    }
    return item;
  });

  const isActive = (path: string) => {
    if (path === "/merchant") {
      return pathname === "/merchant";
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
            <Store className="w-5 h-5 text-primary" />
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-foreground truncate">
                {merchantName}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {merchantType}
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Quick Action */}
        {!isCollapsed && (
          <div className="px-4 mb-4">
            {/* Note: passing state via Link in Next.js is not done via a 'state' prop like in react-router-dom. 
                We usually use query params or a global state. For now, we'll just link to products. 
            */}
            <Link href="/merchant/products?action=add">
              <Button className="w-full gap-2" size="sm">
                <Plus className="w-4 h-4" />
                Nouveau produit
              </Button>
            </Link>
          </div>
        )}

        {/* Main Navigation */}
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
                      {item.badge && !isCollapsed && (
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

export default MerchantSidebar;
