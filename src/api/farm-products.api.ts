// ============================================
// Farm Products API - Catalogue Agricole Management
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import {
  DEFAULT_OFFLINE_CACHE_TTL_MS,
  getOfflineCacheAsync,
  isBrowserOffline,
  setOfflineCacheAsync,
} from '@/lib/offline/cache';
import type { ApiResponse, FarmProduct, CreateFarmProductInput } from '@/types';

const FARMER_LIST_COLUMNS =
  'id,user_id,farm_name,farmer_type,description,logo_url,cover_image_url,address,city,quartier,latitude,longitude,phone,email,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,slug,created_at,updated_at';
const FARM_PRODUCT_LIST_COLUMNS =
  'id,farmer_id,name,description,category,unit,price_per_unit,quantity_available,available_from,available_until,image_url,images,is_available,slug,created_at,updated_at';

const toOne = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

/**
 * Get farm product by ID
 */
export const getFarmProductById = async (
  itemId: string
): Promise<ApiResponse<FarmProduct>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARM_PRODUCTS)
    .select(FARM_PRODUCT_LIST_COLUMNS)
    .eq('id', itemId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FarmProduct,
    error: null,
    success: true,
  };
};

/**
 * Get farm product by slug (public detail page), joined with its farmer
 */
export const getFarmProductBySlug = async (
  slug: string
): Promise<ApiResponse<FarmProduct>> => {
  const cacheKey = `farm-products:item:slug:${slug}`;
  const cached = await getOfflineCacheAsync<FarmProduct>(cacheKey, DEFAULT_OFFLINE_CACHE_TTL_MS);

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
    .from(DB_TABLES.FARM_PRODUCTS)
    .select(`${FARM_PRODUCT_LIST_COLUMNS}, farmers(${FARMER_LIST_COLUMNS})`)
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
    farmer: toOne((data as any).farmers),
  } : null;

  if (item) {
    await setOfflineCacheAsync(cacheKey, item as FarmProduct);
  }

  return {
    data: item as FarmProduct,
    error: null,
    success: true,
  };
};

/**
 * Get farm products by farmer
 */
export const getFarmProductsByFarmer = async (
  farmerId: string,
  includeUnavailable: boolean = false
): Promise<ApiResponse<FarmProduct[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  if (!includeUnavailable) {
    const { data: farmer, error: farmerError } = await client
      .from(DB_TABLES.FARMERS)
      .select('is_verified, is_active')
      .eq('id', farmerId)
      .maybeSingle();

    if (farmerError || !farmer || !farmer.is_verified || !farmer.is_active) {
      return {
        data: [],
        error: null,
        success: true,
      };
    }
  }

  let query = client
    .from(DB_TABLES.FARM_PRODUCTS)
    .select(FARM_PRODUCT_LIST_COLUMNS)
    .eq('farmer_id', farmerId);

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
    data: data as FarmProduct[],
    error: null,
    success: true,
  };
};

/**
 * Create a new farm product
 */
export const createFarmProduct = async (
  farmerId: string,
  itemData: CreateFarmProductInput
): Promise<ApiResponse<FarmProduct>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  const { data: farmer, error: farmerError } = await client
    .from(DB_TABLES.FARMERS)
    .select('id, is_verified, is_active, is_refused')
    .eq('id', farmerId)
    .maybeSingle();

  if (farmerError || !farmer) {
    return {
      data: null,
      error: { code: 'FARMER_NOT_FOUND', message: 'Exploitation introuvable' },
      success: false,
    };
  }

  if (!farmer.is_verified || !farmer.is_active || farmer.is_refused) {
    return {
      data: null,
      error: {
        code: 'FARMER_NOT_APPROVED',
        message: 'Votre exploitation doit être approuvée par un administrateur avant l’ajout de produits.',
      },
      success: false,
    };
  }

  const { data, error } = await client
    .from(DB_TABLES.FARM_PRODUCTS)
    .insert({
      farmer_id: farmerId,
      ...itemData,
      is_available: true,
    })
    .select(FARM_PRODUCT_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FarmProduct,
    error: null,
    success: true,
  };
};

/**
 * Update farm product
 */
export const updateFarmProduct = async (
  itemId: string,
  updates: Partial<FarmProduct>
): Promise<ApiResponse<FarmProduct>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FARM_PRODUCTS)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itemId)
    .select(FARM_PRODUCT_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as FarmProduct,
    error: null,
    success: true,
  };
};

/**
 * Delete farm product
 */
export const deleteFarmProduct = async (
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
    .from(DB_TABLES.FARM_PRODUCTS)
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
