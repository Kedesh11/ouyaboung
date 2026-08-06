// ============================================
// Farmers API - Farmer Directory Operations
// ouyaboung Platform - Répertoire des agriculteurs
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
  Farmer,
  FarmerType,
  PaginatedResponse,
  GabonCity,
} from '@/types';

const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';

/**
 * Get all farmers with optional filters
 */
export const getFarmers = async (filters?: {
  city?: GabonCity;
  type?: FarmerType;
  is_verified?: boolean;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ApiResponse<PaginatedResponse<Farmer>>> => {
  const serializedFilters = JSON.stringify(filters || {});
  const cacheKey = `farmers:list:${serializedFilters}`;
  const cached = await getOfflineCacheAsync<PaginatedResponse<Farmer>>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Aucun agriculteur en cache hors ligne.' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  let query = client
    .from(DB_TABLES.FARMERS)
    .select(FARMER_LIST_COLUMNS, { count: 'exact' });

  if (filters?.city) {
    query = query.eq('city', filters.city);
  }
  if (filters?.type) {
    query = query.eq('farmer_type', filters.type);
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

  const responseData: PaginatedResponse<Farmer> = {
    data: data as Farmer[],
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
 * Get farmer by ID
 */
export const getFarmerById = async (
  farmerId: string
): Promise<ApiResponse<Farmer>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARMERS)
    .select(FARMER_LIST_COLUMNS)
    .eq('id', farmerId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Farmer,
    error: null,
    success: true,
  };
};

/**
 * Get farmer by slug
 */
export const getFarmerBySlug = async (
  slug: string
): Promise<ApiResponse<Farmer>> => {
  const cacheKey = `farmer:slug:${slug}`;
  const cached = await getOfflineCacheAsync<Farmer>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Agriculteur indisponible hors ligne (non mis en cache).' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARMERS)
    .select(FARMER_LIST_COLUMNS)
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
    await setOfflineCacheAsync(cacheKey, data as Farmer);
  }

  return {
    data: data as Farmer,
    error: null,
    success: true,
  };
};

/**
 * Get farmer by user ID
 */
export const getFarmerByUserId = async (
  userId: string
): Promise<ApiResponse<Farmer>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARMERS)
    .select(FARMER_LIST_COLUMNS)
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
    data: data as Farmer,
    error: null,
    success: true,
  };
};

/**
 * Create a new farmer
 */
export const createFarmer = async (
  farmerData: Omit<Farmer, 'id' | 'created_at' | 'updated_at' | 'rating' | 'total_reviews' | 'slug'>
): Promise<ApiResponse<Farmer>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARMERS)
    .insert({
      ...farmerData,
      rating: 0,
      total_reviews: 0,
      is_verified: farmerData.is_verified ?? false,
      is_active: farmerData.is_active ?? false,
    })
    .select(FARMER_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Farmer,
    error: null,
    success: true,
  };
};

/**
 * Update farmer
 */
export const updateFarmer = async (
  farmerId: string,
  updates: Partial<Farmer>
): Promise<ApiResponse<Farmer>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARMERS)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', farmerId)
    .select(FARMER_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Farmer,
    error: null,
    success: true,
  };
};

/**
 * Search farmers by name or location
 */
export const searchFarmers = async (
  query: string,
  city?: GabonCity
): Promise<ApiResponse<Farmer[]>> => {
  const cacheKey = `farmers:search:query:${query}:city:${city || 'all'}`;
  const cached = await getOfflineCacheAsync<Farmer[]>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

  if (isBrowserOffline()) {
    if (cached) {
      return { data: cached, error: null, success: true };
    }
    return {
      data: null,
      error: { code: 'OFFLINE_NO_CACHE', message: 'Recherche agriculteurs indisponible hors ligne (pas de cache).' },
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
    .from(DB_TABLES.FARMERS)
    .select(FARMER_LIST_COLUMNS)
    .or(`farm_name.ilike.%${query}%,quartier.ilike.%${query}%`)
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

  await setOfflineCacheAsync(cacheKey, data as Farmer[]);

  return {
    data: data as Farmer[],
    error: null,
    success: true,
  };
};
