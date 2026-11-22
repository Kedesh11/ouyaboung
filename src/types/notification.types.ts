// ============================================
// Notification Types
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

export type NotificationCategory =
  | 'order'
  | 'payment'
  | 'promotion'
  | 'system'
  | 'merchant'
  | 'impact';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  icon?: string;
  image_url?: string;
  action_url?: string;
  action_label?: string;
  data?: Record<string, unknown>;
  is_read: boolean;
  read_at?: string;
  is_archived: boolean;
  archived_at?: string;
  expires_at?: string;
  created_at: string;
}

export type NotificationType =
  | 'order_confirmed'
  | 'order_ready'
  | 'order_cancelled'
  | 'order_completed'
  | 'payment_received'
  | 'payment_failed'
  | 'qr_generated'
  | 'qr_scanned'
  | 'new_food_nearby'
  | 'merchant_verified'
  | 'promotion'
  | 'flash_sale'
  | 'expiring_soon'
  | 'impact_milestone'
  | 'welcome'
  | 'system_update'
  | 'fee_update'
  | 'security_alert';

export interface NotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  categories: {
    order: boolean;
    payment: boolean;
    promotion: boolean;
    system: boolean;
    merchant: boolean;
    impact: boolean;
  };
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  created_at: string;
  updated_at: string;
}

export interface NotificationGroup {
  date: string;
  notifications: AppNotification[];
}

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority?: NotificationPriority;
  title: string;
  message: string;
  icon?: string;
  image_url?: string;
  action_url?: string;
  action_label?: string;
  data?: Record<string, unknown>;
  expires_at?: string;
}
