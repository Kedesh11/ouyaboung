// ============================================
// Farm Products API - Catalogue Agricole Management
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';

import type { ApiResponse, FarmProduct, CreateFarmProductInput } from '@/types';

const FARM_PRODUCT_LIST_COLUMNS =
  'id,farmer_id,name,description,category,unit,price_per_unit,quantity_available,available_from,available_until,image_url,images,is_available,slug,created_at,updated_at';

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

