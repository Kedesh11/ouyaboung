// ============================================
// Merchant Service - Merchant Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  getMerchants,
  getMerchantById,
  getMerchantByUserId,
  createMerchant,
  updateMerchant,
  getNearbyMerchants,
  getMerchantImpactApi,
  searchMerchants,
  getMerchantBySlug,
} from '@/api';
import type {
  ApiResponse,
  Merchant,
  MerchantType,
  MerchantImpact,
  PaginatedResponse,
  GabonCity,
  OpeningHours
} from '@/types';

/**
 * Get list of merchants with filters
 */
export const listMerchants = async (options?: {
  city?: GabonCity;
  type?: MerchantType;
  verifiedOnly?: boolean;
  activeOnly?: boolean;
  page?: number;
  perPage?: number;
}): Promise<ApiResponse<PaginatedResponse<Merchant>>> => {
  const limit = options?.perPage || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  return getMerchants({
    city: options?.city,
    type: options?.type,
    is_verified: options?.verifiedOnly ?? true,
    is_active: options?.activeOnly !== false, // Default to active only
    limit,
    offset,
  });
};

/**
 * Get merchant by ID
 */
export const getMerchant = async (merchantId: string): Promise<ApiResponse<Merchant>> => {
  return getMerchantById(merchantId);
};

/**
 * Get merchant profile for current user
 */
export const getMyMerchantProfile = async (userId: string): Promise<ApiResponse<Merchant>> => {
  return getMerchantByUserId(userId);
};

/**
 * Get merchant by slug
 */
export const getMerchantBySlugName = async (slug: string): Promise<ApiResponse<Merchant>> => {
  return getMerchantBySlug(slug);
};

/**
 * Register as a new merchant
 */
export const registerMerchant = async (data: {
  userId: string;
  businessName: string;
  businessType: MerchantType;
  description?: string;
  address: string;
  city: GabonCity;
  quartier: string;
  phone: string;
  email: string;
  latitude?: number;
  longitude?: number;
  openingHours?: OpeningHours;
}): Promise<ApiResponse<Merchant>> => {
  return createMerchant({
    user_id: data.userId,
    business_name: data.businessName,
    business_type: data.businessType,
    description: data.description,
    address: data.address,
    city: data.city,
    quartier: data.quartier,
    phone: data.phone,
    email: data.email,
    latitude: data.latitude,
    longitude: data.longitude,
    opening_hours: data.openingHours,
    is_verified: false,
    is_active: false,
    is_refused: false,
  });
};

/**
 * Update merchant profile
 */
export const updateMerchantProfile = async (
  merchantId: string,
  data: {
    businessName?: string;
    businessType?: MerchantType;
    description?: string;
    city?: GabonCity;
    quartier?: string;
    address?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    coverImageUrl?: string;
    openingHours?: OpeningHours;
    latitude?: number;
    longitude?: number;
    isActive?: boolean;
  }
): Promise<ApiResponse<Merchant>> => {
  const updates: Partial<Merchant> = {
    business_name: data.businessName,
    business_type: data.businessType,
    description: data.description,
    city: data.city,
    quartier: data.quartier,
    address: data.address,
    phone: data.phone,
    email: data.email,
    logo_url: data.logoUrl,
    cover_image_url: data.coverImageUrl,
    opening_hours: data.openingHours,
    latitude: data.latitude,
    longitude: data.longitude,
    is_active: data.isActive,
  };

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateMerchant(merchantId, updates);
};

/**
 * Find nearby merchants
 */
export const findNearbyMerchants = async (
  latitude: number,
  longitude: number,
  radiusKm: number = 5
): Promise<ApiResponse<Merchant[]>> => {
  return getNearbyMerchants(latitude, longitude, radiusKm);
};

/**
 * Search merchants by name or location
 */
export const search = async (
  query: string,
  city?: GabonCity
): Promise<ApiResponse<Merchant[]>> => {
  return searchMerchants(query, city);
};

/**
 * Get merchant's impact statistics
 */
export const getMerchantStats = async (
  merchantId: string
): Promise<ApiResponse<MerchantImpact>> => {
  return getMerchantImpactApi(merchantId);
};

/**
 * Format merchant impact for display
 */
export const formatMerchantImpact = (impact: MerchantImpact) => {
  return {
    foodSaved: `${impact.food_saved_kg.toFixed(1)} kg`,
    revenue: `${impact.revenue_from_waste_xaf.toLocaleString()} XAF`,
    co2Avoided: `${impact.co2_avoided_kg.toFixed(1)} kg`,
    ordersFulfilled: impact.orders_fulfilled,
    rating: impact.average_rating.toFixed(1),
    wasteReduction: `${impact.waste_reduction_rate}%`,
  };
};

/**
 * Check if merchant is open now
 */
export const isMerchantOpenNow = (merchant: Merchant): boolean => {
  if (!merchant.opening_hours) return true; // Assume open if no hours set

  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()] as keyof OpeningHours;

  const todayHours = merchant.opening_hours[today];
  if (!todayHours || todayHours.is_closed) return false;

  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

/**
 * Get merchant type display name
 */
export const getMerchantTypeName = (type: MerchantType): string => {
  const names: Record<MerchantType, string> = {
    restaurant: 'Restaurant',
    bakery: 'Boulangerie',
    grocery: 'Épicerie',
    supermarket: 'Supermarché',
    hotel: 'Hôtel',
    caterer: 'Traiteur',
    other: 'Autre',
  };
  return names[type] || type;
};
