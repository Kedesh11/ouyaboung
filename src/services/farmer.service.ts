// ============================================
// Farmer Service - Farmer Directory Business Logic
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import {
  getFarmers,
  getFarmerById,
  getFarmerByUserId,
  createFarmer,
  updateFarmer,
  searchFarmers,
  getFarmerBySlug,
} from '@/api';
import type {
  ApiResponse,
  Farmer,
  FarmerType,
  PaginatedResponse,
  GabonCity,
} from '@/types';

/**
 * Get list of farmers with filters
 */
export const listFarmers = async (options?: {
  city?: GabonCity;
  type?: FarmerType;
  verifiedOnly?: boolean;
  activeOnly?: boolean;
  page?: number;
  perPage?: number;
}): Promise<ApiResponse<PaginatedResponse<Farmer>>> => {
  const limit = options?.perPage || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  return getFarmers({
    city: options?.city,
    type: options?.type,
    is_verified: options?.verifiedOnly ?? true,
    is_active: options?.activeOnly !== false, // Default to active only
    limit,
    offset,
  });
};

/**
 * Get farmer by ID
 */
export const getFarmer = async (farmerId: string): Promise<ApiResponse<Farmer>> => {
  return getFarmerById(farmerId);
};

/**
 * Get farmer profile for current user
 */
export const getMyFarmerProfile = async (userId: string): Promise<ApiResponse<Farmer>> => {
  return getFarmerByUserId(userId);
};

/**
 * Get farmer by slug
 */
export const getFarmerBySlugName = async (slug: string): Promise<ApiResponse<Farmer>> => {
  return getFarmerBySlug(slug);
};

export const updateFarmerLogoByUserId = async (
  userId: string,
  logoUrl: string
): Promise<ApiResponse<Farmer>> => {
  const farmerResult = await getFarmerByUserId(userId);
  if (!farmerResult.success || !farmerResult.data) {
    return {
      data: null,
      error: farmerResult.error || { code: 'FARMER_NOT_FOUND', message: 'Profil agriculteur introuvable' },
      success: false,
    };
  }

  return updateFarmer(farmerResult.data.id, { logo_url: logoUrl });
};

/**
 * Register as a new farmer
 */
export const registerFarmer = async (data: {
  userId: string;
  farmName: string;
  farmerType: FarmerType;
  description?: string;
  address: string;
  city: GabonCity;
  quartier: string;
  phone: string;
  email: string;
  latitude?: number;
  longitude?: number;
}): Promise<ApiResponse<Farmer>> => {
  return createFarmer({
    user_id: data.userId,
    farm_name: data.farmName,
    farmer_type: data.farmerType,
    description: data.description,
    address: data.address,
    city: data.city,
    quartier: data.quartier,
    phone: data.phone,
    email: data.email,
    latitude: data.latitude,
    longitude: data.longitude,
    is_verified: false,
    is_active: false,
    is_refused: false,
  });
};

/**
 * Create a default farmer profile for an authenticated user (pending validation).
 */
export const createDefaultFarmerProfile = async (input: {
  userId: string;
  farmName: string;
  farmerType?: FarmerType;
  description?: string;
  address?: string;
  city?: GabonCity;
  quartier?: string;
  phone?: string;
  email?: string;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
}): Promise<ApiResponse<Farmer>> => {
  return createFarmer({
    user_id: input.userId,
    farm_name: input.farmName,
    farmer_type: input.farmerType || 'other',
    description: input.description || '',
    address: input.address || 'À compléter',
    city: input.city || 'Libreville',
    quartier: input.quartier || 'À compléter',
    phone: input.phone || 'À compléter',
    email: input.email || '',
    latitude: input.latitude ?? undefined,
    longitude: input.longitude ?? undefined,
    logo_url: input.logoUrl ?? undefined,
    is_verified: false,
    is_active: false,
    is_refused: false,
  });
};

/**
 * Update farmer profile
 */
export const updateFarmerProfile = async (
  farmerId: string,
  data: {
    farmName?: string;
    farmerType?: FarmerType;
    description?: string;
    city?: GabonCity;
    quartier?: string;
    address?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    coverImageUrl?: string;
    latitude?: number | null;
    longitude?: number | null;
    isActive?: boolean;
  }
): Promise<ApiResponse<Farmer>> => {
  const updates: Partial<Farmer> = {
    farm_name: data.farmName,
    farmer_type: data.farmerType,
    description: data.description,
    city: data.city,
    quartier: data.quartier,
    address: data.address,
    phone: data.phone,
    email: data.email,
    logo_url: data.logoUrl,
    cover_image_url: data.coverImageUrl,
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

  return updateFarmer(farmerId, updates);
};

/**
 * Search farmers by name or location
 */
export const search = async (
  query: string,
  city?: GabonCity
): Promise<ApiResponse<Farmer[]>> => {
  return searchFarmers(query, city);
};

/**
 * Get farmer type display name
 */
export const getFarmerTypeName = (type: FarmerType): string => {
  const names: Record<FarmerType, string> = {
    agriculture: 'Agriculture',
    elevage: 'Élevage',
    peche: 'Pêche',
    mixte: 'Mixte',
    other: 'Autre',
  };
  return names[type] || type;
};
