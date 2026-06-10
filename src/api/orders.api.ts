// ============================================
// Orders API - Order/Reservation Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { supabaseClient, requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import {
  DEFAULT_OFFLINE_CACHE_TTL_MS,
  getOfflineCacheAsync,
  isBrowserOffline,
  setOfflineCacheAsync,
} from '@/lib/offline/cache';
import type {
  ApiResponse,
  Order,
  OrderStatus,
  CreateOrderInput,
  PaginatedResponse
} from '@/types';

const PROFILE_LIST_COLUMNS = 'id,user_id,email,phone,full_name,first_name,last_name,avatar_url,role,address,city,quartier,preferences,created_at,updated_at';
const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FOOD_ITEM_LIST_COLUMNS =
  'id,merchant_id,name,description,category,original_price,discounted_price,discount_percentage,quantity_available,quantity_initial,image_url,images,pickup_start,pickup_end,expiry_date,is_available,contents,badges,slug,created_at,updated_at';
const ORDER_LIST_COLUMNS =
  'id,user_id,merchant_id,food_item_id,quantity,total_price,original_total,savings,status,pickup_code,tracking_code,pickup_time,confirmed_at,picked_up_at,cancelled_at,cancellation_reason,rating,review,consumed_at,consumed_by,created_at,updated_at';
const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

/**
 * Generate a unique pickup code
 */
const generatePickupCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const normalizePickupCode = (value: string): string =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Create a new order/reservation
 */
export const createOrder = async (
  userId: string,
  orderData: CreateOrderInput
): Promise<ApiResponse<Order>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Get food item details to calculate prices
  const { data: foodItem, error: itemError } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('id', orderData.food_item_id)
    .single();
  const foodItemMerchant = toOne(foodItem?.merchants);

  if (itemError || !foodItem) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Food item not found' },
      success: false,
    };
  }

  if (
    !foodItem.is_available ||
    !foodItemMerchant?.is_verified ||
    !foodItemMerchant?.is_active ||
    foodItemMerchant?.is_refused
  ) {
    return {
      data: null,
      error: {
        code: 'MERCHANT_NOT_APPROVED',
        message: 'Ce commerce n’est pas encore approuvé ou n’est plus actif.',
      },
      success: false,
    };
  }

  // Check availability
  if (foodItem.quantity_available < orderData.quantity) {
    return {
      data: null,
      error: { code: 'INSUFFICIENT_QUANTITY', message: 'Not enough items available' },
      success: false,
    };
  }

  const totalPrice = foodItem.discounted_price * orderData.quantity;
  const originalTotal = foodItem.original_price * orderData.quantity;
  const savings = originalTotal - totalPrice;

  const { data, error } = await client
    .from(DB_TABLES.ORDERS)
    .insert({
      user_id: userId,
      merchant_id: foodItem.merchant_id,
      food_item_id: orderData.food_item_id,
      quantity: orderData.quantity,
      total_price: totalPrice,
      original_total: originalTotal,
      savings: savings,
      status: 'pending',
      pickup_code: generatePickupCode(),
    })
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Update food item quantity
  await client
    .from(DB_TABLES.FOOD_ITEMS)
    .update({
      quantity_available: foodItem.quantity_available - orderData.quantity,
      is_available: foodItem.quantity_available - orderData.quantity > 0,
    })
    .eq('id', orderData.food_item_id);

  const order: Order = {
    ...data,
    food_item: toOne(data.food_items) ?? undefined,
    merchant: toOne(data.merchants) ?? undefined,
  };

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Get order by ID
 */
export const getOrderById = async (
  orderId: string
): Promise<ApiResponse<Order>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.ORDERS)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const order = data ? {
    ...data,
    food_item: toOne(data.food_items) ?? undefined,
    merchant: toOne(data.merchants) ?? undefined,
  } as Order : null;

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Get order by tracking code (for public/guest access with verification)
 */
export const getOrderByTrackingCode = async (
  trackingCode: string
): Promise<ApiResponse<Order>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.ORDERS)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('tracking_code', trackingCode)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const order = data ? {
    ...data,
    food_item: toOne(data.food_items) ?? undefined,
    merchant: toOne(data.merchants) ?? undefined,
  } as Order : null;

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Get orders by user
 */
export const getOrdersByUser = async (
  userId: string,
  status?: OrderStatus,
  limit: number = 20,
  offset: number = 0
): Promise<ApiResponse<PaginatedResponse<Order>>> => {
  const cacheKey = `orders:user:${userId}:status:${status || 'all'}:limit:${limit}:offset:${offset}`;
  const cached = await getOfflineCacheAsync<PaginatedResponse<Order>>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Aucune donnee de reservations disponible hors ligne.' },
      success: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.ORDERS)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`, { count: 'exact' })
    .eq('user_id', userId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const orders = data?.map((o) => ({
    ...o,
    food_item: toOne(o.food_items),
    merchant: toOne(o.merchants),
  })) as Order[];

  const responseData: PaginatedResponse<Order> = {
    data: orders,
    total: count || 0,
    page: Math.floor(offset / limit) + 1,
    per_page: limit,
    total_pages: Math.ceil((count || 0) / limit),
  };

  await setOfflineCacheAsync(cacheKey, responseData);

  return {
    data: responseData,
    error: null,
    success: true,
  };
};

/**
 * Get orders by merchant
 */
export const getOrdersByMerchant = async (
  merchantId: string,
  status?: OrderStatus,
  limit: number = 20,
  offset: number = 0
): Promise<ApiResponse<PaginatedResponse<Order>>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.ORDERS)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS})`, { count: 'exact' })
    .eq('merchant_id', merchantId);

  if (status) {
    query = query.eq('status', status);
  }

  query = query
    .range(offset, offset + limit - 1)
    .order('created_at', { ascending: false });

  const { data, error, count } = await query;

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Manually fetch profiles to avoid 400 Bad Request if relationship is missing
  let profilesMap: Record<string, any> = {};
  if (data && data.length > 0) {
    const userIds = Array.from(new Set(data.filter(o => o.user_id).map(o => o.user_id)));
    if (userIds.length > 0) {
      const { data: profiles } = await client
        .from(DB_TABLES.PROFILES)
        .select(PROFILE_LIST_COLUMNS)
        .in('user_id', userIds);

      if (profiles) {
        profilesMap = profiles.reduce((acc, p) => {
          if (p.user_id) {
            acc[p.user_id] = p;
          }
          return acc;
        }, {} as Record<string, any>);
      }
    }
  }

  const orders = data?.map((o) => ({
    ...o,
    food_item: toOne(o.food_items),
    user: profilesMap[o.user_id] || null,
  })) as Order[];

  return {
    data: {
      data: orders,
      total: count || 0,
      page: Math.floor(offset / limit) + 1,
      per_page: limit,
      total_pages: Math.ceil((count || 0) / limit),
    },
    error: null,
    success: true,
  };
};

/**
 * Update order status
 */
export const updateOrderStatus = async (
  orderId: string,
  status: OrderStatus,
  additionalData?: Record<string, unknown>
): Promise<ApiResponse<Order>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    ...additionalData,
  };

  // Set timestamp based on status
  switch (status) {
    case 'confirmed':
      updateData.confirmed_at = new Date().toISOString();
      break;
    case 'picked_up':
    case 'completed':
      updateData.picked_up_at = new Date().toISOString();
      break;
    case 'cancelled':
      updateData.cancelled_at = new Date().toISOString();
      break;
  }

  const { data, error } = await client
    .from(DB_TABLES.ORDERS)
    .update(updateData)
    .eq('id', orderId)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // If cancelled, restore quantity
  if (status === 'cancelled' && data) {
    const updatedFoodItem = toOne(data.food_items);
    await client
      .from(DB_TABLES.FOOD_ITEMS)
      .update({
        quantity_available: (updatedFoodItem?.quantity_available || 0) + data.quantity,
        is_available: true,
      })
      .eq('id', data.food_item_id);
  }

  const order: Order = {
    ...data,
    food_item: toOne(data.food_items) ?? undefined,
    merchant: toOne(data.merchants) ?? undefined,
  };

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Cancel order
 */
export const cancelOrder = async (
  orderId: string,
  reason?: string
): Promise<ApiResponse<Order>> => {
  return updateOrderStatus(orderId, 'cancelled', {
    cancellation_reason: reason,
  });
};

/**
 * Confirm order (merchant action)
 */
export const confirmOrder = async (
  orderId: string
): Promise<ApiResponse<Order>> => {
  return updateOrderStatus(orderId, 'confirmed');
};

/**
 * Mark order as ready for pickup
 */
export const markOrderReady = async (
  orderId: string
): Promise<ApiResponse<Order>> => {
  return updateOrderStatus(orderId, 'ready');
};

/**
 * Complete order (after pickup)
 */
export const completeOrder = async (
  orderId: string,
  pickupCode: string
): Promise<ApiResponse<Order>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Verify pickup code
  const { data: order, error: fetchError } = await client
    .from(DB_TABLES.ORDERS)
    .select('pickup_code')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Order not found' },
      success: false,
    };
  }

  if (normalizePickupCode(order.pickup_code || '') !== normalizePickupCode(pickupCode || '')) {
    return {
      data: null,
      error: { code: 'INVALID_CODE', message: 'Invalid pickup code' },
      success: false,
    };
  }

  return updateOrderStatus(orderId, 'completed');
};

/**
 * Add review to completed order
 */
export const addOrderReview = async (
  orderId: string,
  rating: number,
  review?: string
): Promise<ApiResponse<Order>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  if (rating < 1 || rating > 5) {
    return {
      data: null,
      error: { code: 'INVALID_RATING', message: 'Rating must be between 1 and 5' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.ORDERS)
    .update({
      rating,
      review,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Update merchant rating (simplified - in production, recalculate from all reviews)
  if (data.merchant_id) {
    const { data: merchant } = await client
      .from(DB_TABLES.MERCHANTS)
      .select('rating, total_reviews')
      .eq('id', data.merchant_id)
      .single();

    if (merchant) {
      const newTotalReviews = (merchant.total_reviews || 0) + 1;
      const newRating =
        ((merchant.rating || 0) * (merchant.total_reviews || 0) + rating) / newTotalReviews;

      await client
        .from(DB_TABLES.MERCHANTS)
        .update({
          rating: Math.round(newRating * 10) / 10,
          total_reviews: newTotalReviews,
        })
        .eq('id', data.merchant_id);
    }
  }

  const order: Order = {
    ...data,
    food_item: toOne(data.food_items) ?? undefined,
    merchant: toOne(data.merchants) ?? undefined,
  };

  return {
    data: order,
    error: null,
    success: true,
  };
};

/**
 * Get active orders (pending, confirmed, ready)
 */
export const getActiveOrders = async (
  userId?: string,
  merchantId?: string
): Promise<ApiResponse<Order[]>> => {
  const cacheKey = `orders:active:user:${userId || 'none'}:merchant:${merchantId || 'none'}`;
  const cached = await getOfflineCacheAsync<Order[]>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Aucune commande active en cache hors ligne.' },
      success: false,
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.ORDERS)
    .select(`${ORDER_LIST_COLUMNS}, food_items(${FOOD_ITEM_LIST_COLUMNS}), merchants(${MERCHANT_LIST_COLUMNS})`)
    .in('status', ['pending', 'confirmed', 'ready']);

  if (userId) {
    query = query.eq('user_id', userId);
  }
  if (merchantId) {
    query = query.eq('merchant_id', merchantId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const orders = data?.map((o) => ({
    ...o,
    food_item: toOne(o.food_items),
    merchant: toOne(o.merchants),
  })) as Order[];

  await setOfflineCacheAsync(cacheKey, orders);

  return {
    data: orders,
    error: null,
    success: true,
  };
};
