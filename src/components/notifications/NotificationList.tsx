// ============================================
// Notification List Component
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CheckCircle2,
  Package,
  QrCode,
  TrendingUp,
  Sparkles,
  Bell,
  ChevronRight,
  Check,
  Trash2,
  Loader2,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import type { AppNotification } from "@/types/notification.types";

const getNotificationIcon = (type: AppNotification["type"]) => {
  switch (type) {
    case "order_confirmed":
    case "order_ready":
    case "order_completed":
      return Package;
    case "qr_generated":
    case "qr_scanned":
      return QrCode;
    case "impact_milestone":
      return TrendingUp;
    case "fee_update":
      return Percent;
    case "new_food_nearby":
    case "promotion":
    case "flash_sale":
      return Sparkles;
    default:
      return Bell;
  }
};

const getNotificationColor = (category: AppNotification["category"]) => {
  switch (category) {
    case "order":
      return "text-primary bg-primary/10";
    case "payment":
      return "text-secondary bg-secondary/10";
    case "promotion":
      return "text-purple-500 bg-purple-500/10";
    case "impact":
      return "text-green-500 bg-green-500/10";
    default:
      return "text-muted-foreground bg-muted";
  }
};

interface NotificationItemProps {
  notification: AppNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const NotificationItem = ({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) => {
  const Icon = getNotificationIcon(notification.type);
  const colorClass = getNotificationColor(notification.category);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={cn(
        "group relative p-3 hover:bg-muted/50 transition-colors",
        !notification.is_read && "bg-primary/5"
      )}
    >
      <div className="flex gap-3">
        <div className={cn("p-2 rounded-full shrink-0", colorClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium line-clamp-1", !notification.is_read && "font-semibold")}>
            {notification.title}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {notification.message}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(parseISO(notification.created_at), {
              addSuffix: true,
              locale: fr,
            })}
          </p>
          {notification.action_url && (
            <Link
              href={notification.action_url}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
            >
              {notification.action_label || "Voir plus"}
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {!notification.is_read && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMarkAsRead(notification.id)}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(notification.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {!notification.is_read && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
      )}
    </motion.div>
  );
};

interface NotificationListProps {
  viewAllLink?: string;
}

const NotificationList = ({ viewAllLink = "/user/notifications" }: NotificationListProps) => {
  const {
    groupedNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    isLoading,
    error,
  } = useNotifications();

  const hasNotifications = groupedNotifications.some(
    (group) => group.notifications.length > 0
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={markAllAsRead}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Tout marquer comme lu
          </Button>
        )}
      </div>

      <ScrollArea className="h-80">
        {isLoading ? (
          <div className="flex items-center justify-center h-80">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-80 p-4 text-sm text-destructive">{error}</div>
        ) : hasNotifications ? (
          <AnimatePresence mode="popLayout">
            {groupedNotifications.map((group) => (
              <div key={group.date}>
                <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    {group.date}
                  </span>
                </div>
                {group.notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onDelete={deleteNotification}
                  />
                ))}
              </div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <Bell className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">Aucune notification</p>
          </div>
        )}
      </ScrollArea>

      <Separator />
      <Link
        href={viewAllLink}
        className="flex items-center justify-center gap-2 p-3 text-sm text-primary hover:bg-muted/50 transition-colors"
      >
        Voir toutes les notifications
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
};

export default NotificationList;
