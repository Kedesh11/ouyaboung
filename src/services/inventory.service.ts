// ============================================
// Inventory Service - Food Items Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  getAvailableFoodItems,
  getFoodItemById,
  getFoodItemsByMerchant,
  createFoodItem,
  updateFoodItem,
  deleteFoodItem,
  searchFoodItems,
  getFoodCategories,
  updateFoodItemQuantity,
  getFoodItemBySlug,
} from '@/api';
import type {
  ApiResponse,
  FoodItem,
  FoodCategory,
  CreateFoodItemInput,
  PaginatedResponse,
  SearchFilters,
  GabonCity,
  MerchantType,
  BasketItem
} from '@/types';

/**
 * Get available food items with filters
 */
export const getAvailableItems = async (options?: {
  category?: FoodCategory;
  merchantId?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  perPage?: number;
}): Promise<ApiResponse<PaginatedResponse<FoodItem>>> => {
  const limit = options?.perPage || 20;
  const offset = ((options?.page || 1) - 1) * limit;

  return getAvailableFoodItems({
    category: options?.category,
    merchant_id: options?.merchantId,
    city: options?.city,
    min_price: options?.minPrice,
    max_price: options?.maxPrice,
    limit,
    offset,
  });
};

/**
 * Get food item by ID
 */
export const getItem = async (itemId: string): Promise<ApiResponse<FoodItem>> => {
  return getFoodItemById(itemId);
};

/**
 * Get food item by slug
 */
export const getItemBySlug = async (slug: string): Promise<ApiResponse<FoodItem>> => {
  return getFoodItemBySlug(slug);
};

/**
 * Get all items for a merchant
 */
export const getMerchantItems = async (
  merchantId: string,
  includeUnavailable: boolean = false
): Promise<ApiResponse<FoodItem[]>> => {
  return getFoodItemsByMerchant(merchantId, includeUnavailable);
};

/**
 * Create a new food item listing
 */
export const createListing = async (
  merchantId: string,
  data: {
    name: string;
    description?: string;
    category: FoodCategory;
    originalPrice: number;
    discountedPrice: number;
    quantity: number;
    pickupStart: string;
    pickupEnd: string;
    expiryDate?: string;
    imageUrl?: string;
    contents?: BasketItem[]; // Add missing import if needed, or rely on type inference if BasketItem is global or imported
  }
): Promise<ApiResponse<FoodItem>> => {
  const input: CreateFoodItemInput = {
    name: data.name,
    description: data.description,
    category: data.category,
    original_price: data.originalPrice,
    discounted_price: data.discountedPrice,
    quantity_available: data.quantity,
    pickup_start: data.pickupStart,
    pickup_end: data.pickupEnd,
    expiry_date: data.expiryDate,
    image_url: data.imageUrl,
    contents: data.contents,
  };

  return createFoodItem(merchantId, input);
};

/**
 * Update an existing food item
 */
export const updateListing = async (
  itemId: string,
  data: {
    name?: string;
    description?: string;
    category?: FoodCategory;
    originalPrice?: number;
    discountedPrice?: number;
    quantity?: number;
    pickupStart?: string;
    pickupEnd?: string;
    expiryDate?: string;
    imageUrl?: string;
    isAvailable?: boolean;
    contents?: BasketItem[];
  }
): Promise<ApiResponse<FoodItem>> => {
  const updates: Partial<FoodItem> = {
    name: data.name,
    description: data.description,
    category: data.category,
    original_price: data.originalPrice,
    discounted_price: data.discountedPrice,
    quantity_available: data.quantity,
    pickup_start: data.pickupStart,
    pickup_end: data.pickupEnd,
    expiry_date: data.expiryDate,
    image_url: data.imageUrl,
    is_available: data.isAvailable,
    contents: data.contents,
  };

  // Remove undefined values
  Object.keys(updates).forEach(key => {
    if (updates[key as keyof typeof updates] === undefined) {
      delete updates[key as keyof typeof updates];
    }
  });

  return updateFoodItem(itemId, updates);
};

/**
 * Delete a food item listing
 */
export const deleteListing = async (itemId: string): Promise<ApiResponse<null>> => {
  return deleteFoodItem(itemId);
};

/**
 * Search food items with advanced filters
 */
export const search = async (filters: {
  city?: GabonCity;
  quartier?: string;
  category?: FoodCategory;
  merchantType?: MerchantType;
  minPrice?: number;
  maxPrice?: number;
  maxDistanceKm?: number;
  userLatitude?: number;
  userLongitude?: number;
  pickupToday?: boolean;
  sortBy?: 'distance' | 'price' | 'discount' | 'rating';
}): Promise<ApiResponse<FoodItem[]>> => {
  const searchFilters: SearchFilters = {
    city: filters.city,
    quartier: filters.quartier,
    category: filters.category,
    merchant_type: filters.merchantType,
    min_price: filters.minPrice,
    max_price: filters.maxPrice,
    max_distance_km: filters.maxDistanceKm,
    user_latitude: filters.userLatitude,
    user_longitude: filters.userLongitude,
    pickup_today: filters.pickupToday,
    sort_by: filters.sortBy,
  };

  return searchFoodItems(searchFilters);
};

/**
 * Get categories with item counts
 */
export const getCategories = async (): Promise<ApiResponse<{ category: FoodCategory; count: number }[]>> => {
  return getFoodCategories();
};

/**
 * Update item quantity after reservation
 */
export const reserveQuantity = async (
  itemId: string,
  quantity: number
): Promise<ApiResponse<FoodItem>> => {
  return updateFoodItemQuantity(itemId, -quantity);
};

/**
 * Restore quantity after cancellation
 */
export const restoreQuantity = async (
  itemId: string,
  quantity: number
): Promise<ApiResponse<FoodItem>> => {
  return updateFoodItemQuantity(itemId, quantity);
};

/**
 * Get category display name
 */
export const getCategoryName = (category: FoodCategory): string => {
  const names: Record<FoodCategory, string> = {
    bread_pastry: 'Pains & Viennoiseries',
    prepared_meals: 'Plats préparés',
    fruits_vegetables: 'Fruits & Légumes',
    dairy: 'Produits laitiers',
    meat_fish: 'Viandes & Poissons',
    beverages: 'Boissons',
    snacks: 'Snacks',
    mixed_basket: 'Panier surprise',
    other: 'Autres',
  };
  return names[category] || category;
};

/**
 * Calculate savings percentage
 */
export const calculateSavings = (originalPrice: number, discountedPrice: number): number => {
  if (originalPrice <= 0) return 0;
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

/**
 * Format price in XAF
 */
export const formatPrice = (priceXaf: number): string => {
  return `${priceXaf.toLocaleString()} XAF`;
};

/**
 * Check if item is expiring soon (within 3 hours)
 */
export const isExpiringSoon = (expiryDate?: string): boolean => {
  if (!expiryDate) return false;
  const expiry = new Date(expiryDate);
  const now = new Date();
  const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntilExpiry <= 3 && hoursUntilExpiry > 0;
};

/**
 * Check if item pickup time has passed
 */
export const isPickupPassed = (pickupEnd: string): boolean => {
  const [hours, minutes] = pickupEnd.split(':').map(Number);
  const now = new Date();
  const pickupEndTime = new Date();
  pickupEndTime.setHours(hours, minutes, 0, 0);
  return now > pickupEndTime;
};
