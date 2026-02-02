"use client";

// ============================================
// Merchant Notifications Page
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
    Bell,
    CheckCircle,
    Clock,
    AlertCircle,
    ShoppingBag,
    Info,
    Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getUserNotifications, markAsRead, deleteNotification } from "@/services/notification.service";
import type { AppNotification } from "@/types/notification.types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const MerchantNotificationsPage = () => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            loadNotifications();
        }
    }, [user]);

    const loadNotifications = async () => {
        if (!user) return;
        try {
            const res = await getUserNotifications(user.id);
            if (res.success && res.data) {
                setNotifications(res.data);
            }
        } catch (error) {
            console.error(error);
            toast.error("Impossible de charger les notifications");
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAsRead = async (id: string) => {
        if (!user) return;
        try {
            await markAsRead(id, user.id);
            setNotifications(prev =>
                prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
            );
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user) return;
        try {
            await deleteNotification(id, user.id);
            setNotifications(prev => prev.filter(n => n.id !== id));
            toast.success("Notification supprimée");
        } catch (error) {
            toast.error("Erreur lors de la suppression");
        }
    };

    const getIcon = (type: string) => {
        if (type.includes("order")) return <ShoppingBag className="w-5 h-5 text-primary" />;
        if (type.includes("warning")) return <AlertCircle className="w-5 h-5 text-destructive" />;
        return <Info className="w-5 h-5 text-blue-500" />;
    };

    return (
    <div className="space-y-4 md:space-y-6 lg:p-6">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
          Restez informé de votre activité
        </p>
      </div>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        Toutes les notifications
                    </CardTitle>
                    <Badge variant="secondary">
                        {notifications.filter((n) => !n.is_read).length} non lues
                    </Badge>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Bell className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>Aucune notification pour le moment</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${notification.is_read ? "bg-card" : "bg-primary/5 border-primary/20"
                                        }`}
                                    onClick={() => handleMarkAsRead(notification.id)}
                                >
                                    <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center border shrink-0">
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className={`text-sm font-semibold ${!notification.is_read && "text-primary"}`}>
                                                {notification.title}
                                            </h4>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {format(new Date(notification.created_at), "dd MMM HH:mm", { locale: fr })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                            {notification.message}
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        onClick={(e) => handleDelete(notification.id, e)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
    </div>
    );
};

export default MerchantNotificationsPage;
