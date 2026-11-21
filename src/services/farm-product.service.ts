// ============================================
// Farm Product Service - Catalogue Agricole Business Logic
// ouyaboung Platform - Répertoire des agriculteurs
// ============================================

import {
  getFarmProductsByFarmer,
  createFarmProduct,
  updateFarmProduct,
} from '@/api';
import type {
  ApiResponse,
  FarmProduct,
  FarmProductCategory,
  CreateFarmProductInput,
} from '@/types';

/**
 * Get all products for a farmer
 */
export const getFarmerItems = async (
  farmerId: string,
  includeUnavailable: boolean = false
): Promise<ApiResponse<FarmProduct[]>> => {
  return getFarmProductsByFarmer(farmerId, includeUnavailable);
};

/**
 * Create a new farm product listing
 */
export const createListing = async (
  farmerId: string,
  data: {
    name: string;
    description?: string;
    category: FarmProductCategory;
    unit: string;
    pricePerUnit: number;
    quantity: number;
    availableFrom?: string;
    availableUntil?: string;
    imageUrl?: string;
    images?: string[];
  }
): Promise<ApiResponse<FarmProduct>> => {
  const input: CreateFarmProductInput = {
    name: data.name,
    description: data.description,
    category: data.category,
    unit: data.unit,
    price_per_unit: data.pricePerUnit,
    quantity_available: data.quantity,
    available_from: data.availableFrom,
    available_until: data.availableUntil,
    image_url: data.imageUrl,
    images: data.images,
  };

  return createFarmProduct(farmerId, input);
};

/**
 * Update an existing farm product
 */
export const updateListing = async (
  itemId: string,
  data: {
    name?: string;
    description?: string;
    category?: FarmProductCategory;
    unit?: string;
    pricePerUnit?: number;
    quantity?: number;
    availableFrom?: string;
    availableUntil?: string;
    imageUrl?: string;
    images?: string[];
    isAvailable?: boolean;
  }
): Promise<ApiResponse<FarmProduct>> => {
  const updates: Partial<FarmProduct> = {
    name: data.name,
    description: data.description,
    category: data.category,
    unit: data.unit,
    price_per_unit: data.pricePerUnit,
    quantity_available: data.quantity,
    available_from: data.availableFrom,
    available_until: data.availableUntil,
    image_url: data.imageUrl,
    images: data.images,
    is_available: data.isAvailable,
  };

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateFarmProduct(itemId, updates);
};

/**
 * Get category display name
 */
export const getCategoryName = (category: FarmProductCategory): string => {
  const names: Record<FarmProductCategory, string> = {
    tubercules: 'Tubercules (manioc, igname...)',
    legumes_feuilles: 'Légumes & feuilles',
    fruits: 'Fruits',
    cereales: 'Céréales',
    elevage_volaille: 'Volaille',
    elevage_betail: 'Bétail',
    peche: 'Pêche',
    autre: 'Autre',
  };
  return names[category] || category;
};

/**
 * Format price per unit in XAF
 */
export const formatPricePerUnit = (priceXaf: number, unit: string): string => {
  return `${priceXaf.toLocaleString()} XAF / ${unit}`;
};

