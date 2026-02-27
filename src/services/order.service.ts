// ============================================
// Order Service - Order/Reservation Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  createOrder,
  getOrderById,
  getOrdersByUser,
  getOrdersByMerchant,
  updateOrderStatus,
  cancelOrder,
  confirmOrder,
  markOrderReady,
  completeOrder,
  addOrderReview,
  getActiveOrders as getActiveOrdersApi,
} from '@/api';
import { cancelOrderViaRPC } from '@/api/orders-rpc.api';
import { OFFLINE_ACTION_TYPES } from '@/lib/offline/actions';
import { isBrowserOffline, isLikelyOfflineError } from '@/lib/offline/cache';
import { enqueueOfflineQueueItem } from '@/lib/offline/queue';
import type {
  ApiResponse,
  Order,
  OrderStatus,
  PaginatedResponse
} from '@/types';

/**
 * Create a new reservation/order
 */
export const createReservation = async (
  userId: string,
  itemId: string,
  quantity: number
): Promise<ApiResponse<Order>> => {
  const queueReservation = () => {
    const queued = enqueueOfflineQueueItem(OFFLINE_ACTION_TYPES.CREATE_RESERVATION, {
      userId,
      itemId,
      quantity,
    });
    return {
      data: null,
      error: {
        code: 'OFFLINE_QUEUED',
        message: 'Reservation enregistree hors ligne. Elle sera synchronisee automatiquement.',
        details: { queue_action_id: queued.id },
      },
      success: false,
    } as ApiResponse<Order>;
  };

  if (isBrowserOffline()) {
    return queueReservation();
  }

  try {
    const result = await createOrder(userId, { food_item_id: itemId, quantity });
    if (!result.success && isLikelyOfflineError(result.error)) {
      return queueReservation();
    }
    return result;
  } catch (error) {
    if (isLikelyOfflineError(error)) {
      return queueReservation();
    }
    return {
      data: null,
      error: {
        code: 'RESERVATION_ERROR',
        message: error instanceof Error ? error.message : 'Erreur lors de la reservation',
      },
      success: false,
    };
  }
};

/**
 * Get order by ID
 */
export const getOrder = async (orderId: string): Promise<ApiResponse<Order>> => {
  return getOrderById(orderId);
};

/**
 * Get user's orders
 */
export const getUserOrders = async (
  userId: string,
  options?: {
    status?: OrderStatus;
    page?: number;
    perPage?: number;
  }
): Promise<ApiResponse<PaginatedResponse<Order>>> => {
  const limit = options?.perPage || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  return getOrdersByUser(userId, options?.status, limit, offset);
};

/**
 * Get active orders for a user (pending, confirmed, ready)
 */
export const getActiveOrders = async (
  options: { userId: string }
): Promise<ApiResponse<Order[]>> => {
  const { userId } = options;

  // Get orders with active statuses
  const result = await getOrdersByUser(userId, undefined, 50, 0); // Get more orders

  if (!result.success || !result.data) {
    return {
      data: [],
      error: result.error,
      success: false,
    };
  }

  // Filter for active orders only
  const activeStatuses: OrderStatus[] = ['pending', 'confirmed', 'ready'];
  const activeOrders = result.data.data.filter(order =>
    activeStatuses.includes(order.status)
  );

  return {
    data: activeOrders,
    error: null,
    success: true,
  };
};

/**
 * Cancel an order
 */
export const cancel = async (
  orderId: string,
  reason?: string
): Promise<ApiResponse<Order>> => {
  return cancelOrder(orderId, reason);
};

/**
 * Confirm an order (merchant action)
 */
export const confirm = async (orderId: string): Promise<ApiResponse<Order>> => {
  return confirmOrder(orderId);
};

/**
 * Mark order as ready for pickup
 */
export const markReady = async (orderId: string): Promise<ApiResponse<Order>> => {
  return markOrderReady(orderId);
};

/**
 * Complete order with pickup code verification
 */
export const complete = async (
  orderId: string,
  pickupCode: string
): Promise<ApiResponse<Order>> => {
  return completeOrder(orderId, pickupCode);
};

/**
 * Add review to completed order
 */
export const addReview = async (
  orderId: string,
  rating: number,
  comment?: string
): Promise<ApiResponse<Order>> => {
  return addOrderReview(orderId, rating, comment);
};

/**
 * Get active orders for user or merchant
 */
export const getActive = async (options?: {
  userId?: string;
  merchantId?: string;
}): Promise<ApiResponse<Order[]>> => {
  return getActiveOrdersApi(options?.userId, options?.merchantId);
};

/**
 * Get order status display text
 */
export const getStatusText = (status: OrderStatus): string => {
  const texts: Record<OrderStatus, string> = {
    pending: 'En attente',
    confirmed: 'Confirmée',
    ready: 'Prête',
    picked_up: 'Récupérée',
    completed: 'Terminée',
    cancelled: 'Annulée',
    no_show: 'Non récupérée',
  };
  return texts[status] || status;
};

/**
 * Get order status color class
 */
export const getStatusColor = (status: OrderStatus): string => {
  const colors: Record<OrderStatus, string> = {
    pending: 'bg-warning/10 text-warning',
    confirmed: 'bg-primary/10 text-primary',
    ready: 'bg-success/10 text-success',
    picked_up: 'bg-success/10 text-success',
    completed: 'bg-success/10 text-success',
    cancelled: 'bg-destructive/10 text-destructive',
    no_show: 'bg-destructive/10 text-destructive',
  };
  return colors[status] || 'bg-muted text-muted-foreground';
};

/**
 * Check if order can be cancelled
 */
export const canCancel = (order: Order): boolean => {
  return ['pending', 'confirmed'].includes(order.status);
};

/**
 * Check if order can be reviewed
 */
export const canReview = (order: Order): boolean => {
  return order.status === 'completed' && !order.rating;
};

/**
 * Format order for display
 */
export const formatOrderForDisplay = (order: Order) => {
  return {
    id: order.id,
    merchantName: order.merchant?.business_name || 'Commerce',
    itemName: order.food_item?.name || 'Article',
    quantity: order.quantity,
    totalPrice: `${order.total_price.toLocaleString()} XAF`,
    savings: `${order.savings.toLocaleString()} XAF`,
    status: getStatusText(order.status),
    statusColor: getStatusColor(order.status),
    pickupCode: order.pickup_code,
    createdAt: new Date(order.created_at).toLocaleDateString('fr-FR'),
  };
};

/**
 * Get merchant's orders
 */
export const getMerchantOrders = async (
  merchantId: string,
  options?: {
    status?: OrderStatus;
    page?: number;
    perPage?: number;
  }
): Promise<ApiResponse<PaginatedResponse<Order>>> => {
  const limit = options?.perPage || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  return getOrdersByMerchant(merchantId, options?.status, limit, offset);
};

/**
 * Calculate total savings from orders
 */
export const calculateTotalSavings = (orders: Order[]): number => {
  return orders.reduce((sum, order) => sum + (order.savings || 0), 0);
};
