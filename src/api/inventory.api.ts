// ============================================
// Inventory API - Food Items Management
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
  FoodItem,
  FoodCategory,
  CreateFoodItemInput,
  PaginatedResponse,
  SearchFilters
} from '@/types';

const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FOOD_ITEM_LIST_COLUMNS =
  'id,merchant_id,name,description,category,original_price,discounted_price,discount_percentage,quantity_available,quantity_initial,image_url,images,pickup_start,pickup_end,expiry_date,is_available,contents,badges,slug,created_at,updated_at';
const DEFAULT_SEARCH_LIMIT = 50;
const DISTANCE_SEARCH_LIMIT = 1000;

const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

const isValidCoord = (lat?: number | null, lng?: number | null): boolean =>
  typeof lat === 'number' &&
  typeof lng === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;

const calculateDistanceKm = (
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number }
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(target.latitude - origin.latitude);
  const dLng = toRad(target.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(origin.latitude)) *
      Math.cos(toRad(target.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

/**
 * Get all available food items
 */
export const getAvailableFoodItems = async (filters?: {
  category?: FoodCategory;
  merchant_id?: string;
  city?: string;
  min_price?: number;
  max_price?: number;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<PaginatedResponse<FoodItem>>> => {
  const serializedFilters = JSON.stringify(filters || {});
  const cacheKey = `inventory:available:${serializedFilters}`;
  const cached = await getOfflineCacheAsync<PaginatedResponse<FoodItem>>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Aucun produit disponible en cache hors ligne.' },
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
    .from(DB_TABLES.FOOD_ITEMS)
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants!inner(${MERCHANT_LIST_COLUMNS})`, { count: 'exact' })
    .eq('is_available', true)
    .gt('quantity_available', 0)
    .eq('merchants.is_verified', true)
    .eq('merchants.is_active', true);

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }
  if (filters?.merchant_id) {
    query = query.eq('merchant_id', filters.merchant_id);
  }
  if (filters?.min_price !== undefined) {
    query = query.gte('discounted_price', filters.min_price);
  }
  if (filters?.max_price !== undefined) {
    query = query.lte('discounted_price', filters.max_price);
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

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

  // Transform data to include merchant info
  const items = data?.map((item) => ({
    ...item,
    merchant: toOne(item.merchants),
  })) as FoodItem[];

  const responseData: PaginatedResponse<FoodItem> = {
    data: items,
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
 * Get food item by ID
 */
export const getFoodItemById = async (
  itemId: string
): Promise<ApiResponse<FoodItem>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  const item = data ? {
    ...data,
    merchant: toOne(data.merchants),
  } : null;

  return {
    data: item as FoodItem,
    error: null,
    success: true,
  };
};

/**
 * Get food item by slug
 */
export const getFoodItemBySlug = async (
  slug: string
): Promise<ApiResponse<FoodItem>> => {
  const cacheKey = `inventory:item:slug:${slug}`;
  const cached = await getOfflineCacheAsync<FoodItem>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Produit indisponible hors ligne (non mis en cache).' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants(${MERCHANT_LIST_COLUMNS})`)
    .eq('slug', slug)
    .maybeSingle();

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

  const item = data ? {
    ...data,
    merchant: toOne(data.merchants),
  } : null;

  if (item) {
    await setOfflineCacheAsync(cacheKey, item as FoodItem);
  }

  return {
    data: item as FoodItem,
    error: null,
    success: true,
  };
};

/**
 * Get food items by merchant
 */
export const getFoodItemsByMerchant = async (
  merchantId: string,
  includeUnavailable: boolean = false
): Promise<ApiResponse<FoodItem[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  if (!includeUnavailable) {
    const { data: merchant, error: merchantError } = await client
      .from(DB_TABLES.MERCHANTS)
      .select('is_verified, is_active')
      .eq('id', merchantId)
      .maybeSingle();

    if (merchantError || !merchant || !merchant.is_verified || !merchant.is_active) {
      return {
        data: [],
        error: null,
        success: true,
      };
    }
  }

  let query = client
    .from(DB_TABLES.FOOD_ITEMS)
    .select(FOOD_ITEM_LIST_COLUMNS)
    .eq('merchant_id', merchantId);

  if (!includeUnavailable) {
    query = query.eq('is_available', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FoodItem[],
    error: null,
    success: true,
  };
};

/**
 * Create a new food item
 */
export const createFoodItem = async (
  merchantId: string,
  itemData: CreateFoodItemInput
): Promise<ApiResponse<FoodItem>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  const { data: merchant, error: merchantError } = await client
    .from(DB_TABLES.MERCHANTS)
    .select('id, is_verified, is_active, is_refused')
    .eq('id', merchantId)
    .maybeSingle();

  if (merchantError || !merchant) {
    return {
      data: null,
      error: { code: 'MERCHANT_NOT_FOUND', message: 'Commerce introuvable' },
      success: false,
    };
  }

  if (!merchant.is_verified || !merchant.is_active || merchant.is_refused) {
    return {
      data: null,
      error: {
        code: 'MERCHANT_NOT_APPROVED',
        message: 'Votre commerce doit être approuvé par un administrateur avant l’ajout de produits.',
      },
      success: false,
    };
  }

  // Calculate discount percentage
  const discountPercentage = Math.round(
    ((itemData.original_price - itemData.discounted_price) / itemData.original_price) * 100
  );

  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .insert({
      merchant_id: merchantId,
      ...itemData,
      discount_percentage: discountPercentage,
      quantity_initial: itemData.quantity_available,
      is_available: true,
      contents: itemData.contents,
    })
    .select(FOOD_ITEM_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FoodItem,
    error: null,
    success: true,
  };
};

/**
 * Update food item
 */
export const updateFoodItem = async (
  itemId: string,
  updates: Partial<FoodItem>
): Promise<ApiResponse<FoodItem>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Recalculate discount if prices changed
  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.original_price !== undefined && updates.discounted_price !== undefined) {
    updateData.discount_percentage = Math.round(
      ((updates.original_price - updates.discounted_price) / updates.original_price) * 100
    );
  }

  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .update(updateData)
    .eq('id', itemId)
    .select(FOOD_ITEM_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FoodItem,
    error: null,
    success: true,
  };
};

/**
 * Delete food item
 */
export const deleteFoodItem = async (
  itemId: string
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .delete()
    .eq('id', itemId);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return { data: null, error: null, success: true };
};

/**
 * Search food items with advanced filters
 */
export const searchFoodItems = async (
  filters: SearchFilters
): Promise<ApiResponse<FoodItem[]>> => {
  const serializedFilters = JSON.stringify(filters || {});
  const cacheKey = `inventory:search:${serializedFilters}`;
  const cached = await getOfflineCacheAsync<FoodItem[]>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Recherche indisponible hors ligne (pas de cache).' },
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
  const hasDistanceFilter =
    typeof filters.max_distance_km === 'number' &&
    filters.max_distance_km > 0 &&
    isValidCoord(filters.user_latitude, filters.user_longitude);

  let query = client
    .from(DB_TABLES.FOOD_ITEMS)
    .select(`${FOOD_ITEM_LIST_COLUMNS}, merchants!inner(${MERCHANT_LIST_COLUMNS})`)
    .eq('is_available', true)
    .gt('quantity_available', 0)
    .eq('merchants.is_verified', true)
    .eq('merchants.is_active', true);

  if (filters.category) {
    query = query.eq('category', filters.category);
  }
  if (filters.city) {
    query = query.eq('merchants.city', filters.city);
  }
  if (filters.quartier) {
    query = query.eq('merchants.quartier', filters.quartier);
  }
  if (filters.merchant_type) {
    query = query.eq('merchants.business_type', filters.merchant_type);
  }
  if (filters.min_price !== undefined) {
    query = query.gte('discounted_price', filters.min_price);
  }
  if (filters.max_price !== undefined) {
    query = query.lte('discounted_price', filters.max_price);
  }
  if (hasDistanceFilter) {
    const latitude = filters.user_latitude as number;
    const longitude = filters.user_longitude as number;
    const radiusKm = filters.max_distance_km as number;
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.max(Math.cos(latitude * Math.PI / 180), 0.01));

    query = query
      .gte('merchants.latitude', latitude - latDelta)
      .lte('merchants.latitude', latitude + latDelta)
      .gte('merchants.longitude', longitude - lonDelta)
      .lte('merchants.longitude', longitude + lonDelta);
  }

  // Sort
  switch (filters.sort_by) {
    case 'price':
      query = query.order('discounted_price', { ascending: true });
      break;
    case 'discount':
      query = query.order('discount_percentage', { ascending: false });
      break;
    case 'rating':
      query = query.order('merchants(rating)', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(hasDistanceFilter ? DISTANCE_SEARCH_LIMIT : DEFAULT_SEARCH_LIMIT);

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

  let items = data?.map((item) => ({
    ...item,
    merchant: toOne(item.merchants),
  })) as FoodItem[];

  if (hasDistanceFilter) {
    const origin = {
      latitude: filters.user_latitude as number,
      longitude: filters.user_longitude as number,
    };
    const radiusKm = filters.max_distance_km as number;

    items = items
      .map((item) => {
        const merchantLat = item.merchant?.latitude;
        const merchantLng = item.merchant?.longitude;
        const distanceKm = isValidCoord(merchantLat, merchantLng)
          ? calculateDistanceKm(origin, {
              latitude: merchantLat as number,
              longitude: merchantLng as number,
            })
          : Number.POSITIVE_INFINITY;
        return { item, distanceKm };
      })
      .filter(({ distanceKm }) => distanceKm <= radiusKm)
      .sort((a, b) => {
        if (filters.sort_by === 'distance') {
          return a.distanceKm - b.distanceKm;
        }
        return 0;
      })
      .map(({ item }) => item);
  }

  await setOfflineCacheAsync(cacheKey, items);

  return {
    data: items,
    error: null,
    success: true,
  };
};

/**
 * Get food categories with counts
 */
export const getFoodCategories = async (): Promise<ApiResponse<{ category: FoodCategory; count: number }[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select('category')
    .eq('is_available', true)
    .gt('quantity_available', 0);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Count categories
  const categoryCounts = data?.reduce((acc, item: any) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const categories = Object.entries(categoryCounts).map(([category, count]) => ({
    category: category as FoodCategory,
    count: count as number,
  }));

  return {
    data: categories,
    error: null,
    success: true,
  };
};

/**
 * Update food item quantity (after reservation)
 */
export const updateFoodItemQuantity = async (
  itemId: string,
  quantityChange: number
): Promise<ApiResponse<FoodItem>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Get current quantity
  const { data: current, error: fetchError } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select('quantity_available')
    .eq('id', itemId)
    .single();

  if (fetchError) {
    return {
      data: null,
      error: { code: fetchError.code, message: fetchError.message },
      success: false,
    };
  }

  const newQuantity = Math.max(0, (current?.quantity_available || 0) + quantityChange);
  const isAvailable = newQuantity > 0;

  const updateData: any = {
    quantity_available: newQuantity,
    is_available: isAvailable,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .update(updateData)
    .eq('id', itemId)
    .select(FOOD_ITEM_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FoodItem,
    error: null,
    success: true,
  };
};
