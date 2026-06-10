import { describe, expect, it } from 'vitest';
import { isMerchantPubliclyAvailable } from '@/lib/data/public.utils';
import type { Merchant } from '@/types';

const baseMerchant = {
  id: 'm-1',
  user_id: 'u-1',
  business_name: 'Test Shop',
  business_type: 'bakery',
  address: 'Rue 1',
  city: 'Libreville',
  quartier: 'Centre',
  phone: '060000000',
  email: 'shop@test.ga',
  rating: 4,
  total_reviews: 1,
  slug: 'test-shop',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as Merchant;

describe('isMerchantPubliclyAvailable', () => {
  it('returns true for verified active merchants', () => {
    expect(
      isMerchantPubliclyAvailable({
        ...baseMerchant,
        is_verified: true,
        is_active: true,
        is_refused: false,
      })
    ).toBe(true);
  });

  it('returns false for unverified or refused merchants', () => {
    expect(
      isMerchantPubliclyAvailable({
        ...baseMerchant,
        is_verified: false,
        is_active: true,
        is_refused: false,
      })
    ).toBe(false);

    expect(
      isMerchantPubliclyAvailable({
        ...baseMerchant,
        is_verified: true,
        is_active: true,
        is_refused: true,
      })
    ).toBe(false);
  });
});
