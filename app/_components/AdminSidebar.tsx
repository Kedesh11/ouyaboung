"use client";

import { usePathname } from "next/navigation";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import {
    LayoutDashboard,
    ClipboardCheck,
    Store,
    Users,
    Package,
    Receipt,
    BarChart2,
    Map,
    Bell,
    Settings,
    LogOut,
    Shield,
} from "lucide-react";

const adminMenuItems = [
    {
        title: "Tableau de bord",
        url: "/admin",
        icon: LayoutDashboard,
    },
    {
        title: "Validations",
        url: "/admin/validations",
        icon: ClipboardCheck,
    },
    {
        title: "Marchands",
        url: "/admin/merchants",
        icon: Store,
    },
    {
        title: "Clients",
        url: "/admin/clients",
        icon: Users,
    },
    {
        title: "Produits",
        url: "/admin/products",
        icon: Package,
    },
    {
        title: "Transactions",
        url: "/admin/transactions",
        icon: Receipt,
    },
    {
        title: "Analytics",
        url: "/admin/analytics",
        icon: BarChart2,
    },
    {
        title: "Géolocalisation",
        url: "/admin/geo",
        icon: Map,
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

interface AdminSidebarProps {
    userName?: string;
    userEmail?: string;
    userImage?: string;
}

const AdminSidebar = ({ userName, userEmail, userImage }: AdminSidebarProps) => {
    const pathname = usePathname();
    const { signOut } = useAuth();
    const { isMobile } = useSidebar();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-2 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <Shield className="size-4" />
                    </div>
                    <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                        <span className="truncate font-semibold">Admin Panel</span>
                        <span className="truncate text-xs">Ouyaboung</span>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent>
                {/* Main Menu */}
                <SidebarGroup>
                    <SidebarGroupLabel>Gestion</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {adminMenuItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={pathname === item.url || pathname?.startsWith(`${item.url}/`)}
                                        tooltip={item.title}
                                    >
                                        <Link href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Settings Menu */}
                <SidebarGroup>
                    <SidebarGroupLabel>Système</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {settingsMenuItems.map((item) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={pathname === item.url || pathname?.startsWith(`${item.url}/`)}
                                        tooltip={item.title}
                                    >
                                        <Link href={item.url}>
                                            <item.icon />
                                            <span>{item.title}</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <div className="flex items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center">
                            <Avatar className="h-8 w-8 rounded-lg">
                                <AvatarImage src={userImage} alt={userName} />
                                <AvatarFallback className="rounded-lg">AD</AvatarFallback>
                            </Avatar>
                            <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                                <span className="truncate font-semibold">{userName || "Administrateur"}</span>
                                <span className="truncate text-xs">{userEmail || "admin@ouyaboung.com"}</span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 ml-auto group-data-[collapsible=icon]:hidden"
                                onClick={() => signOut()}
                            >
                                <LogOut className="size-4" />
                            </Button>
                        </div>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
};

export default AdminSidebar;
