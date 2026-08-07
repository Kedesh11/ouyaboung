// ============================================
// Drivers API - Driver Directory Operations
// ouyaboung Platform - Chauffeurs / livraison
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type { ApiResponse, Driver } from '@/types';

const DRIVER_LIST_COLUMNS =
  'id,user_id,full_name,vehicle_type,plate_number,phone,email,photo_url,city,delivery_zone,rating,total_reviews,is_verified,is_active,is_refused,validated_at,refused_at,refusal_reason,created_at,updated_at';

/**
 * Get driver by ID
 */
export const getDriverById = async (
  driverId: string
): Promise<ApiResponse<Driver>> => {
  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DRIVERS)
    .select(DRIVER_LIST_COLUMNS)
    .eq('id', driverId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Driver,
    error: null,
    success: true,
  };
};

/**
 * Get driver by user ID
 */
export const getDriverByUserId = async (
  userId: string
): Promise<ApiResponse<Driver>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DRIVERS)
    .select(DRIVER_LIST_COLUMNS)
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
    data: data as Driver,
    error: null,
    success: true,
  };
};

/**
 * Create a new driver
 */
export const createDriver = async (
  driverData: Omit<Driver, 'id' | 'created_at' | 'updated_at' | 'rating' | 'total_reviews'>
): Promise<ApiResponse<Driver>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DRIVERS)
    .insert({
      ...driverData,
      rating: 0,
      total_reviews: 0,
      is_verified: driverData.is_verified ?? false,
      is_active: driverData.is_active ?? false,
    })
    .select(DRIVER_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Driver,
    error: null,
    success: true,
  };
};

/**
 * Update driver
 */
export const updateDriver = async (
  driverId: string,
  updates: Partial<Driver>
): Promise<ApiResponse<Driver>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.DRIVERS)
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId)
    .select(DRIVER_LIST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as Driver,
    error: null,
    success: true,
  };
};
