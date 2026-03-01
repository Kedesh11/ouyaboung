-- ============================================
-- Performance Indexes (Phase 1)
-- Date: 2026-02-28
-- ============================================

-- Orders: most frequent filters/sorts for user, merchant and QR validation.
create index if not exists idx_orders_user_status_created_at
  on public.orders (user_id, status, created_at desc);

create index if not exists idx_orders_merchant_status_created_at
  on public.orders (merchant_id, status, created_at desc);

create index if not exists idx_orders_merchant_pickup_code_unconsumed
  on public.orders (merchant_id, pickup_code)
  where consumed_at is null;

-- Public inventory/search feeds.
create index if not exists idx_food_items_available_created_at
  on public.food_items (created_at desc)
  where is_available = true and quantity_available > 0;

create index if not exists idx_food_items_category_price_created_at
  on public.food_items (category, discounted_price, created_at desc)
  where is_available = true and quantity_available > 0;

-- Merchant listing and public filters.
create index if not exists idx_merchants_public_filters
  on public.merchants (is_verified, is_active, city, business_type);

-- Notifications center.
create index if not exists idx_notifications_user_read_created_at
  on public.notifications (user_id, is_read, created_at desc);

-- Transactions dashboards (admin/user/merchant).
create index if not exists idx_transactions_merchant_created_at
  on public.transactions (merchant_id, created_at desc);

create index if not exists idx_transactions_user_created_at
  on public.transactions (user_id, created_at desc);

create index if not exists idx_transactions_reference_status
  on public.transactions (reference, status);

-- Keep planner statistics fresh after index rollout.
analyze public.orders;
analyze public.food_items;
analyze public.merchants;
analyze public.notifications;
analyze public.transactions;
