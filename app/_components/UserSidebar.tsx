"use client";

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useActiveReservationsCount } from "@/hooks/useActiveReservationsCount";
import {
    LayoutDashboard,
    ShoppingBag,
    Heart,
    Leaf,
    Settings,
    Bell,
    LogOut,
    HelpCircle,
    User,
    Search,
    ChevronLeft,
    ChevronRight,
    Receipt,
} from "lucide-react";

const mainMenuItems = [
    {
        title: "Tableau de bord",
        url: "/user",
        icon: LayoutDashboard,
    },
    {
        title: "Rechercher",
        url: "/search",
        icon: Search,
    },
    {
        title: "Mes réservations",
        url: "/user/reservations",
        icon: ShoppingBag,
        isDynamicBadge: true, // Marker for dynamic badge
    },
    {
        title: "Mes transactions",
        url: "/user/transactions",
        icon: Receipt,
    },
    {
        title: "Mes favoris",
        url: "/user/favorites",
        icon: Heart,
    },
    {
        title: "Mon impact",
        url: "/user/impact",
        icon: Leaf,
    },
];

const settingsMenuItems = [
    {
        title: "Mon profil",
        url: "/user/profile",
        icon: User,
    },
    {
        title: "Notifications",
        url: "/user/notifications",
        icon: Bell,
        isNotification: true, // Marker for dynamic badge
    },
    {
        title: "Paramètres",
        url: "/user/settings",
        icon: Settings,
    },
    {
        title: "Aide",
        url: "/user/help",
        icon: HelpCircle,
    },
];

interface UserSidebarProps {
    userName?: string;
}

const UserSidebar = ({ userName = "Utilisateur" }: UserSidebarProps) => {
    const pathname = usePathname();
    const router = useRouter();
    const { toast } = useToast();
    const { state, toggleSidebar } = useSidebar();
    const { unreadCount } = useNotifications();
    const { count: activeReservationsCount } = useActiveReservationsCount();
    const { signOut, user } = useAuth();
    const isCollapsed = state === "collapsed";

    // Helper functions for user display
    const getDisplayName = () => {
        if (user?.user_metadata?.full_name) {
            return user.user_metadata.full_name;
        }
        if (user?.email) {
            return user.email.split('@')[0];
        }
        return userName;
    };

    const getUserInitials = () => {
        const name = getDisplayName();
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const getProfileImageUrl = () => {
        return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined;
    };

    const isActive = (path: string) => {
        if (path === "/user") {
            return pathname === "/user";
        }
        return pathname.startsWith(path);
    };

    const handleLogout = async () => {
        try {
            await signOut();
            toast({
                title: "Déconnexion réussie",
                description: "À bientôt sur ouyaboung !",
            });
            router.push("/auth");
        } catch (error: any) {
            toast({
                title: "Erreur de déconnexion",
                description: error.message || "Une erreur est survenue",
                variant: "destructive",
            });
        }
    };

    return (
        <Sidebar collapsible="icon" className="border-r border-border">
            <SidebarHeader className="p-4 flex flex-row items-center justify-between">
                <SidebarMenuButton
                    asChild
                    className="flex-1 justify-start p-2 h-auto hover:bg-accent/50 max-w-[calc(100%-32px)]"
                >
                    <Link href="/user/profile">
                        <div className="flex items-center gap-3 overflow-hidden">
                            <Avatar className="w-10 h-10 shrink-0">
                                <AvatarImage
                                    src={getProfileImageUrl()}
                                    alt={getDisplayName()}
                                />
                                <AvatarFallback className="bg-primary/10 text-primary">
                                    {getUserInitials()}
                                </AvatarFallback>
                            </Avatar>
                            {!isCollapsed && (
                                <div className="flex-1 min-w-0">
                                    <h2 className="font-semibold text-foreground truncate">
                                        {getDisplayName()}
                                    </h2>
                                    <p className="text-xs text-muted-foreground truncate">
                                        Client ouyaboung
                                    </p>
                                </div>
                            )}
                        </div>
                    </Link>
                </SidebarMenuButton>

                {/* Custom Toggle Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-1 shrink-0 hidden md:flex"
                    onClick={toggleSidebar}
                    aria-label={isCollapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
                >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </Button>
            </SidebarHeader>

            <SidebarContent>
                {/* Main Navigation */}
                <SidebarGroup>
                    <SidebarGroupLabel>Menu principal</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainMenuItems.map((item) => (
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
                                            {(item as any).isDynamicBadge && activeReservationsCount > 0 && !isCollapsed && (
                                                <Badge
                                                    variant="secondary"
                                                    className="ml-auto h-5 px-1.5 text-xs"
                                                >
                                                    {activeReservationsCount}
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
                            {settingsMenuItems.map((item: any) => (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton
                                        asChild
                                        isActive={isActive(item.url)}
                                        tooltip={item.title}
                                    >
                                        <Link href={item.url} className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <item.icon className="w-4 h-4" />
                                                <span>{item.title}</span>
                                            </div>
                                            {item.isNotification && unreadCount > 0 && !isCollapsed && (
                                                <Badge
                                                    variant="destructive"
                                                    className="ml-auto h-5 w-5 flex items-center justify-center p-0 text-[10px]"
                                                >
                                                    {unreadCount > 9 ? "9+" : unreadCount}
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

export default UserSidebar;
