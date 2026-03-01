// ============================================
// Merchants API - Merchant Management Operations
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { supabaseClient, requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES, API_ROUTES } from './routes';
import {
  DEFAULT_OFFLINE_CACHE_TTL_MS,
  getOfflineCacheAsync,
  isBrowserOffline,
  setOfflineCacheAsync,
} from '@/lib/offline/cache';
import { AVG_MEAL_WEIGHT_KG } from '@/lib/impactCalculations';

import type {
  ApiResponse,
  Merchant,
  MerchantType,
  MerchantImpact,
  PaginatedResponse,
  GabonCity
} from '@/types';

const MERCHANT_LIST_COLUMNS =
  'id,user_id,business_name,business_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,opening_hours,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';

/**
 * Get all merchants with optional filters
 */
export const getMerchants = async (filters?: {
  city?: GabonCity;
  type?: MerchantType;
  is_verified?: boolean;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<PaginatedResponse<Merchant>>> => {
  const serializedFilters = JSON.stringify(filters || {});
  const cacheKey = `merchants:list:${serializedFilters}`;
  const cached = await getOfflineCacheAsync<PaginatedResponse<Merchant>>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Aucun commerce en cache hors ligne.' },
      success: false,
    };
  }


  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS, { count: 'exact' });

  if (filters?.city) {
    query = query.eq('city', filters.city);
  }
  if (filters?.type) {
    query = query.eq('business_type', filters.type);
  }
  if (filters?.is_verified !== undefined) {
    query = query.eq('is_verified', filters.is_verified);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  query = query.range(offset, offset + limit - 1);

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

  const responseData: PaginatedResponse<Merchant> = {
    data: data as Merchant[],
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
 * Get merchant by ID
 */
export const getMerchantById = async (
  merchantId: string
): Promise<ApiResponse<Merchant>> => {


  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS)
    .eq('id', merchantId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Merchant,
    error: null,
    success: true,
  };
};

/**
 * Get merchant by slug
 */
export const getMerchantBySlug = async (
  slug: string
): Promise<ApiResponse<Merchant>> => {
  const cacheKey = `merchant:slug:${slug}`;
  const cached = await getOfflineCacheAsync<Merchant>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Commerce indisponible hors ligne (non mis en cache).' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS)
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

  if (data) {
    await setOfflineCacheAsync(cacheKey, data as Merchant);
  }

  return {
    data: data as Merchant,
    error: null,
    success: true,
  };
};

/**
 * Get merchant by user ID
 */
export const getMerchantByUserId = async (
  userId: string
): Promise<ApiResponse<Merchant>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Merchant,
    error: null,
    success: true,
  };
};

/**
 * Create a new merchant
 */
export const createMerchant = async (
  merchantData: Omit<Merchant, 'id' | 'created_at' | 'updated_at' | 'rating' | 'total_reviews' | 'slug'>
): Promise<ApiResponse<Merchant>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .insert({
      ...merchantData,
      rating: 0,
      total_reviews: 0,
      is_verified: merchantData.is_verified ?? false,
      is_active: merchantData.is_active ?? false,
    })
    .select(MERCHANT_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Merchant,
    error: null,
    success: true,
  };
};

/**
 * Update merchant
 */
export const updateMerchant = async (
  merchantId: string,
  updates: Partial<Merchant>
): Promise<ApiResponse<Merchant>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', merchantId)
    .select(MERCHANT_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Merchant,
    error: null,
    success: true,
  };
};

/**
 * Get nearby merchants
 */
export const getNearbyMerchants = async (
  latitude: number,
  longitude: number,
  radiusKm: number = 5
): Promise<ApiResponse<Merchant[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Use PostGIS or simple bounding box calculation
  // This is a simplified version - in production, use PostGIS functions
  const latDelta = radiusKm / 111; // ~111km per degree latitude
  const lonDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

  const { data, error } = await client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS)
    .gte('latitude', latitude - latDelta)
    .lte('latitude', latitude + latDelta)
    .gte('longitude', longitude - lonDelta)
    .lte('longitude', longitude + lonDelta)
    .eq('is_active', true)
    .eq('is_verified', true);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Merchant[],
    error: null,
    success: true,
  };
};

/**
 * Get merchant impact statistics
 */
export const getMerchantImpact = async (
  merchantId: string
): Promise<ApiResponse<MerchantImpact>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // Get merchant stats from impact logs
  const { data, error } = await client
    .from(DB_TABLES.IMPACT_LOGS)
    .select('merchant_id,food_saved_kg,revenue_xaf,co2_avoided_kg')
    .eq('merchant_id', merchantId);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Get merchant rating
  const { data: merchant } = await client
    .from(DB_TABLES.MERCHANTS)
    .select('rating')
    .eq('id', merchantId)
    .maybeSingle();

  const totalFoodSavedKg = data?.reduce((sum, log) => sum + (log.food_saved_kg || 0), 0) || 0;
  const impact: MerchantImpact = {
    merchant_id: merchantId,
    food_saved_kg: totalFoodSavedKg,
    revenue_from_waste_xaf: data?.reduce((sum, log) => sum + (log.revenue_xaf || 0), 0) || 0,
    co2_avoided_kg: data?.reduce((sum, log) => sum + (log.co2_avoided_kg || 0), 0) || 0,
    orders_fulfilled: data?.length || 0,
    total_meals_saved: Math.round(totalFoodSavedKg / AVG_MEAL_WEIGHT_KG),
    average_rating: merchant?.rating || 0,
    waste_reduction_rate: 0, // Calculate based on business logic
  };

  return {
    data: impact,
    error: null,
    success: true,
  };
};

/**
 * Search merchants by name or location
 */
export const searchMerchants = async (
  query: string,
  city?: GabonCity
): Promise<ApiResponse<Merchant[]>> => {
  const cacheKey = `merchants:search:query:${query}:city:${city || 'all'}`;
  const cached = await getOfflineCacheAsync<Merchant[]>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Recherche commerces indisponible hors ligne (pas de cache).' },
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
  let dbQuery = client
    .from(DB_TABLES.MERCHANTS)
    .select(MERCHANT_LIST_COLUMNS)
    .or(`business_name.ilike.%${query}%,quartier.ilike.%${query}%`)
    .eq('is_active', true)
    .eq('is_verified', true);

  if (city) {
    dbQuery = dbQuery.eq('city', city);
  }

  const { data, error } = await dbQuery.limit(20);

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

  await setOfflineCacheAsync(cacheKey, data as Merchant[]);

  return {
    data: data as Merchant[],
    error: null,
    success: true,
  };
};
