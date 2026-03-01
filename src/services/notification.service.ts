// ============================================
// Notification Service
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { supabaseClient } from '@/api/supabaseClient';
import type { ApiResponse } from '@/types';
import type {
  AppNotification,
  NotificationPreferences,
  CreateNotificationInput,
  NotificationCategory,
} from '@/types/notification.types';

// Mock preferences cache for now, as we focus on notifications table first
const mockPreferences: Map<string, NotificationPreferences> = new Map();
const NOTIFICATION_COLUMNS =
  'id,user_id,type,title,message,data,is_read,created_at';

/**
 * Get user notifications
 */
export const getUserNotifications = async (
  userId: string,
  options?: {
    unreadOnly?: boolean;
    category?: NotificationCategory;
    limit?: number;
  }
): Promise<ApiResponse<AppNotification[]>> => {
  if (!supabaseClient) {
    return {
      data: [],
      error: { code: 'CONFIG_ERROR', message: 'Supabase client not configured' },
      success: false
    };
  }

  try {
    let query = supabaseClient
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', userId);

    if (options?.unreadOnly) {
      query = query.eq('is_read', false);
    }

    // Category filtering skipped for current schema

    // Sort by creation date (newest first)
    query = query.order('created_at', { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    return { data: data as AppNotification[], error: null, success: true };
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return {
      data: [],
      error: { code: 'FETCH_ERROR', message: 'Erreur lors de la récupération des notifications' },
      success: false,
    };
  }
};

/**
 * Get unread count
 */
export const getUnreadCount = async (
  userId: string
): Promise<ApiResponse<number>> => {
  if (!supabaseClient) {
    return { data: 0, error: null, success: true };
  }

  try {
    const { count, error } = await supabaseClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;

    return { data: count || 0, error: null, success: true };
  } catch (err) {
    console.error('Error fetching unread count:', err);
    return { data: 0, error: null, success: false };
  }
};

/**
 * Mark notification as read
 */
export const markAsRead = async (
  notificationId: string,
  userId: string
): Promise<ApiResponse<null>> => {
  if (!supabaseClient) return { data: null, error: null, success: false };

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return { data: null, error: null, success: true };
  } catch (err) {
    console.error('Error marking as read:', err);
    return { data: null, error: { code: 'UPDATE_ERROR', message: 'Update failed' }, success: false };
  }
};

/**
 * Mark all notifications as read
 */
export const markAllAsRead = async (
  userId: string
): Promise<ApiResponse<null>> => {
  if (!supabaseClient) return { data: null, error: null, success: false };

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;

    return { data: null, error: null, success: true };
  } catch (err) {
    console.error('Error marking all as read:', err);
    return { data: null, error: { code: 'UPDATE_ERROR', message: 'Update failed' }, success: false };
  }
};

/**
 * Archive notification
 */
export const archiveNotification = async (
  notificationId: string,
  userId: string
): Promise<ApiResponse<null>> => {
  return { data: null, error: null, success: true };
};

/**
 * Delete notification
 */
export const deleteNotification = async (
  notificationId: string,
  userId: string
): Promise<ApiResponse<null>> => {
  if (!supabaseClient) return { data: null, error: null, success: false };

  try {
    const { error } = await supabaseClient
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return { data: null, error: null, success: true };
  } catch (err) {
    console.error('Error deleting notification:', err);
    return { data: null, error: { code: 'DELETE_ERROR', message: 'Delete failed' }, success: false };
  }
};

/**
 * Create notification (internal use)
 */
export const createNotification = async (
  input: CreateNotificationInput
): Promise<ApiResponse<AppNotification>> => {
  if (!supabaseClient) return { data: null, error: { code: 'CONFIG_ERROR', message: 'No Supabase client' }, success: false };

  try {
    const notification = {
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data,
      is_read: false,
    };

    const { data, error } = await supabaseClient
      .from('notifications')
      .insert(notification)
      .select(NOTIFICATION_COLUMNS)
      .single();

    if (error) throw error;

    return { data: data as AppNotification, error: null, success: true };
  } catch (err) {
    console.error('Error creating notification:', err);
    return { data: null, error: { code: 'CREATE_ERROR', message: 'Create failed' }, success: false };
  }
};

/**
 * Get notification preferences
 */
export const getPreferences = async (
  userId: string
): Promise<ApiResponse<NotificationPreferences>> => {
  if (!supabaseClient) return { data: null, error: null, success: false };

  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, preferences')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    type PreferencesPayload = { [key: string]: unknown; notification_preferences?: NotificationPreferences };
    const prefs = (data?.preferences ?? {}) as PreferencesPayload;
    const existing = prefs.notification_preferences;
    if (existing) {
      return { data: existing, error: null, success: true };
    }

    // Default preferences if not found
    const defaultPrefs: NotificationPreferences = {
      user_id: userId,
      push_enabled: true,
      email_enabled: true,
      sms_enabled: false,
      categories: {
        order: true,
        payment: true,
        promotion: true,
        system: true,
        merchant: true,
        impact: true,
      },
      quiet_hours: {
        enabled: false,
        start: '22:00',
        end: '08:00',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const mergedPrefs = { ...(data?.preferences || {}), notification_preferences: defaultPrefs };
    await supabaseClient
      .from('profiles')
      .update({ preferences: mergedPrefs, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    return { data: defaultPrefs, error: null, success: true };
  } catch (err) {
    console.error('Error fetching preferences:', err);
    return { data: null, error: { code: 'FETCH_ERROR', message: 'Failed to fetch preferences' }, success: false };
  }
};

/**
 * Update notification preferences
 */
export const updatePreferences = async (
  userId: string,
  updates: Partial<NotificationPreferences>
): Promise<ApiResponse<NotificationPreferences>> => {
  if (!supabaseClient) return { data: null, error: null, success: false };

  try {
    // First get current or default to ensure we have a record
    const { data: current } = await getPreferences(userId);

    if (!current) {
      throw new Error("Could not load current preferences to update");
    }

    const updated = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { data: profileData, error } = await supabaseClient
      .from('profiles')
      .select('preferences')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    const mergedPrefs = { ...(profileData?.preferences || {}), notification_preferences: updated };
    await supabaseClient
      .from('profiles')
      .update({ preferences: mergedPrefs, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    return { data: updated as NotificationPreferences, error: null, success: true };
  } catch (err) {
    console.error('Error updating preferences:', err);
    return { data: null, error: { code: 'UPDATE_ERROR', message: 'Failed to update preferences' }, success: false };
  }
};

/**
 * Send order notification
 */
export const sendOrderNotification = async (
  userId: string,
  type: 'confirmed' | 'ready' | 'cancelled' | 'completed',
  orderData: { id: string; itemName: string; merchantName: string }
): Promise<void> => {
  const messages = {
    confirmed: {
      title: 'Commande confirmée',
      message: `Votre commande de ${orderData.itemName} chez ${orderData.merchantName} est confirmée`,
    },
    ready: {
      title: 'Commande prête',
      message: `Votre ${orderData.itemName} est prêt à être récupéré chez ${orderData.merchantName}`,
    },
    cancelled: {
      title: 'Commande annulée',
      message: `Votre commande chez ${orderData.merchantName} a été annulée`,
    },
    completed: {
      title: 'Commande récupérée',
      message: `Merci ! Vous avez récupéré votre ${orderData.itemName}`,
    },
  };

  await createNotification({
    user_id: userId,
    type: `order_${type}` as AppNotification['type'],
    category: 'order',
    priority: type === 'ready' ? 'high' : 'medium',
    ...messages[type],
    action_url: `/user/orders/${orderData.id}`,
    action_label: 'Voir ma commande',
    data: orderData,
  });
};

/**
 * Send QR code notification
 */
export const sendQRCodeNotification = async (
  userId: string,
  transactionId: string
): Promise<void> => {
  await createNotification({
    user_id: userId,
    type: 'qr_generated',
    category: 'payment',
    priority: 'high',
    title: 'QR Code généré',
    message: 'Votre QR code de récupération est disponible. Présentez-le au commerçant.',
    action_url: `/user/transactions/${transactionId}`,
    action_label: 'Voir mon QR code',
    data: { transactionId },
  });
};
