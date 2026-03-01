// ============================================
// Impact API - Environmental & Social Impact
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import { requireSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { DB_TABLES } from './routes';
import type { 
  ApiResponse, 
  ImpactStats, 
  UserImpact, 
  MerchantImpact 
} from '@/types';
import {
  AVG_MEAL_WEIGHT_KG,
  CO2_PER_KG_FOOD_KG,
  co2KgToTrees,
  mealsToCo2Kg,
} from '@/lib/impactCalculations';

/**
 * Get global platform impact statistics
 */
export const getGlobalImpact = async (): Promise<ApiResponse<ImpactStats>> => {
  if (!isSupabaseConfigured()) {
    // Return mock data for development
    const mockTotalMeals = 25000;
    return {
      data: {
        total_food_saved_kg: 12500,
        total_money_saved_xaf: 8750000,
        total_co2_avoided_kg: Math.round(mealsToCo2Kg(mockTotalMeals)),
        total_meals_saved: mockTotalMeals,
        total_orders: 18500,
        total_merchants: 245,
        total_users: 12800,
      },
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();

  try {
    // Get aggregated impact from completed orders
    const { data: orders, error: ordersError } = await client
      .from(DB_TABLES.ORDERS)
      .select('quantity, savings, food_items(original_price)')
      .eq('status', 'completed');

    if (ordersError) throw ordersError;

    // Get counts
    const { count: merchantCount } = await client
      .from(DB_TABLES.MERCHANTS)
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: userCount } = await client
      .from(DB_TABLES.PROFILES)
      .select('id', { count: 'exact', head: true });

    // Calculate totals
    const totalMeals = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
    const totalSavings = orders?.reduce((sum, o) => sum + (o.savings || 0), 0) || 0;
    const totalFoodKg = totalMeals * AVG_MEAL_WEIGHT_KG;
    const totalCO2 = mealsToCo2Kg(totalMeals);

    return {
      data: {
        total_food_saved_kg: Math.round(totalFoodKg),
        total_money_saved_xaf: totalSavings,
        total_co2_avoided_kg: Math.round(totalCO2),
        total_meals_saved: totalMeals,
        total_orders: orders?.length || 0,
        total_merchants: merchantCount || 0,
        total_users: userCount || 0,
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

/**
 * Calculate CO2 impact for a specific order/item
 */
export const calculateCO2Impact = async (params: {
  quantity: number;
  weight_kg?: number;
}): Promise<ApiResponse<{ co2_avoided_kg: number; trees_equivalent: number }>> => {
  const weightKg = params.weight_kg || params.quantity * AVG_MEAL_WEIGHT_KG;
  const co2Avoided = weightKg * CO2_PER_KG_FOOD_KG;

  return {
    data: {
      co2_avoided_kg: Math.round(co2Avoided * 100) / 100,
      trees_equivalent: co2KgToTrees(co2Avoided),
    },
    error: null,
    success: true,
  };
};

/**
 * Get impact leaderboard
 */
export const getImpactLeaderboard = async (
  type: 'users' | 'merchants',
  limit: number = 10
): Promise<ApiResponse<Array<{ id: string; name: string; impact_score: number }>>> => {
  if (!isSupabaseConfigured()) {
    // Return mock data
    const mockData = type === 'users'
      ? [
          { id: '1', name: 'Marie K.', impact_score: 125 },
          { id: '2', name: 'Jean P.', impact_score: 98 },
          { id: '3', name: 'Sophie M.', impact_score: 87 },
        ]
      : [
          { id: '1', name: 'Boulangerie du Quartier', impact_score: 450 },
          { id: '2', name: 'Restaurant Le Baobab', impact_score: 380 },
          { id: '3', name: 'Pâtisserie Libreville', impact_score: 320 },
        ];

    return {
      data: mockData,
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();

  try {
    if (type === 'users') {
      // Get top users by rescued meal count
      const { data, error } = await client
        .from(DB_TABLES.ORDERS)
        .select('user_id, quantity, profiles(full_name)')
        .eq('status', 'completed');

      if (error) throw error;

      // Aggregate by user
      const userScores = data?.reduce((acc, order: any) => {
        const userId = order.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            id: userId,
            name: order.profiles?.full_name || 'Utilisateur',
            meals: 0,
          };
        }
        acc[userId].meals += order.quantity || 0;
        return acc;
      }, {} as Record<string, { id: string; name: string; meals: number }>) || {};

      const leaderboard = Object.values(userScores)
        .map((u: any) => ({ id: u.id, name: u.name, impact_score: u.meals * AVG_MEAL_WEIGHT_KG }))
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, limit);

      return { data: leaderboard, error: null, success: true };
    } else {
      // Get top merchants by order count
      const { data, error } = await client
        .from(DB_TABLES.ORDERS)
        .select('merchant_id, quantity, merchants(business_name)')
        .eq('status', 'completed');

      if (error) throw error;

      // Aggregate by merchant
      const merchantScores = data?.reduce((acc, order: any) => {
        const merchantId = order.merchant_id;
        if (!acc[merchantId]) {
          acc[merchantId] = {
            id: merchantId,
            name: order.merchants?.business_name || 'Commerçant',
            total: 0,
          };
        }
        acc[merchantId].total += order.quantity || 0;
        return acc;
      }, {} as Record<string, { id: string; name: string; total: number }>) || {};

      const leaderboard = Object.values(merchantScores)
        .map((m: any) => ({ id: m.id, name: m.name, impact_score: m.total * AVG_MEAL_WEIGHT_KG }))
        .sort((a, b) => b.impact_score - a.impact_score)
        .slice(0, limit);

      return { data: leaderboard, error: null, success: true };
    }
  } catch (error: any) {
    return {
      data: null,
      error: { code: 'FETCH_ERROR', message: error.message },
      success: false,
    };
  }
};

/**
 * Log impact for analytics
 */
export const logImpact = async (impactData: {
  user_id?: string;
  merchant_id: string;
  order_id: string;
  food_saved_kg: number;
  money_saved_xaf: number;
  co2_avoided_kg: number;
}): Promise<ApiResponse<null>> => {
  if (!isSupabaseConfigured()) {
    return { data: null, error: null, success: true };
  }

  const client = requireSupabaseClient();
  const { error } = await client
    .from(DB_TABLES.IMPACT_LOGS)
    .insert({
      ...impactData,
      created_at: new Date().toISOString(),
    });

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
 * Generate impact report for a period
 */
export const generateImpactReport = async (params: {
  start_date: string;
  end_date: string;
  merchant_id?: string;
}): Promise<ApiResponse<{
  period: { start: string; end: string };
  stats: ImpactStats;
  daily_breakdown: Array<{ date: string; meals_saved: number; co2_avoided: number }>;
}>> => {
  if (!isSupabaseConfigured()) {
    // Return mock report
    return {
      data: {
        period: { start: params.start_date, end: params.end_date },
        stats: {
          total_food_saved_kg: 500,
          total_money_saved_xaf: 350000,
          total_co2_avoided_kg: 1250,
          total_meals_saved: 1000,
          total_orders: 850,
          total_merchants: 15,
          total_users: 450,
        },
        daily_breakdown: [
          { date: '2024-01-01', meals_saved: 45, co2_avoided: 56.25 },
          { date: '2024-01-02', meals_saved: 52, co2_avoided: 65 },
          { date: '2024-01-03', meals_saved: 38, co2_avoided: 47.5 },
        ],
      },
      error: null,
      success: true,
    };
  }

  const client = requireSupabaseClient();

  try {
    let query = client
      .from(DB_TABLES.ORDERS)
      .select('quantity, savings, created_at')
      .eq('status', 'completed')
      .gte('created_at', params.start_date)
      .lte('created_at', params.end_date);

    if (params.merchant_id) {
      query = query.eq('merchant_id', params.merchant_id);
    }

    const { data: orders, error } = await query;

    if (error) throw error;

    // Calculate totals
    const totalMeals = orders?.reduce((sum, o) => sum + (o.quantity || 0), 0) || 0;
    const totalSavings = orders?.reduce((sum, o) => sum + (o.savings || 0), 0) || 0;
    const totalFoodKg = totalMeals * AVG_MEAL_WEIGHT_KG;
    const totalCO2 = mealsToCo2Kg(totalMeals);

    // Group by day
    const dailyData = orders?.reduce((acc, order: any) => {
      const date = order.created_at.split('T')[0];
      if (!acc[date]) {
        acc[date] = { meals: 0 };
      }
      acc[date].meals += order.quantity || 0;
      return acc;
    }, {} as Record<string, { meals: number }>) || {};

    const dailyBreakdown = Object.entries(dailyData).map(([date, data]: [string, any]) => ({
      date,
      meals_saved: data.meals,
      co2_avoided: mealsToCo2Kg(data.meals),
    }));

    return {
      data: {
        period: { start: params.start_date, end: params.end_date },
        stats: {
          total_food_saved_kg: Math.round(totalFoodKg),
          total_money_saved_xaf: totalSavings,
          total_co2_avoided_kg: Math.round(totalCO2),
          total_meals_saved: totalMeals,
          total_orders: orders?.length || 0,
          total_merchants: 0,
          total_users: 0,
        },
        daily_breakdown: dailyBreakdown,
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
