// ============================================
// Impact Service - Environmental Impact Business Logic
// ouyaboung Platform - Anti-gaspillage alimentaire
// ============================================

import {
  getUserImpact,
  getMerchantImpact,
  getUserMonthlyImpact as getUserMonthlyImpactApi,
} from '@/api';
import type { ApiResponse, UserImpact, MerchantImpact } from '@/types';


/**
 * Get user's personal impact
 */
export const getUserStats = async (userId: string): Promise<ApiResponse<UserImpact>> => {
  return getUserImpact(userId);
};

/**
 * Get merchant's impact statistics
 */
export const getMerchantStats = async (
  merchantId: string
): Promise<ApiResponse<MerchantImpact>> => {
  return getMerchantImpact(merchantId);
};

/**
 * Get user's monthly impact (last N months)
 */
export const getUserMonthlyImpact = async (
  userId: string,
  months: number = 4
): Promise<ApiResponse<Array<{ month: string; meals: number; co2: number }>>> => {
  return getUserMonthlyImpactApi(userId, months);
};

