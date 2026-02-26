// ============================================
// Users API - User Management Operations
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';

import type { ApiResponse, UserProfile, UserPreferences, UserImpact } from '@/types';

/**
 * Get user profile by ID
 */
export const getUserProfile = async (
  userId: string
): Promise<ApiResponse<UserProfile>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data: profileByUserId, error: userIdError } = await client
    .from(DB_TABLES.PROFILES)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (userIdError) {
    return {
      data: null,
      error: { code: userIdError.code, message: userIdError.message },
      success: false,
    };
  }

  if (profileByUserId) {
    return {
      data: profileByUserId as UserProfile,
      error: null,
      success: true,
    };
  }

  const { data, error } = await client
    .from(DB_TABLES.PROFILES)
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as UserProfile,
    error: null,
    success: true,
  };
};

/**
 * Update user profile
 */
export const updateUserProfile = async (
  userId: string,
  updates: Partial<UserProfile>
): Promise<ApiResponse<UserProfile>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data: existingProfile, error: profileCheckError } = await client
    .from(DB_TABLES.PROFILES)
    .select('id, user_id, email, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (profileCheckError) {
    return {
      data: null,
      error: { code: profileCheckError.code, message: profileCheckError.message },
      success: false,
    };
  }

  const { data: authUser } = await client.auth.getUser();
  const email = updates.email || existingProfile?.email || authUser?.user?.email || '';
  const role =
    (updates.role as UserProfile['role']) ||
    (existingProfile?.role as UserProfile['role']) ||
    (authUser?.user?.user_metadata?.role as UserProfile['role']) ||
    'user';

  // Prepare payload without id first
  const payload = {
    user_id: userId,
    email,
    role,
    ...updates,
    updated_at: new Date().toISOString(),
  } as Partial<UserProfile> & { user_id: string; email: string; role: UserProfile['role'] };

  let data, error;

  if (existingProfile?.id) {
    // Update existing profile
    const result = await client
      .from(DB_TABLES.PROFILES)
      .update(payload)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    data = result.data;
    error = result.error;
  } else {
    // Insert new profile
    // Note: If user_id is the PK, we might need to set id: userId. 
    // Assuming id is auto-generated UUID or matches user_id. 
    // Let's rely on default behavior.
    const result = await client
      .from(DB_TABLES.PROFILES)
      .insert(payload)
      .select('*')
      .maybeSingle();
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error("Error in updateUserProfile:", error);
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as UserProfile,
    error: null,
    success: true,
  };
};

/**
 * Get user preferences
 */
export const getUserPreferences = async (
  userId: string
): Promise<ApiResponse<UserPreferences>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.PROFILES)
    .select('preferences')
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
    data: data?.preferences as UserPreferences,
    error: null,
    success: true,
  };
};

/**
 * Update user preferences
 */
export const updateUserPreferences = async (
  userId: string,
  preferences: Partial<UserPreferences>
): Promise<ApiResponse<UserPreferences>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();

  // First get current preferences
  const { data: current } = await client
    .from(DB_TABLES.PROFILES)
    .select('id, preferences')
    .eq('user_id', userId)
    .maybeSingle();

  if (!current?.id) {
    return {
      data: null,
      error: { code: 'NOT_FOUND', message: 'Profile not found' },
      success: false,
    };
  }

  const updatedPreferences = {
    ...current?.preferences,
    ...preferences,
  };

  const { error } = await client
    .from(DB_TABLES.PROFILES)
    .update({ preferences: updatedPreferences, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .throwOnError();

  const { data, error: selectErr } = await client
    .from(DB_TABLES.PROFILES)
    .select('preferences')
    .eq('id', current.id)
    .maybeSingle();

  return {
    data: (data?.preferences ?? updatedPreferences) as UserPreferences,
    error: selectErr ? { code: selectErr.code, message: selectErr.message } : null,
    success: true,
  };
};

/**
 * Get user's favorite merchants
 */
export const getUserFavorites = async (
  userId: string
): Promise<ApiResponse<string[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FAVORITES)
    .select('merchant_id')
    .eq('user_id', userId);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data?.map((f) => f.merchant_id) || [],
    error: null,
    success: true,
  };
};

/**
 * Add merchant to favorites
 */
export const addToFavorites = async (
  userId: string,
  merchantId: string
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
    .from(DB_TABLES.FAVORITES)
    .insert({ user_id: userId, merchant_id: merchantId });

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
 * Remove merchant from favorites
 */
export const removeFromFavorites = async (
  userId: string,
  merchantId: string
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
    .from(DB_TABLES.FAVORITES)
    .delete()
    .eq('user_id', userId)
    .eq('merchant_id', merchantId);

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
 * Get user impact statistics
 */
export const getUserImpact = async (
  userId: string
): Promise<ApiResponse<UserImpact>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.IMPACT_LOGS)
    .select('*')
    .eq('user_id', userId);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Aggregate impact data
  const impact: UserImpact = {
    user_id: userId,
    food_saved_kg: data?.reduce((sum, log) => sum + (log.food_saved_kg || 0), 0) || 0,
    money_saved_xaf: data?.reduce((sum, log) => sum + (log.money_saved_xaf || 0), 0) || 0,
    co2_avoided_kg: data?.reduce((sum, log) => sum + (log.co2_avoided_kg || 0), 0) || 0,
    orders_count: data?.length || 0,
    favorite_merchants: [],
  };

  return {
    data: impact,
    error: null,
    success: true,
  };
};

/**
 * Get user profile by auth user id (user_id column)
 */
export const getUserProfileByUserId = async (
  userId: string
): Promise<ApiResponse<UserProfile>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: null,
      error: { code: 'NOT_CONFIGURED', message: 'Supabase is not configured' },
      success: false,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.PROFILES)
    .select('*')
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
    data: data as UserProfile,
    error: null,
    success: true,
  };
};
