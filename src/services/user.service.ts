// ============================================
// User Service - User Management Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  getUserProfile,
  getUserProfileByUserId,
  updateUserProfile,
  getUserPreferences,
  updateUserPreferences,
  getUserFavorites,
  addToFavorites,
  removeFromFavorites,
  getUserImpact,
} from '@/api';
import type { ApiResponse, UserProfile, UserPreferences, UserImpact, UserLocationPreference } from '@/types';

/**
 * Get user profile by ID
 */
export const getProfile = async (userId: string): Promise<ApiResponse<UserProfile>> => {
  // First try by profile id
  const resp = await getUserProfile(userId);
  if (resp?.success && resp.data) return resp;

  // Fallback: try to fetch by auth user id
  return getUserProfileByUserId(userId);
};

/**
 * Update user profile
 */
export const updateProfile = async (
  userId: string,
  data: {
    fullName?: string;
    phone?: string;
    address?: string;
    city?: string;
    quartier?: string;
    avatarUrl?: string;
  }
): Promise<ApiResponse<UserProfile>> => {
  const updates: Partial<UserProfile> = {
    full_name: data.fullName,
    phone: data.phone,
    address: data.address,
    city: data.city,
    quartier: data.quartier,
    avatar_url: data.avatarUrl,
  };
  
  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateUserProfile(userId, updates);
};

/**
 * Get user notification preferences
 */
export const getNotificationPreferences = async (
  userId: string
): Promise<ApiResponse<UserPreferences>> => {
  return getUserPreferences(userId);
};

/**
 * Update user notification preferences
 */
export const updateNotificationPreferences = async (
  userId: string,
  preferences: {
    notificationsEnabled?: boolean;
    emailNotifications?: boolean;
    smsNotifications?: boolean;
    maxDistanceKm?: number;
    favoriteCategories?: string[];
  }
): Promise<ApiResponse<UserPreferences>> => {
  const updates: Partial<UserPreferences> = {
    notifications_enabled: preferences.notificationsEnabled,
    email_notifications: preferences.emailNotifications,
    sms_notifications: preferences.smsNotifications,
    max_distance_km: preferences.maxDistanceKm,
    favorite_categories: preferences.favoriteCategories,
  };

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateUserPreferences(userId, updates);
};

/**
 * Update location-related user preferences.
 */
export const updateUserLocationSettings = async (
  userId: string,
  preferences: {
    locationEnabled?: boolean;
    defaultRadiusKm?: number;
    lastKnownLocation?: UserLocationPreference | null;
  }
): Promise<ApiResponse<UserPreferences>> => {
  const updates: Partial<UserPreferences> = {
    location_enabled: preferences.locationEnabled,
    default_radius_km: preferences.defaultRadiusKm,
    max_distance_km: preferences.defaultRadiusKm,
    last_known_location: preferences.lastKnownLocation,
  };

  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateUserPreferences(userId, updates);
};

/**
 * Get user's favorite merchants
 */
export const getFavorites = async (userId: string): Promise<ApiResponse<string[]>> => {
  return getUserFavorites(userId);
};

/**
 * Add a merchant to favorites
 */
export const addFavorite = async (
  userId: string,
  merchantId: string
): Promise<ApiResponse<null>> => {
  return addToFavorites(userId, merchantId);
};

/**
 * Remove a merchant from favorites
 */
export const removeFavorite = async (
  userId: string,
  merchantId: string
): Promise<ApiResponse<null>> => {
  return removeFromFavorites(userId, merchantId);
};

/**
 * Toggle favorite status
 */
export const toggleFavorite = async (
  userId: string,
  merchantId: string,
  isFavorite: boolean
): Promise<ApiResponse<null>> => {
  if (isFavorite) {
    return removeFromFavorites(userId, merchantId);
  }
  return addToFavorites(userId, merchantId);
};

/**
 * Get user's environmental impact statistics
 */
export const getImpactStats = async (userId: string): Promise<ApiResponse<UserImpact>> => {
  return getUserImpact(userId);
};

/**
 * Format user impact for display
 */
export const formatImpactForDisplay = (impact: UserImpact) => {
  return {
    foodSaved: `${impact.food_saved_kg.toFixed(1)} kg`,
    moneySaved: `${impact.money_saved_xaf.toLocaleString()} XAF`,
    co2Avoided: `${impact.co2_avoided_kg.toFixed(1)} kg`,
    ordersCount: impact.orders_count,
  };
};
