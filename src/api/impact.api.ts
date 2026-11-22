// ============================================
// Impact API - Environmental & Social Impact
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type { 
  ApiResponse, 
  UserImpact, 
  MerchantImpact 
} from '@/types';
import {
  AVG_MEAL_WEIGHT_KG,
  mealsToCo2Kg,
} from '@/lib/impactCalculations';

/**
 * Get monthly impact for a user (last N months)
 */
export const getUserMonthlyImpact = async (
  userId: string,
  months: number = 4
): Promise<ApiResponse<Array<{ month: string; meals: number; co2: number }>>> => {
  if (!isSupabaseConfigured()) {
    // Return mock last `months` months
    const now = new Date();
    const res: Array<{ month: string; meals: number; co2: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('fr-FR', { month: 'short' });
      const meals = Math.floor(Math.random() * 10) + 1;
      res.push({ month: monthLabel, meals, co2: Math.round(mealsToCo2Kg(meals)) });
    }
    return { data: res, error: null, success: true };
  }

  const client = requireSupabaseClient();

  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString();

    const { data: orders, error } = await client
      .from(DB_TABLES.ORDERS)
      .select('quantity, created_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', start);

    if (error) throw error;

    // group by year-month
    const buckets: Record<string, { meals: number }> = {};
    orders?.forEach((o: any) => {
      const date = new Date(o.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) buckets[key] = { meals: 0 };
      buckets[key].meals += o.quantity || 0;
    });

    const result: Array<{ month: string; meals: number; co2: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const meals = buckets[key]?.meals || 0;
      const monthLabel = d.toLocaleString('fr-FR', { month: 'short' });
      const co2 = Math.round(mealsToCo2Kg(meals));
      result.push({ month: monthLabel, meals, co2 });
    }

    return { data: result, error: null, success: true };
  } catch (error: any) {
    return { data: null, error: { code: 'FETCH_ERROR', message: error.message }, success: false };
  }
};

/**
 * Get user impact statistics
 */
export const getUserImpact = async (
  userId: string
): Promise<ApiResponse<UserImpact>> => {
  if (!isSupabaseConfigured()) {
    // Return mock data
    const mockTotalMeals = 50;
    return {
      data: {
        user_id: userId,
        food_saved_kg: 25,
        money_saved_xaf: 17500,
        co2_avoided_kg: Math.round(mealsToCo2Kg(mockTotalMeals) * 10) / 10,
        orders_count: 20,
        total_meals_saved: mockTotalMeals,
        favorite_merchants: [],
      },
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();

  try {
    // Get user's completed orders
    const { data: orders, error: ordersError } = await client
      .from(DB_TABLES.ORDERS)
      .select('quantity, savings, merchant_id')
      .eq('user_id', userId)
      .eq('status', 'completed');

    if (ordersError) throw ordersError;

    // Calculate impact
    const totalMeals = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
    const totalSavings = orders?.reduce((sum, o) => sum + (o.savings || 0), 0) || 0;
    const totalFoodKg = totalMeals * AVG_MEAL_WEIGHT_KG;
    const totalCO2 = mealsToCo2Kg(totalMeals);

    // Get most frequented merchants
    const merchantCounts = orders?.reduce((acc, o) => {
      acc[o.merchant_id] = (acc[o.merchant_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const topMerchants = Object.entries(merchantCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([id]) => id);

    return {
      data: {
        user_id: userId,
        food_saved_kg: Math.round(totalFoodKg * 10) / 10,
        money_saved_xaf: totalSavings,
        co2_avoided_kg: Math.round(totalCO2 * 10) / 10,
        orders_count: orders?.length || 0,
        total_meals_saved: totalMeals,
        favorite_merchants: topMerchants,
      },
      error: null,
      success: true,
    };
  } catch (error: any) {
    return {
      data: null,
      error: { code: 'FETCH_ERROR', message: error.message },
      success: false,
    };
  }
};

/**
 * Get merchant impact statistics
 */
export const getMerchantImpact = async (
  merchantId: string
): Promise<ApiResponse<MerchantImpact>> => {
  if (!isSupabaseConfigured()) {
    // Return mock data
    const mockTotalMeals = 300;
    return {
      data: {
        merchant_id: merchantId,
        food_saved_kg: 150,
        revenue_from_waste_xaf: 525000,
        co2_avoided_kg: Math.round(mealsToCo2Kg(mockTotalMeals)),
        orders_fulfilled: 300,
        total_meals_saved: mockTotalMeals,
        average_rating: 4.5,
        waste_reduction_rate: 78,
      },
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();

  try {
    // Get merchant's completed orders
    const { data: orders, error: ordersError } = await client
      .from(DB_TABLES.ORDERS)
      .select('quantity, total_price')
      .eq('merchant_id', merchantId)
      .eq('status', 'completed');

    if (ordersError) throw ordersError;

    // Get merchant rating
    const { data: merchant, error: merchantError } = await client
      .from(DB_TABLES.MERCHANTS)
      .select('rating')
      .eq('id', merchantId)
      .maybeSingle();

    if (merchantError) throw merchantError;

    // Calculate impact
    const totalMeals = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
    const totalRevenue = orders?.reduce((sum, o) => sum + (o.total_price || 0), 0) || 0;
    const totalFoodKg = totalMeals * AVG_MEAL_WEIGHT_KG;
    const totalCO2 = mealsToCo2Kg(totalMeals);

    return {
      data: {
        merchant_id: merchantId,
        food_saved_kg: Math.round(totalFoodKg * 10) / 10,
        revenue_from_waste_xaf: totalRevenue,
        co2_avoided_kg: Math.round(totalCO2 * 10) / 10,
        orders_fulfilled: orders?.length || 0,
        total_meals_saved: totalMeals,
        average_rating: merchant?.rating || 0,
        waste_reduction_rate: 75, // Would need more data to calculate properly
      },
      error: null,
      success: true,
    };
  } catch (error: any) {
    return {
      data: null,
      error: { code: 'FETCH_ERROR', message: error.message },
      success: false,
    };
  }
};

