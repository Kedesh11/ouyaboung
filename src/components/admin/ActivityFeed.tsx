// ============================================
// Activity Feed - Recent Activities Component
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { AdminActivity } from "@/types/admin.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Store, ShoppingBag, Package, CheckCircle, XCircle, Activity, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  activities: AdminActivity[];
  className?: string;
}

type ActivityIconConfig = { icon: LucideIcon; color: string };

const DEFAULT_ACTIVITY_CONFIG: ActivityIconConfig = {
  icon: Activity,
  color: "text-muted-foreground bg-muted",
};

const activityIcons: Record<string, ActivityIconConfig> = {
  merchant_registration: { icon: Store, color: "text-blue-500 bg-blue-500/10" },
  merchant_validated: { icon: CheckCircle, color: "text-green-500 bg-green-500/10" },
  merchant_refused: { icon: XCircle, color: "text-destructive bg-destructive/10" },
  sale_completed: { icon: ShoppingBag, color: "text-primary bg-primary/10" },
  product_added: { icon: Package, color: "text-amber-500 bg-amber-500/10" },
  test_activity: DEFAULT_ACTIVITY_CONFIG,
};

const getActivityConfig = (type: string): ActivityIconConfig =>
  activityIcons[type] ?? DEFAULT_ACTIVITY_CONFIG;

const ActivityFeed = ({ activities, className }: ActivityFeedProps) => {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4" />
          Activité récente
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-4 pb-4">
          <div className="space-y-3">
            {activities.map((activity) => {
              const config = getActivityConfig(activity.type);
              const Icon = config.icon;

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                    config.color
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      {activity.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(activity.timestamp, "d MMM yyyy 'à' HH:mm", { locale: fr })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default ActivityFeed;
