-- ============================================
-- QR validation compatibility + performance
-- Date: 2026-02-28
-- ============================================

alter table public.orders
  add column if not exists pickup_code_normalized text
  generated always as (
    regexp_replace(upper(coalesce(pickup_code, '')), '[^A-Z0-9]', '', 'g')
  ) stored;

create index if not exists idx_orders_merchant_pickup_normalized_unconsumed
  on public.orders (merchant_id, pickup_code_normalized)
  where consumed_at is null;

comment on column public.orders.pickup_code_normalized is
  'Normalized pickup code (A-Z0-9 only) used for robust QR lookup across legacy/new formats';

analyze public.orders;
