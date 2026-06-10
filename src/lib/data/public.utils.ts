import type { Merchant } from '@/types';

export const isMerchantPubliclyAvailable = (merchant: Merchant | null | undefined): boolean =>
  Boolean(merchant?.is_verified && merchant?.is_active && !merchant?.is_refused);
