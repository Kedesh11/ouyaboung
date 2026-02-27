// ============================================
// Inventory API - Food Items Management
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { supabaseClient, requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import {
  DEFAULT_OFFLINE_CACHE_TTL_MS,
  getOfflineCache,
  isBrowserOffline,
  setOfflineCache,
} from '@/lib/offline/cache';
import type {
  ApiResponse,
  FoodItem,
  FoodCategory,
  CreateFoodItemInput,
  PaginatedResponse,
  SearchFilters
} from '@/types';

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
  const cached = getOfflineCache<PaginatedResponse<FoodItem>>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

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
    .select('*, merchants!inner(*)', { count: 'exact' })
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
    merchant: item.merchants,
  })) as FoodItem[];

  const responseData: PaginatedResponse<FoodItem> = {
    data: items,
    total: count || 0,
    page: Math.floor(offset / limit) + 1,
    per_page: limit,
    total_pages: Math.ceil((count || 0) / limit),
  };

  setOfflineCache(cacheKey, responseData);

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
    .select('*, merchants(*)')
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
    merchant: data.merchants,
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
  const cached = getOfflineCache<FoodItem>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

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
    .select('*, merchants(*)')
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
    merchant: data.merchants,
  } : null;

  if (item) {
    setOfflineCache(cacheKey, item as FoodItem);
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
    .select('*')
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
    .select()
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
    .select()
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
  const cached = getOfflineCache<FoodItem[]>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

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
  let query = client
    .from(DB_TABLES.FOOD_ITEMS)
    .select('*, merchants!inner(*)')
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

  const { data, error } = await query.limit(50);

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

  const items = data?.map((item) => ({
    ...item,
    merchant: item.merchants,
  })) as FoodItem[];

  setOfflineCache(cacheKey, items);

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
    .select()
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
