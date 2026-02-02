"use client";


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Trash2, Bell } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import Link from "next/link";

// We can reuse parts of NotificationList logic or even the component itself.
// However, the page view usually demands a slightly different layout than the popover list.
// For speed and consistency, I'll adapt the list logic here for a full page view.

const AdminNotificationsPage = () => {
    const {
        groupedNotifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        isLoading,
        error,
        clearAll
    } = useNotifications();

    const hasNotifications = groupedNotifications.some(
        (group) => group.notifications.length > 0
    );

    return (
        <div className="space-y-4 md:space-y-6 lg:p-6">
            <div className="mb-4 md:mb-6">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Notifications</h1>
                <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">
                    Gérez vos alertes et messages système
                </p>
            </div>
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <Bell className="w-5 h-5" />
                            Toutes les notifications
                            {unreadCount > 0 && (
                                <span className="ml-2 text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                    {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </CardTitle>
                        <div className="flex gap-2">
                            {hasNotifications && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={markAllAsRead}
                                        disabled={unreadCount === 0}
                                    >
                                        <CheckCircle2 className="w-4 h-4 mr-2" />
                                        Tout marquer comme lu
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={clearAll}
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Tout effacer
                                    </Button>
                                </>
                            )}
                        </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="p-12 text-center text-muted-foreground">Chargement...</div>
                        ) : error ? (
                            <div className="p-12 text-center text-destructive">{error}</div>
                        ) : hasNotifications ? (
                            <div className="divide-y">
                                {groupedNotifications.map((group) => (
                                    <div key={group.date}>
                                        <div className="bg-muted/30 px-6 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                                            {group.date}
                                        </div>
                                        <div className="divide-y">
                                            <AnimatePresence>
                                                {group.notifications.map((notification) => (
                                                    <motion.div
                                                        key={notification.id}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className={cn(
                                                            "px-6 py-4 flex items-start gap-4 hover:bg-muted/50 transition-colors",
                                                            !notification.is_read && "bg-primary/5"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "w-2 h-2 mt-2 rounded-full shrink-0",
                                                            !notification.is_read ? "bg-primary" : "bg-transparent"
                                                        )} />

                                                        <div className="flex-1 space-y-1">
                                                            <div className="flex items-start justify-between">
                                                                <p className={cn("text-sm font-medium", !notification.is_read && "font-bold")}>
                                                                    {notification.title}
                                                                </p>
                                                                <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                                                                    {formatDistanceToNow(parseISO(notification.created_at), { addSuffix: true, locale: fr })}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-muted-foreground">
                                                                {notification.message}
                                                            </p>
                                                            {notification.action_url && (
                                                                <div className="pt-2">
                                                                    <Link href={notification.action_url}>
                                                                        <Button variant="link" size="sm" className="h-auto p-0 text-primary">
                                                                            Voir les détails &rarr;
                                                                        </Button>
                                                                    </Link>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                            {!notification.is_read && (
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => markAsRead(notification.id)} title="Marquer comme lu">
                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                </Button>
                                                            )}
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteNotification(notification.id)} title="Supprimer">
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-24 flex flex-col items-center justify-center text-center p-4">
                                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                    <Bell className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-medium">Vous êtes à jour</h3>
                                <p className="text-muted-foreground max-w-sm mt-2">
                                    Aucune nouvelle notification pour le moment.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AdminNotificationsPage;
