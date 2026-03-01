// ============================================
// Pricing API - Dynamic Pricing Operations
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { supabaseClient, requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES, API_ROUTES } from './routes';
import type { 
  ApiResponse, 
  PricingRecommendation,
  FoodCategory 
} from '@/types';

/**
 * Get pricing recommendation for a food item
 * Uses AI service to calculate optimal price
 */
export const getPricingRecommendation = async (
  itemData: {
    name: string;
    category: FoodCategory;
    original_price: number;
    expiry_date?: string;
    quantity: number;
    merchant_city?: string;
  }
): Promise<ApiResponse<PricingRecommendation>> => {
  if (!isSupabaseConfigured()) {
    // Return mock recommendation when Supabase not configured
    const mockRecommendation = calculateMockRecommendation(itemData);
    return {
      data: mockRecommendation,
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();
  
  try {
    // Call AI pricing edge function
    const { data, error } = await client.functions.invoke(
      API_ROUTES.EDGE_FUNCTIONS.PRICING,
      {
        body: {
          action: 'recommend',
          data: itemData,
        },
      }
    );

    if (error) {
      // Fallback to mock calculation
      const mockRecommendation = calculateMockRecommendation(itemData);
      return {
        data: mockRecommendation,
        error: null,
        success: true,
      };
    }

    return {
      data: data as PricingRecommendation,
      error: null,
      success: true,
    };
  } catch {
    // Fallback to mock calculation
    const mockRecommendation = calculateMockRecommendation(itemData);
    return {
      data: mockRecommendation,
      error: null,
      success: true,
    };
  }
};

/**
 * Calculate discount based on time to expiry
 */
export const calculateTimeBasedDiscount = async (
  originalPrice: number,
  expiryDate: string
): Promise<ApiResponse<{ recommended_price: number; discount_percentage: number }>> => {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const hoursUntilExpiry = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60);

  let discountPercentage: number;

  if (hoursUntilExpiry <= 2) {
    discountPercentage = 70; // 70% off if 2 hours or less
  } else if (hoursUntilExpiry <= 6) {
    discountPercentage = 60; // 60% off if 6 hours or less
  } else if (hoursUntilExpiry <= 12) {
    discountPercentage = 50; // 50% off if 12 hours or less
  } else if (hoursUntilExpiry <= 24) {
    discountPercentage = 40; // 40% off if 24 hours or less
  } else if (hoursUntilExpiry <= 48) {
    discountPercentage = 30; // 30% off if 48 hours or less
  } else {
    discountPercentage = 20; // Default 20% off
  }

  const recommendedPrice = Math.round(originalPrice * (1 - discountPercentage / 100));

  return {
    data: {
      recommended_price: recommendedPrice,
      discount_percentage: discountPercentage,
    },
    error: null,
    success: true,
  };
};

/**
 * Get pricing history for an item
 */
export const getPricingHistory = async (
  itemId: string
): Promise<ApiResponse<PricingRecommendation[]>> => {
  if (!isSupabaseConfigured()) {
    return {
      data: [],
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.PRICING_HISTORY)
    .select('food_item_id,original_price,recommended_price,discount_percentage,confidence_score,factors,created_at')
    .eq('food_item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  return {
    data: data as PricingRecommendation[],
    error: null,
    success: true,
  };
};

/**
 * Save pricing recommendation to history
 */
export const savePricingRecommendation = async (
  recommendation: PricingRecommendation
): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null, success: true };
  }

  const client = requireSupabaseClient();
  const { error } = await client
    .from(DB_TABLES.PRICING_HISTORY)
    .insert(recommendation);

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
 * Get average discount by category
 */
export const getAverageDiscountByCategory = async (): Promise<
  ApiResponse<{ category: FoodCategory; avg_discount: number }[]>
> => {
  if (!isSupabaseConfigured()) {
    // Return mock data
    return {
      data: [
        { category: 'bread_pastry', avg_discount: 45 },
        { category: 'prepared_meals', avg_discount: 50 },
        { category: 'fruits_vegetables', avg_discount: 40 },
        { category: 'dairy', avg_discount: 35 },
        { category: 'mixed_basket', avg_discount: 55 },
      ],
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();
  const { data, error } = await client
    .from(DB_TABLES.FOOD_ITEMS)
    .select('category, discount_percentage');

  if (error) {
    return {
      data: null,
      error: { code: error.code, message: error.message },
      success: false,
    };
  }

  // Calculate averages by category
  const categoryStats = data?.reduce((acc, item: any) => {
    if (!acc[item.category]) {
      acc[item.category] = { total: 0, count: 0 };
    }
    acc[item.category].total += item.discount_percentage || 0;
    acc[item.category].count += 1;
    return acc;
  }, {} as Record<string, { total: number; count: number }>) || {};

  const result = Object.entries(categoryStats).map(([category, stats]: [string, any]) => ({
    category: category as FoodCategory,
    avg_discount: Math.round(stats.total / stats.count),
  }));

  return {
    data: result,
    error: null,
    success: true,
  };
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate mock pricing recommendation (for when AI service unavailable)
 */
function calculateMockRecommendation(itemData: {
  name: string;
  category: FoodCategory;
  original_price: number;
  expiry_date?: string;
  quantity: number;
}): PricingRecommendation {
  // Base discount by category
  const categoryDiscounts: Record<FoodCategory, number> = {
    bread_pastry: 50,
    prepared_meals: 45,
    fruits_vegetables: 40,
    dairy: 35,
    meat_fish: 50,
    beverages: 30,
    snacks: 35,
    mixed_basket: 55,
    other: 40,
  };

  let baseDiscount = categoryDiscounts[itemData.category] || 40;

  // Adjust for expiry
  if (itemData.expiry_date) {
    const hoursUntilExpiry = 
      (new Date(itemData.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60);
    
    if (hoursUntilExpiry <= 6) {
      baseDiscount = Math.min(70, baseDiscount + 20);
    } else if (hoursUntilExpiry <= 12) {
      baseDiscount = Math.min(65, baseDiscount + 15);
    } else if (hoursUntilExpiry <= 24) {
      baseDiscount = Math.min(60, baseDiscount + 10);
    }
  }

  // Adjust for quantity (more stock = higher discount)
  if (itemData.quantity > 10) {
    baseDiscount = Math.min(70, baseDiscount + 5);
  }

  const recommendedPrice = Math.round(
    itemData.original_price * (1 - baseDiscount / 100)
  );

  return {
    food_item_id: '',
    original_price: itemData.original_price,
    recommended_price: recommendedPrice,
    discount_percentage: baseDiscount,
    confidence_score: 0.75,
    factors: [
      {
        name: 'Catégorie',
        impact: 'neutral',
        weight: 0.3,
        description: `Réduction typique pour ${itemData.category}`,
      },
      {
        name: 'Fraîcheur',
        impact: itemData.expiry_date ? 'negative' : 'neutral',
        weight: 0.4,
        description: 'Basé sur la date de péremption',
      },
      {
        name: 'Stock',
        impact: itemData.quantity > 5 ? 'negative' : 'positive',
        weight: 0.3,
        description: `${itemData.quantity} unités disponibles`,
      },
    ],
    created_at: new Date().toISOString(),
  };
}
