import type { Merchant, Farmer } from '@/types';

export const isMerchantPubliclyAvailable = (merchant: Merchant | null | undefined): boolean =>
  Boolean(merchant?.is_verified && merchant?.is_active && !merchant?.is_refused);

export const isFarmerPubliclyAvailable = (farmer: Farmer | null | undefined): boolean =>
  Boolean(farmer?.is_verified && farmer?.is_active && !farmer?.is_refused);
